/**
 * WHATSAPP WEBHOOK PROCESSOR — inbound messages & delivery statuses.
 *
 * Pipeline: Meta → webhook route → signature verification → this module:
 *   find connection (by phoneNumberId) → find/create conversation (tenant +
 *   phone unique) → link Customer when phone matches → insert message
 *   (externalMessageId UNIQUE = idempotency for duplicate deliveries) →
 *   update conversation (preview / lastMessageAt / unreadCount).
 *
 * Unknown events are ignored safely. No secrets are ever logged.
 */
import { db } from '../db';
import { normalizePhoneNumber } from '../phone';

export interface InboundProcessingResult {
  processed: number;
  statuses: number;
  skipped: number;
}

/** Extract the text body of any supported message payload (text today). */
function extractText(msg: any): { type: string; text: string | null } {
  if (msg?.type === 'text' && typeof msg.text?.body === 'string') {
    return { type: 'TEXT', text: msg.text.body };
  }
  // Media/document/template types are stored typed (no text) — ready for
  // richer rendering later without schema changes.
  const t = typeof msg?.type === 'string' ? msg.type.toUpperCase() : 'UNKNOWN';
  return { type: t, text: null };
}

/** Match an existing CRM customer by phone (exact wa_id or normalized). */
async function findCustomer(companyId: string, waId: string) {
  const candidates = [waId, normalizePhoneNumber('+' + waId)].filter(Boolean);
  for (const phone of candidates) {
    const c = await db.customer.findFirst({ where: { companyId, phone } });
    if (c) return c;
  }
  return null;
}

async function ensureConnectionWebhookTs(connectionId: string) {
  try {
    await db.whatsAppConnection.update({
      where: { id: connectionId },
      data: { lastWebhookAt: new Date() },
    });
  } catch {
    /* non-fatal */
  }
}

/** Process one parsed webhook body. Errors never leak; result is counters. */
export async function processWebhookPayload(
  payload: any,
  /** limit processing to a known connection id (defense in depth) */
  allowedConnectionIds?: Set<string>
): Promise<InboundProcessingResult> {
  const result: InboundProcessingResult = { processed: 0, statuses: 0, skipped: 0 };
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value) continue;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const conn = await db.whatsAppConnection.findFirst({
        where: { phoneNumberId, status: { not: 'DISCONNECTED' } },
      });
      if (!conn || (allowedConnectionIds && !allowedConnectionIds.has(conn.id))) {
        result.skipped++;
        continue;
      }
      await ensureConnectionWebhookTs(conn.id);

      // ── Inbound messages ──
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      for (const msg of messages) {
        const wamid = typeof msg?.id === 'string' ? msg.id : null;
        const from = typeof msg?.from === 'string' ? msg.from : null;
        if (!wamid || !from) {
          result.skipped++;
          continue;
        }
        const { type, text } = extractText(msg);
        const ts = typeof msg?.timestamp === 'string' && /^\d+$/.test(msg.timestamp)
          ? new Date(Number(msg.timestamp) * 1000)
          : new Date();

        // Idempotency: the unique externalMessageId makes duplicate webhook
        // deliveries a no-op.
        const existing = await db.whatsAppMessage.findUnique({ where: { externalMessageId: wamid } });
        if (existing) {
          result.skipped++;
          continue;
        }

        const customer = await findCustomer(conn.companyId, from);
        const conv = await db.whatsAppConversation.upsert({
          where: {
            companyId_connectionId_customerPhone: {
              companyId: conn.companyId,
              connectionId: conn.id,
              customerPhone: from,
            },
          },
          create: {
            companyId: conn.companyId,
            connectionId: conn.id,
            customerId: customer?.id ?? null,
            customerPhone: from,
            customerName: customer?.fullName ?? null,
            status: 'OPEN',
          },
          update: {},
        });

        try {
          await db.whatsAppMessage.create({
            data: {
              companyId: conn.companyId,
              conversationId: conv.id,
              connectionId: conn.id,
              externalMessageId: wamid,
              direction: 'INBOUND',
              messageType: type,
              text,
              status: 'RECEIVED',
              senderPhone: from,
              recipientPhone: conn.phoneNumberId,
            },
          });
        } catch {
          // Unique violation race → duplicate webhook delivery, safe to skip
          result.skipped++;
          continue;
        }

        const preview = (text || `[${type}]`).slice(0, 120);
        await db.whatsAppConversation.update({
          where: { id: conv.id },
          data: {
            lastMessageAt: ts,
            lastMessagePreview: preview,
            unreadCount: { increment: 1 },
            customerName: customer?.fullName ?? conv.customerName,
            customerId: customer?.id ?? conv.customerId,
          },
        });
        await db.whatsAppConnection.update({
          where: { id: conn.id },
          data: { lastMessageAt: ts },
        });
        result.processed++;
      }

      // ── Delivery statuses ──
      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
      for (const st of statuses) {
        const wamid = typeof st?.id === 'string' ? st.id : null;
        const status = typeof st?.status === 'string' ? st.status.toUpperCase() : null;
        if (!wamid || !status) {
          result.skipped++;
          continue;
        }
        const mapped =
          status === 'SENT' ? 'SENT' : status === 'DELIVERED' ? 'DELIVERED' : status === 'READ' ? 'READ' : status === 'FAILED' ? 'FAILED' : null;
        if (!mapped) {
          result.skipped++;
          continue;
        }
        const updated = await db.whatsAppMessage.updateMany({
          where: { externalMessageId: wamid, companyId: conn.companyId, direction: 'OUTBOUND' },
          data: { status: mapped },
        });
        if (updated.count === 0) result.skipped++;
        else result.statuses++;
      }
    }
  }
  return result;
}
