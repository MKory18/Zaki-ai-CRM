/**
 * TELEGRAM INBOUND PIPELINE
 *
 * Telegram webhook → secret verification (route) → this module:
 *   resolve source (topic-exact → group-level) → idempotent message insert
 *   (DB unique = source of truth) → deterministic parse → validation →
 *   product matching (tenant-scoped) → existing-order-creation transaction
 *   → audit-safe status updates.
 *
 * Unknown chats are silently ignored. No secrets are ever logged. Errors
 * never fail the webhook with sensitive details — Telegram may retry 5xx,
 * so permanent failures are recorded as FAILED instead of thrown.
 */
import { db } from '../db';
import { normalizePhoneNumber } from '../phone';
import { matchProduct, normalizeArabic } from '../order-parser';
import { parseTelegramOrderMessage } from './parser';
import { createTelegramOrder } from './order-creation';

const RECENT_MESSAGE_WINDOW_MS = 24 * 60 * 60 * 1000; // ignore stale updates

export interface TelegramInboundResult {
  handled: boolean; // false = event type not processed as an order
  status?: 'PROCESSED' | 'IGNORED' | 'NEEDS_REVIEW' | 'FAILED' | 'DUPLICATE' | 'NO_SOURCE' | 'NON_TEXT';
  reason?: string;
}

/** Update-update envelope types we accept. */
const SUPPORTED_UPDATE_KEYS = ['message', 'edited_message', 'channel_post', 'edited_channel_post'] as const;

interface NormalizedUpdate {
  chatId: string;
  chatType: string;
  chatTitle?: string;
  messageId: string;
  threadId?: number;
  threadName?: string;
  senderUserId?: string;
  senderUsername?: string;
  senderName?: string;
  text?: string;
  date?: Date;
  isEdited: boolean;
}

/** Extract + validate the message envelope from any supported update shape. */
function normalizeUpdate(update: any): NormalizedUpdate | null {
  for (const key of SUPPORTED_UPDATE_KEYS) {
    const msg = update?.[key];
    if (!msg || typeof msg !== 'object') continue;
    const chat = msg.chat;
    const messageId = msg.message_id;
    if (!chat || (typeof chat.id !== 'number' && typeof chat.id !== 'string')) return null;
    if (typeof messageId !== 'number' && typeof messageId !== 'string') return null;
    const type = typeof chat.type === 'string' ? chat.type : 'unknown';
    // Only group-like chats are processed as order sources in this phase
    if (!['group', 'supergroup', 'channel'].includes(type)) return null;
    const sender = msg.from;
    return {
      chatId: String(chat.id),
      chatType: type,
      chatTitle: typeof chat.title === 'string' ? chat.title : undefined,
      messageId: String(messageId),
      threadId: typeof msg.message_thread_id === 'number' ? msg.message_thread_id : undefined,
      senderUserId: sender?.id !== undefined ? String(sender.id) : undefined,
      senderUsername: typeof sender?.username === 'string' ? sender.username : undefined,
      senderName:
        typeof sender?.first_name === 'string'
          ? [sender.first_name, sender.last_name].filter(Boolean).join(' ')
          : undefined,
      text: typeof msg.text === 'string' ? msg.text : typeof msg.caption === 'string' ? msg.caption : undefined,
      date: typeof msg.date === 'number' ? new Date(msg.date * 1000) : undefined,
      isEdited: key.startsWith('edited'),
    };
  }
  return null;
}

/** Resolve the source for a message: exact topic mapping first, then group-level. */
async function resolveSource(chatId: string, threadId?: number) {
  if (threadId !== undefined) {
    const topic = await db.telegramSource.findFirst({
      where: { chatId, topicId: threadId, isActive: true },
    });
    if (topic) return topic;
  }
  return db.telegramSource.findFirst({ where: { chatId, topicId: null, isActive: true } });
}

/**
 * Process one Telegram update. Never throws for expected conditions.
 */
export async function processTelegramUpdate(update: unknown): Promise<TelegramInboundResult> {
  const norm = normalizeUpdate(update);
  // Unsupported events (private chats, non-text, unsupported types) → ignore
  if (!norm || !norm.text || !norm.text.trim()) {
    return { handled: false };
  }
  // Edited messages are never re-processed into orders (phase 1 policy)
  if (norm.isEdited) {
    return { handled: false };
  }
  // Old messages (clock-skew / replayed backfills) are ignored
  if (norm.date && Date.now() - norm.date.getTime() > RECENT_MESSAGE_WINDOW_MS) {
    return { handled: false };
  }

  // ── Source resolution: tenant comes from the DB mapping, never the payload ──
  const source = await resolveSource(norm.chatId, norm.threadId);
  if (!source) {
    return { handled: false, status: 'NO_SOURCE' };
  }
  const companyId = source.companyId;

  // ── Idempotency: unique(companyId, chatId, messageId) is the source of truth ──
  let message;
  try {
    message = await db.telegramMessage.create({
      data: {
        companyId,
        sourceId: source.id,
        chatId: norm.chatId,
        messageId: norm.messageId,
        threadId: norm.threadId ?? null,
        threadName: source.topicName ?? null,
        senderUserId: norm.senderUserId ?? null,
        senderUsername: norm.senderUsername ?? null,
        senderName: norm.senderName ?? null,
        text: norm.text.slice(0, 4000),
        messageType: 'TEXT',
        processingStatus: 'PENDING',
      },
    });
  } catch {
    // Unique violation → duplicate webhook delivery; no second order, ever.
    return { handled: true, status: 'DUPLICATE' };
  }

  try {
    const result = await processStoredMessage(message.id);
    return { handled: true, status: result.status, reason: result.reason };
  } catch (e) {
    // Persist a safe failure state — Telegram must not retry-spam duplicates
    await db.telegramMessage.update({
      where: { id: message.id },
      data: { processingStatus: 'FAILED', internalError: 'PROCESSING_ERROR', processedAt: new Date() },
    }).catch(() => undefined);
    return { handled: true, status: 'FAILED' };
  }
}

