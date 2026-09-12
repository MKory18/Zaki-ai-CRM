/**
 * TELEGRAM ORDER CREATION SERVICE
 *
 * Mirrors the existing order-creation transaction (POST /api/orders) so
 * Telegram orders obey the exact same business rules: server-set price
 * (product.basePrice), server-set statuses, sequential order number with
 * P2002 retry, customer counters, activity timeline, status log, and the
 * claimable-queue workflow entry point.
 *
 * The Telegram caller can NEVER influence price, status, total, or
 * companyId — only the extracted quantity/notes, already validated.
 */
import { db } from '../db';
import { logAudit } from '../audit';
import { createNotification } from '../notification';

export interface CreateTelegramOrderInput {
  companyId: string;
  customer: { id: string; firstOrderDate: Date | null; totalOrders: number };
  product: { id: string; name: string; image: string | null; basePrice: number };
  quantity: number;
  address: string;
  city?: string;
  notes?: string;
  telegram: {
    messageId: string;
    chatId: string;
    threadId: number | null;
    chatTitle?: string;
  };
}

export type CreateTelegramOrderResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; reason: 'NO_SYSTEM_ACTOR' | 'CREATION_FAILED' | 'PRODUCT_NOT_FOUND' };

/**
 * Resolve a company user to act as the bookkeeping actor for
 * OrderStatusLog (changedById is NOT NULL in the schema). This is a
 * server-resolved system actor — never a client-supplied identity.
 */
async function resolveSystemActor(companyId: string) {
  const admin = await db.user.findFirst({
    where: { companyId, role: 'COMPANY_ADMIN', status: 'ACTIVE' },
    select: { id: true, role: true },
  });
  if (admin) return admin;
  return db.user.findFirst({
    where: { companyId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    select: { id: true, role: true },
  });
}

export async function createTelegramOrder(input: CreateTelegramOrderInput): Promise<CreateTelegramOrderResult> {
  const actor = await resolveSystemActor(input.companyId);
  if (!actor) return { ok: false, reason: 'NO_SYSTEM_ACTOR' };

  const { companyId, customer, product, quantity, address, notes, telegram } = input;

  // Server-authoritative pricing — Telegram-provided prices are ignored by design
  const price = product.basePrice;
  const shipCost = 0;
  const totalAmount = price;

  const productRow = await db.product.findFirst({
    where: { id: product.id, companyId },
    include: { batches: { where: { companyId }, orderBy: { productionDate: 'desc' }, take: 1 } },
  });
  if (!productRow) return { ok: false, reason: 'PRODUCT_NOT_FOUND' };

  const unitCost = productRow.batches[0]?.costPerUnit || 0;
  const estimatedCostOfGoods = Number((unitCost * quantity).toFixed(2));
  const now = new Date();

  try {
    const order = await db.$transaction(async (tx) => {
      let created: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const count = await tx.order.count({ where: { companyId } });
          const orderNumber = `ORD-${now.getFullYear()}-${String(count + 1 + attempt).padStart(4, '0')}`;
          created = await tx.order.create({
            data: {
              companyId,
              orderNumber,
              customerId: customer.id,
              productId: productRow.id,
              quantity,
              sellingPrice: price,
              shippingCost: shipCost,
              totalAmount,
              currency: 'USD',
              moderatorId: null,
              moderatorCommission: 0,
              estimatedCostOfGoods,
              productNameSnapshot: productRow.name,
              productImageSnapshot: productRow.image || null,
              status: 'NEW',
              confirmationStatus: 'NEW',
              shippingStatus: 'NOT_READY',
              settlementStatus: 'NOT_APPLICABLE',
              assignedToId: null,
              claimedById: null,
              currentOwnerId: null,
              signatureStatus: 'UNSIGNED',
              version: 1,
              source: 'Telegram',
              customerNotes: notes?.trim()?.slice(0, 500) || null,
              internalNotes: `Telegram: chat ${telegram.chatId}${telegram.threadId ? ` topic ${telegram.threadId}` : ''} msg ${telegram.messageId}`,
            },
          });
          break;
        } catch (e: any) {
          if (e?.code === 'P2002' && attempt < 4) continue;
          throw e;
        }
      }
      if (!created) throw new Error('Failed to generate a unique order number');

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: { increment: 1 },
          lastOrderDate: now,
          firstOrderDate: customer.firstOrderDate || now,
        },
      });

      await tx.orderActivity.create({
        data: {
          companyId,
          orderId: created.id,
          userId: actor.id,
          action: 'ORDER_CREATED',
          newStatus: 'NEW',
          metadata: JSON.stringify({
            source: 'Telegram',
            telegramMessageId: telegram.messageId,
            telegramChatId: telegram.chatId,
            telegramThreadId: telegram.threadId,
          }),
        },
      });

      await tx.orderStatusLog.create({
        data: {
          companyId,
          orderId: created.id,
          statusType: 'CONFIRMATION',
          previousValue: null,
          newValue: 'NEW',
          changedById: actor.id,
          changedByRole: actor.role,
          note: 'Order created automatically from Telegram group message',
        },
      });

      return created;
    });

    await logAudit({
      companyId,
      userId: actor.id,
      action: 'ORDER_CREATED_TELEGRAM',
      entity: 'Order',
      entityId: order.id,
      newData: {
        orderNumber: (order as any).orderNumber,
        source: 'Telegram',
        telegramMessageId: telegram.messageId,
        telegramChatId: telegram.chatId,
        telegramThreadId: telegram.threadId,
      },
    });

    try {
      await createNotification({
        companyId,
        userId: null,
        title: 'طلب جديد من تيليجرام',
        message: `تم إنشاء طلب جديد #${(order as any).orderNumber} تلقائيًا من تيليجرام.`,
        type: 'ORDER_NEW',
        link: '/orders',
      });
    } catch {
      /* non-fatal */
    }

    return { ok: true, orderId: order.id, orderNumber: (order as any).orderNumber };
  } catch (e) {
    console.error('[telegram] order creation failed:', (e as Error)?.name || 'unknown');
    return { ok: false, reason: 'CREATION_FAILED' };
  }
}
