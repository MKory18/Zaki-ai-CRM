import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { assertOrderAccess, orderVisibilityWhere } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { normalizePhoneNumber } from '@/lib/phone';
import { CONFIRMATION_STATUSES } from '@/lib/confirmation-workflow';
import { SHIPPING_STATUSES } from '@/lib/shipping-workflow';
import { apiError } from '@/lib/api-error';
import { createNotification } from '@/lib/notification';
import { authorize } from '@/lib/authorization';

/** Legacy combined status whitelist (mirrors the UI status config) */
const ALLOWED_COMBINED_STATUSES = [
  'NEW', 'CONTACTING', 'NO_ANSWER', 'POSTPONED', 'CONFIRMED', 'REJECTED', 'CANCELLED',
  'READY_FOR_SHIPPING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY',
  'RETURN_REQUESTED', 'RETURNED',
] as const;

/** Terminal combined statuses that notify company managers */
const TERMINAL_STATUSES = ['CONFIRMED', 'REJECTED', 'CANCELLED'] as const;

const parseableDate = z
  .string()
  .refine((v) => !isNaN(new Date(v).getTime()), { message: 'Invalid date' });

const patchSchema = z.object({
  status: z.enum(ALLOWED_COMBINED_STATUSES).optional(),
  moderatorId: z.string().max(64).optional().nullable(),
  internalNotes: z.string().trim().max(500).optional().nullable(),
  customerNotes: z.string().trim().max(500).optional().nullable(),
  // Customer fields are validated when present (trimmed strings)
  customerName: z.string().trim().min(2).max(80).optional(),
  customerPhone: z.string().trim().min(7).max(20).optional(),
  customerAddress: z.string().trim().max(300).optional(),
  postponedUntil: parseableDate.nullable().optional(),
  trackingCode: z.string().trim().max(100).optional().nullable(),
  confirmationStatus: z.enum(CONFIRMATION_STATUSES).optional(),
  shippingStatus: z.enum(SHIPPING_STATUSES).optional(),
  // Order line editing — validated then persisted (mirrors POST caps)
  sellingPrice: z.coerce.number().finite().min(0).max(100000).optional(),
  quantity: z.coerce.number().int().finite().min(1).max(10000).optional(),
  discountAmount: z.coerce.number().finite().min(0).max(100000).optional(),
  shippingCost: z.coerce.number().finite().min(0).max(1000).optional(),
  productId: z.string().min(10).max(64).optional(),
  expectedVersion: z.number().optional(),
});

/**
 * Builds the same WHERE clause used by the orders list API (/api/orders)
 * so prev/next navigation matches the exact list context (filters + tenant + RBAC).
 */