export interface StoredProcessingResult {
  status: 'PROCESSED' | 'IGNORED' | 'NEEDS_REVIEW' | 'FAILED';
  reason?: string;
  orderId?: string;
}

/**
 * Core processing for one stored TelegramMessage. Idempotent: only a message
 * still in PENDING state is processed (retry endpoint reuses this safely).
 */
export async function processStoredMessage(messageId: string): Promise<StoredProcessingResult> {
  const message = await db.telegramMessage.findUnique({ where: { id: messageId } });
  if (!message) return { status: 'FAILED', reason: 'NOT_FOUND' };
  if (message.processingStatus === 'PROCESSED') {
    return { status: 'PROCESSED', reason: 'ALREADY_PROCESSED', orderId: message.orderId ?? undefined };
  }
  if (message.orderId) {
    // Reprocessing guard: linked order exists → mark processed, never duplicate
    await db.telegramMessage.update({
      where: { id: message.id },
      data: { processingStatus: 'PROCESSED', processedAt: new Date(), reviewReason: null, internalError: null },
    });
    return { status: 'PROCESSED', orderId: message.orderId };
  }

  const companyId = message.companyId;
  const parsed = parseTelegramOrderMessage(message.text ?? '');

  // ── Non-order → IGNORED ──
  if (!parsed.isOrder) {
    await db.telegramMessage.update({
      where: { id: message.id },
      data: { processingStatus: 'IGNORED', processedAt: new Date() },
    });
    return { status: 'IGNORED' };
  }

  // ── Field validation (server-side; never trusts message content for
  //    companyId/productId/price/status/total) ──
  const review: (reason: string) => Promise<StoredProcessingResult> = async (reason) => {
    await db.telegramMessage.update({
      where: { id: message.id },
      data: { processingStatus: 'NEEDS_REVIEW', reviewReason: reason, processedAt: new Date() },
    });
    return { status: 'NEEDS_REVIEW', reason };
  };

  const customerName = parsed.customerName?.trim();
  if (!customerName || customerName.length < 2) return review('MISSING_CUSTOMER_NAME');

  const phone = parsed.phone ? normalizePhoneNumber(parsed.phone) : '';
  if (!phone || phone.length < 7 || phone.length > 15) return review('INVALID_PHONE');

  const address = parsed.address?.trim();
  if (!address) return review('MISSING_ADDRESS');

  const quantity = parsed.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return review('INVALID_QUANTITY');

  const productText = parsed.productText?.trim();
  if (!productText) return review('MISSING_PRODUCT');

  // ── Product matching (same-company only) ──
  const products = await db.product.findMany({
    where: { companyId, status: 'ACTIVE' },
    select: { id: true, name: true, nameEn: true, sku: true, basePrice: true, image: true },
  });
  const q = normalizeArabic(productText);
  const exact = products.find(
    (p) => normalizeArabic(p.name) === q || (p.nameEn && normalizeArabic(p.nameEn) === q) || normalizeArabic(p.sku) === q
  );
  const contains = !exact ? products.filter((p) => normalizeArabic(p.name).includes(q) || q.includes(normalizeArabic(p.name))) : [];
  let product = null;
  if (exact) {
    product = exact;
  } else if (contains.length === 1) {
    product = contains[0];
  } else if (contains.length > 1) {
    return review('AMBIGUOUS_PRODUCT');
  } else {
    const fuzzy = matchProduct(productText, products.map((p) => ({ id: p.id, name: p.name, sku: p.sku })));
    if (!fuzzy) return review('PRODUCT_NOT_FOUND');
    product = products.find((p) => p.id === fuzzy.id)!;
  }

  // ── Customer matching / creation (same company only) ──
  let customer = await db.customer.findUnique({ where: { companyId_phone: { companyId, phone } } });
  if (!customer) {
    try {
      customer = await db.customer.create({
        data: {
          companyId,
          fullName: customerName.slice(0, 80),
          phone,
          rawPhone: parsed.phone!.slice(0, 20),
          address: address.slice(0, 200),
          city: (parsed.city?.trim() || address).slice(0, 60),
          totalOrders: 0,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        customer = await db.customer.findUnique({ where: { companyId_phone: { companyId, phone } } });
      }
      if (!customer) return review('INVALID_PHONE');
    }
  }

  // ── Order creation via the shared ingestion service (server-set price/status) ──
  const created = await createTelegramOrder({
    companyId,
    customer,
    product,
    quantity,
    address,
    city: parsed.city?.trim(),
    notes: parsed.notes,
    telegram: {
      messageId: message.messageId,
      chatId: message.chatId,
      threadId: message.threadId ?? null,
      chatTitle: message.threadName ?? undefined,
    },
  });

  if (!created.ok) {
    return review(created.reason!);
  }

  await db.telegramMessage.update({
    where: { id: message.id },
    data: { processingStatus: 'PROCESSED', orderId: created.orderId!, processedAt: new Date(), reviewReason: null },
  });

  return { status: 'PROCESSED', orderId: created.orderId! };
}