async function buildNavigationWhere(order: { createdAt: Date; companyId: string }, searchParams: URLSearchParams) {
  const { user, companyId } = await requireCompanyTenant();
  const where: any = { companyId: order.companyId };

  // RBAC: self-scoped roles navigate within their own visibility envelope
  // (same orderVisibilityWhere used by the list API's queue filtering)
  const SELF_SCOPED = ['MODERATOR', 'CONFIRMATION_AGENT', 'FOLLOW_UP_AGENT'];
  if (SELF_SCOPED.includes(user.role)) {
    const visibility = orderVisibilityWhere(user);
    if (Object.keys(visibility).length > 0) {
      return { AND: [where, visibility] };
    }
  }

  const moderatorId = searchParams.get('moderatorId')?.trim();
  if (moderatorId && moderatorId !== 'all') where.moderatorId = moderatorId;

  const status = searchParams.get('status')?.trim();
  if (status && status !== 'all') where.status = status;

  const productId = searchParams.get('productId')?.trim();
  if (productId && productId !== 'all') where.productId = productId;

  const search = searchParams.get('q')?.trim();
  if (search) {
    const normalizedSearch = normalizePhoneNumber(search);
    where.OR = [
      { orderNumber: { contains: search } },
      { customer: { fullName: { contains: search } } },
      { customer: { phone: { contains: normalizedSearch || search } } },
      { customer: { rawPhone: { contains: search } } },
    ];
  }

  return where;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);

    // ── Phase S: role-scoped access (same envelope as the list API) ──
    // Self-scoped roles may only read orders assigned/claimed/created by them
    // or claimable queue items — never another employee's private orders.
    const access = await assertOrderAccess(id, user, companyId, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found' }, { status: map[access.reason] });
    }

    const order = await db.order.findUnique({
      where: { id },
      include: {
        customer: true,
        product: true,
        offer: true,
        landingPage: { select: { id: true, name: true, slug: true } },
        landingPageOffer: { select: { id: true, name: true, quantity: true, freeQuantity: true, price: true } },
        addOns: { orderBy: { createdAt: 'asc' } },
        moderator: { select: { id: true, name: true, email: true, phone: true } },
        claimer: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        lockHolder: { select: { id: true, name: true } },
        signer: { select: { id: true, name: true } },
        claimHistory: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        },
        callLogs: {
          include: { moderator: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order || order.companyId !== companyId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Prev/next ids following the list order (createdAt DESC), scoped to the
    // same company + current list filters so navigation mirrors the list view.
    // "next" = newer (comes first in a DESC list), "previous" = older.
    let previousOrderId: string | null = null;
    let nextOrderId: string | null = null;
    try {
      const ctxWhere = await buildNavigationWhere(order, searchParams);
      const tieBreaker = { id: 'desc' as const };
      const [newer, older] = await Promise.all([
        // Nearest newer order (created after this one) → "next" in DESC list
        db.order.findFirst({
          where: {
            AND: [
              ctxWhere,
              {
                OR: [
                  { createdAt: { gt: order.createdAt } },
                  { createdAt: order.createdAt, id: { lt: id } },
                ],
              },
            ],
          },
          orderBy: [{ createdAt: 'asc' }, tieBreaker],
          select: { id: true },
        }),
        // Nearest older order (created before this one) → "previous" in DESC list
        db.order.findFirst({
          where: {
            AND: [
              ctxWhere,
              {
                OR: [
                  { createdAt: { lt: order.createdAt } },
                  { createdAt: order.createdAt, id: { gt: id } },
                ],
              },
            ],
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: { id: true },
        }),
      ]);
      nextOrderId = newer?.id ?? null;
      previousOrderId = older?.id ?? null;
    } catch {
      // Navigation is best-effort; never fail the order fetch because of it
    }

    return NextResponse.json({ order, previousOrderId, nextOrderId });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();

    // Server-side Zod validation — never trust client input
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات الطلب غير صالحة' },
        { status: 400 }
      );
    }
    const {
      status, moderatorId, internalNotes, customerNotes, postponedUntil, trackingCode,
      confirmationStatus, shippingStatus, expectedVersion,
      customerName, customerPhone, customerAddress,
      sellingPrice, quantity, discountAmount, shippingCost, productId,
    } = parsed.data;

    // ── Authorization chain: visibility/assignment (RBAC engine) → canonical
    // orders.edit permission with scope evaluation (ASSIGNED scope enforces
    // own-assignment, so no separate any/own check is needed) ──
    const access = await assertOrderAccess(id, user, companyId, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: map[access.reason] });
    }
    const existing = access.order;

    const editAuth = authorize(user, 'orders.edit', existing);
    if (!editAuth.allowed) {
      // Secure policy: out-of-scope/other-tenant orders are reported as missing
      if (editAuth.reason === 'NO_TENANT' || editAuth.reason === 'OUT_OF_SCOPE') {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'Forbidden: missing required permission orders.edit' }, { status: 403 }
      );
    }

    // ── Editing-lock enforcement: an ACTIVE foreign lock blocks edits ──
    const lockActive =
      existing.lockedById &&
      existing.lockExpiresAt &&
      new Date(existing.lockExpiresAt).getTime() > Date.now();
    if (lockActive && existing.lockedById !== user.id) {
      const holder = await db.user.findUnique({ where: { id: existing.lockedById! }, select: { name: true } });
      return NextResponse.json(
        {
          error: `This order is currently being edited by ${holder?.name ?? 'another user'}.`,
          errorAr: `هذا الطلب يتم تعديله حالياً بواسطة ${holder?.name ?? 'مستخدم آخر'}.`,
          code: 'ORDER_LOCKED',
        },
        { status: 423 }
      );
    }

    // ── Separation of duties: status-category permissions ──
    const changingCombined = status && status !== existing.status;
    const changingConfirmation = confirmationStatus !== undefined && confirmationStatus !== existing.confirmationStatus;
    const changingShipping = shippingStatus !== undefined && shippingStatus !== existing.shippingStatus;
    if (changingCombined || changingConfirmation) {
      const confirmAuth = authorize(user, 'orders.confirm', existing);
      if (!confirmAuth.allowed) {
        return NextResponse.json(
          { error: 'Forbidden: you are not allowed to change order confirmation status' }, { status: 403 }
        );
      }
    }
    if (changingShipping) {
      const shippingAuth = authorize(user, 'orders.change_status', existing);
      if (!shippingAuth.allowed) {
        return NextResponse.json(
          { error: 'Forbidden: you are not allowed to change shipping status' }, { status: 403 }
        );
      }
    }

    // ── Optimistic concurrency: expectedVersion is MANDATORY (Phase S) ──
    // Omitting it used to fall back to the just-read version, silently disabling
    // lost-update protection. All API clients must send the version they loaded.
    if (typeof expectedVersion !== 'number') {
      return NextResponse.json(
        {
          error: 'expectedVersion is required for order updates.',
          code: 'VERSION_REQUIRED',
        },
        { status: 400 }
      );
    }
    if (expectedVersion !== existing.version) {
      return NextResponse.json(
        {
          error: 'This order was updated by another user. Please refresh before saving.',
          errorAr: 'تم تعديل هذا الطلب بواسطة مستخدم آخر. يرجى تحديث الصفحة قبل الحفظ.',
          code: 'VERSION_CONFLICT',
          currentVersion: existing.version,
        },
        { status: 409 }
      );
    }

    const previousStatus = existing.status;
    const updateData: any = {};

    if (status && status !== previousStatus) {
      updateData.status = status;

      if (status === 'CONFIRMED') {
        updateData.confirmedAt = new Date();
        updateData.confirmationStatus = 'CONFIRMED';
      }

      if (status === 'SHIPPED') {
        updateData.shippedAt = new Date();
        updateData.shippingStatus = 'SHIPPED';
        updateData.settlementStatus = 'PENDING_COLLECTION';
      }

      if (status === 'DELIVERED') {
        updateData.deliveredAt = new Date();
        updateData.shippingStatus = 'DELIVERED';
        updateData.settlementStatus = 'COLLECTED';
      }

      if (status === 'REJECTED' || status === 'CANCELLED') {
        updateData.moderatorCommission = 0; // No commission for rejected orders
        updateData.confirmationStatus = 'CANCELLED';
      }
    }

    // Explicit separate-status updates (Phase D completes the workflow, fields exist now)
    // FIX: an explicit differing shippingStatus must actually be written — the
    // previous `!changingShipping` guard made every real change dead code.
    if (shippingStatus !== undefined && !changingCombined) {
      updateData.shippingStatus = shippingStatus;
    }
    if (confirmationStatus !== undefined && !changingCombined) {
      updateData.confirmationStatus = confirmationStatus;
      if (confirmationStatus === 'CONFIRMED') updateData.confirmedAt = existing.confirmedAt || new Date();
    }

    // ── Derived-status enforcement: side-effects of a combined status touch
    // shipping/settlement categories — require the shipping authority even if
    // the caller only changed the legacy combined status. ──
    const derivedShippingWrite =
      (updateData.shippingStatus !== undefined || updateData.settlementStatus !== undefined) &&
      changingCombined;
    if (derivedShippingWrite) {
      const shippingAuth = authorize(user, 'orders.change_status', existing);
      if (!shippingAuth.allowed) {
        return NextResponse.json(
          { error: 'Forbidden: orders.change_status required' }, { status: 403 }
        );
      }
    }

    if (moderatorId !== undefined) {
      updateData.moderatorId = moderatorId || null;
    }
    if (internalNotes !== undefined) {
      updateData.internalNotes = internalNotes;
    }
    if (customerNotes !== undefined) {
      updateData.customerNotes = customerNotes;
    }
    if (postponedUntil !== undefined) {
      updateData.postponedUntil = postponedUntil ? new Date(postponedUntil) : null;
    }
    if (trackingCode !== undefined) {
      updateData.trackingNumber = trackingCode || null;
    }

    // ── Order line editing (price / quantity / discount / shipping / product) ──
    // totalAmount mirrors the create formula: sellingPrice * quantity + shippingCost − discount
    const editingLine =
      sellingPrice !== undefined ||
      quantity !== undefined ||
      discountAmount !== undefined ||
      shippingCost !== undefined ||
      productId !== undefined;
    if (editingLine) {
      const nextPrice = sellingPrice ?? existing.sellingPrice;
      const nextQty = quantity ?? existing.quantity;
      const nextDiscount = discountAmount ?? existing.discountAmount;
      const nextShipping = shippingCost ?? existing.shippingCost;
      if (nextDiscount > nextPrice * nextQty) {
        return NextResponse.json({ error: 'الخصم لا يمكن أن يتجاوز إجمالي قيمة الطلب' }, { status: 400 });
      }
      updateData.sellingPrice = nextPrice;
      updateData.quantity = nextQty;
      updateData.discountAmount = nextDiscount;
      updateData.shippingCost = nextShipping;
      updateData.totalAmount = nextPrice * nextQty + nextShipping - nextDiscount;
    }
    if (productId !== undefined && productId !== existing.productId) {
      const product = await db.product.findFirst({ where: { id: productId, companyId }, select: { id: true, name: true } });
      if (!product) {
        return NextResponse.json({ error: 'المنتج غير موجود في هذه الشركة' }, { status: 404 });
      }
      updateData.productId = productId;
      updateData.productNameSnapshot = product.name;
    }

    // Customer information edit (name / phone / address) — applied to the linked Customer row
    const editingCustomer = customerName !== undefined || customerPhone !== undefined || customerAddress !== undefined;
    if (editingCustomer && customerPhone !== undefined) {
      const normalized = normalizePhoneNumber(customerPhone);
      const dupe = await db.customer.findFirst({
        where: { companyId, phone: normalized, id: { not: existing.customerId } },
        select: { id: true, fullName: true },
      });
      if (dupe) {
        return NextResponse.json(
          { error: `رقم الهاتف مستخدم بالفعل للعميل: ${dupe.fullName}`, code: 'DUPLICATE_PHONE' },
          { status: 409 }
        );
      }
    }

    // Atomic versioned save — the gate: version must match or the write fails.
    // (Never trust client ownership fields: only operational fields are taken from the body.)
    // The write + side effects (stock deduction, customer counters) + logs are
    // one transaction so a lost race can never half-apply them.
    const previousSettlementStatus = existing.settlementStatus;
    await db.$transaction(async (tx) => {
      const saved = await tx.order.updateMany({
        where: { id, version: expectedVersion },
        data: { ...updateData, version: { increment: 1 } },
      });
      if (saved.count !== 1) {
        throw new Error('VERSION_CONFLICT: This order was updated by another user. Please refresh before saving.');
      }

      // Customer information edit — same transaction as the order write
      if (editingCustomer) {
        const custData: any = {};
        if (customerName !== undefined) custData.fullName = customerName;
        if (customerAddress !== undefined) custData.address = customerAddress;
        if (customerPhone !== undefined) {
          custData.phone = normalizePhoneNumber(customerPhone);
          custData.rawPhone = customerPhone;
        }
        if (Object.keys(custData).length > 0) {
          await tx.customer.update({ where: { id: existing.customerId }, data: custData });
        }
      }

      // Side effects (run on tx so they commit atomically with the write)
      if (status === 'CONFIRMED' && status !== previousStatus) {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { confirmedOrders: { increment: 1 } },
        });
      }

      if (status === 'DELIVERED' && status !== previousStatus) {
        // 1. Update customer delivered stats
        await tx.customer.update({
          where: { id: existing.customerId },
          data: {
            deliveredOrders: { increment: 1 },
            totalPurchaseValue: { increment: existing.totalAmount },
          },
        });

        // 2. Automatically deduct stock from active batch with remaining inventory
        const activeBatch = await tx.productionBatch.findFirst({
          where: {
            productId: existing.productId,
            quantityRemaining: { gt: 0 },
          },
          orderBy: { productionDate: 'asc' },
        });

        if (activeBatch) {
          const deductQty = Math.min(existing.quantity, activeBatch.quantityRemaining);
          await tx.productionBatch.update({
            where: { id: activeBatch.id },
            data: {
              quantitySold: { increment: deductQty },
              quantityRemaining: { decrement: deductQty },
            },
          });

          await tx.inventoryMovement.create({
            data: {
              companyId,
              productId: existing.productId,
              batchId: activeBatch.id,
              type: 'SALE',
              quantity: -deductQty,
              balanceAfter: Math.max(0, activeBatch.quantityRemaining - deductQty),
              referenceId: existing.id,
              reason: `Delivered Order #${existing.orderNumber}`,
              createdById: user.id,
            },
          });
        }
      }

      if ((status === 'REJECTED' || status === 'CANCELLED') && status !== previousStatus) {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { cancelledOrders: { increment: 1 } },
        });
      }

      // Status logs — one per changed category (mirrors the confirmation route)
      const newConfirmationStatus: string | undefined = updateData.confirmationStatus;
      const newShippingStatus: string | undefined = updateData.shippingStatus;
      const newSettlementStatus: string | undefined = updateData.settlementStatus;

      if (newConfirmationStatus !== undefined && newConfirmationStatus !== existing.confirmationStatus) {
        await tx.orderStatusLog.create({
          data: {
            companyId, orderId: id, statusType: 'CONFIRMATION',
            previousValue: existing.confirmationStatus, newValue: newConfirmationStatus,
            changedById: user.id, changedByRole: user.role,
            note: changingCombined ? `Combined status → ${status}` : null,
          },
        });
      }
      if (newShippingStatus !== undefined && newShippingStatus !== existing.shippingStatus) {
        await tx.orderStatusLog.create({
          data: {
            companyId, orderId: id, statusType: 'SHIPPING',
            previousValue: existing.shippingStatus, newValue: newShippingStatus,
            changedById: user.id, changedByRole: user.role,
            note: changingCombined ? `Combined status → ${status}` : null,
          },
        });
      }
      if (newSettlementStatus !== undefined && newSettlementStatus !== previousSettlementStatus) {
        await tx.orderStatusLog.create({
          data: {
            companyId, orderId: id, statusType: 'SETTLEMENT',
            previousValue: previousSettlementStatus, newValue: newSettlementStatus,
            changedById: user.id, changedByRole: user.role,
            note: changingCombined ? `Combined status → ${status}` : null,
          },
        });
      }

      // Record activity timeline
      if (status && status !== previousStatus) {
        await tx.orderActivity.create({
          data: {
            companyId,
            orderId: id,
            userId: user.id,
            action: 'STATUS_CHANGED',
            previousStatus,
            newStatus: status,
            metadata: JSON.stringify({
              updatedBy: user.name,
              role: user.role,
              trackingCode: trackingCode || null,
            }),
          },
        });
      }

      // Record activity for data edits (price/qty/discount/shipping/customer info)
      if (editingLine || editingCustomer) {
        const changedFields = [
          ...(sellingPrice !== undefined ? ['sellingPrice'] : []),
          ...(quantity !== undefined ? ['quantity'] : []),
          ...(discountAmount !== undefined ? ['discountAmount'] : []),
          ...(shippingCost !== undefined ? ['shippingCost'] : []),
          ...(productId !== undefined ? ['productId'] : []),
          ...(customerName !== undefined ? ['customerName'] : []),
          ...(customerPhone !== undefined ? ['customerPhone'] : []),
          ...(customerAddress !== undefined ? ['customerAddress'] : []),
        ];
        await tx.orderActivity.create({
          data: {
            companyId,
            orderId: id,
            userId: user.id,
            action: 'ORDER_UPDATED',
            metadata: JSON.stringify({ updatedBy: user.name, role: user.role, fields: changedFields }),
          },
        });
      }
    });

    const updatedOrder = await db.order.findUnique({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'ORDER_UPDATED',
      entity: 'Order',
      entityId: id,
      previousData: existing,
      newData: updatedOrder,
    });

    // Notify company managers on terminal statuses — after commit, non-fatal
    if (status && status !== previousStatus && (TERMINAL_STATUSES as readonly string[]).includes(status)) {
      try {
        await createNotification({
          companyId,
          userId: null,
          title: status === 'CONFIRMED' ? 'تأكيد طلب' : status === 'REJECTED' ? 'رفض طلب' : 'إلغاء طلب',
          message: `الطلب #${existing.orderNumber} أصبح بالحالة ${status} بواسطة ${user.name}.`,
          type: 'SYSTEM_ALERT',
          link: '/orders',
        });
      } catch (e) {
        console.error('Terminal-status notification failed (non-fatal):', e);
      }
    }

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: any) {
    // Re-raise version conflicts in their legacy response shape
    if (error?.message?.startsWith('VERSION_CONFLICT')) {
      return NextResponse.json(
        {
          error: 'This order was updated by another user. Please refresh before saving.',
          errorAr: 'تم تعديل هذا الطلب بواسطة مستخدم آخر. يرجى تحديث الصفحة قبل الحفظ.',
          code: 'VERSION_CONFLICT',
        },
        { status: 409 }
      );
    }
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
