import { NextResponse } from 'next/server';
import { notify } from '@/lib/notify';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { computeCod } from '@/lib/money';
import { hasEverShipped, assertCancellable, deriveCoreState, getZone, type StateSource } from '@/lib/order-state';
import { releaseOrderLines } from '@/lib/reservation';
import { assertOrderAccess, orderVisibilityWhere } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { normalizePhoneNumber } from '@/lib/phone';
import { isValidPhoneFor, phoneErrorFor } from '@/lib/phone-rules';
import { CONFIRMATION_STATUSES } from '@/lib/confirmation-workflow';
import { SHIPPING_STATUSES } from '@/lib/shipping-workflow';
import { apiError } from '@/lib/api-error';
import { authorize, can } from '@/lib/authorization';
import { orderSeal, sealedFieldsIn, sealMessage } from '@/lib/order-seal';
import { expandApproved, mayApply, strayFields } from '@/lib/change-request-apply';
import { zodMessage } from '@/lib/zod-message';

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
  // The second number the customer answers on. Empty clears it.
  customerAltPhone: z.string().trim().max(20).nullable().optional(),
  customerAddress: z.string().trim().max(300).optional(),
  // The order's lines, replaced as a set: what is sent IS the order now, so
  // removing a product is simply leaving it out.
  items: z
    .array(
      z.object({
        productId: z.string().min(10).max(64),
        quantity: z.coerce.number().int().min(1).max(999),
        unitPrice: z.coerce.number().min(0).max(100000),
      })
    )
    .min(1)
    .max(20)
    .optional(),
  // Where this order came through. Correcting it is an ordinary edit: the
  // numbers are counted per channel and an order filed under the wrong one
  // is a wrong number, not a wrong label.
  channelId: z.string().uuid().nullable().optional(),
  // The governorate the order ships to. The delivery-fee table is keyed on
  // it, so it is editable here rather than only at intake.
  regionId: z.string().uuid().optional().nullable(),
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
  // An approved change request, carried out. When present it is the ONLY
  // field besides expectedVersion: the values come from the approved
  // request on the server, never from this body.
  changeRequestId: z.string().uuid().optional(),
});

/**
 * Builds the same WHERE clause used by the orders list API (/api/orders)
 * so prev/next navigation matches the exact list context (filters + tenant + RBAC).
 */
async function buildNavigationWhere(order: { createdAt: Date; companyId: string }, searchParams: URLSearchParams) {
  const { user, companyId, storeId } = await requireContext();
  const where: any = { companyId, storeId };

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
    const { user, companyId, storeId, country } = await requireContext();
    const { searchParams } = new URL(req.url);

    // ── Phase S: role-scoped access (same envelope as the list API) ──
    // Self-scoped roles may only read orders assigned/claimed/created by them
    // or claimable queue items — never another employee's private orders.
    const access = await assertOrderAccess(id, user, { companyId, storeId }, 'orders.view');
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
        region: { select: { id: true, name: true } },
        // The real order lines. The legacy productId column holds only the
        // first one, so anything reading the order as a whole — partial
        // delivery, preparation, returns — needs these.
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, productId: true, productName: true,
            quantity: true, freeQuantity: true, unitPrice: true,
            discountShare: true, lineTotal: true, reservedQty: true,
            deliveredQty: true, returnedQty: true,
          },
        },
        deliveryProvider: { select: { id: true, name: true, code: true } },
        landingPage: { select: { id: true, name: true, slug: true } },
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
        // Counts, not rows: the journey cards show how many attempts a stage
        // took, and the attempts themselves are in the merged event log.
        _count: { select: { contactAttempts: true, deliveryAttempts: true } },
        telegramMessages: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, chatId: true, threadId: true, threadName: true, messageId: true, createdAt: true },
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

    // The SAME derived state every other screen shows. The stored `status`
    // column is legacy and drifts: an order can read CONFIRMED there while it
    // is already READY_TO_SHIP. One truth, computed in one place.
    const state = deriveCoreState(order as unknown as StateSource);

    // What the customer actually pays at the door, from the ONE cod function
    // (contract invariant: never computed in a screen). With a price that
    // includes delivery the fee is already inside the line prices, so the
    // detail screen can state that instead of listing a fee above a total
    // that does not contain it.
    const cod = computeCod({
      lines: (order.items ?? []).map((line) => ({
        quantity: line.quantity,
        unitPrice: Number(line.unitPrice),
      })),
      deliveryFee: Number(order.deliveryFee ?? order.shippingCost ?? 0),
      discount: Number(order.discountAmount ?? 0),
      priceIncludesDelivery: order.priceIncludesDelivery === true,
      minorUnit: country.minorUnit,
    });

    return NextResponse.json({
      order: { ...order, state, zone: getZone(state) },
      // The store's own currency, so the detail screen shows the same money
      // the list does instead of a hard-coded dollar sign.
      currency: { code: country.currencyCode, minorUnit: country.minorUnit },
      cod: { ...cod, includesDelivery: order.priceIncludesDelivery === true },
      previousOrderId,
      nextOrderId,
    });
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
    const { user, companyId, storeId, country } = await requireContext();

    // Server-side Zod validation — never trust client input
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodMessage(parsed.error) },
        { status: 400 }
      );
    }
    // ── An approved change request, carried out ──
    //
    // The browser names the request and nothing else; the edit is rebuilt
    // here from what was approved. Anything else in the body is refused,
    // because this authority passes the seal and must not carry a second
    // change through with it.
    let data: z.infer<typeof patchSchema> = parsed.data;
    let viaRequest: { id: string; orderId: string; reason: string; decisionNote: string | null } | null = null;
    if (parsed.data.changeRequestId) {
      const stray = strayFields(parsed.data as Record<string, unknown>);
      if (stray.length > 0) {
        return NextResponse.json(
          { error: 'تطبيق طلب التعديل لا يقبل حقولاً أخرى معه', code: 'STRAY_FIELDS', fields: stray },
          { status: 400 }
        );
      }
      const request = await db.orderChangeRequest.findFirst({
        where: { id: parsed.data.changeRequestId, companyId },
        select: { id: true, orderId: true, status: true, appliedAt: true, changes: true, reason: true, decisionNote: true },
      });
      if (!request) return NextResponse.json({ error: 'طلب التعديل غير موجود' }, { status: 404 });
      const expanded = expandApproved(request);
      if (!expanded.ok) {
        return NextResponse.json({ error: expanded.error, code: expanded.code }, { status: expanded.status });
      }
      const rebuilt = patchSchema.safeParse({ ...expanded.fields, expectedVersion: parsed.data.expectedVersion });
      if (!rebuilt.success) {
        // What was approved no longer passes the order's own rules — a phone
        // that was valid then and is not now, say. Refuse rather than bend.
        return NextResponse.json({ error: zodMessage(rebuilt.error), code: 'APPROVED_VALUE_INVALID' }, { status: 422 });
      }
      data = rebuilt.data;
      viaRequest = request;
    }

    const {
      status, moderatorId, internalNotes, customerNotes, postponedUntil, trackingCode,
      confirmationStatus, shippingStatus, expectedVersion,
      customerName, customerPhone, customerAltPhone, customerAddress, regionId,
      sellingPrice, quantity, discountAmount, shippingCost, productId, items, channelId,
    } = data;

    // ── Authorization chain: visibility/assignment (RBAC engine) → canonical
    // orders.edit permission with scope evaluation (ASSIGNED scope enforces
    // own-assignment, so no separate any/own check is needed) ──
    const access = await assertOrderAccess(id, user, { companyId, storeId }, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: map[access.reason] });
    }
    const existing = access.order;

    if (viaRequest) {
      const verdict = mayApply(user, viaRequest, {
        id: existing.id,
        confirmationStatus: existing.confirmationStatus,
        claimedById: existing.claimedById ?? null,
      });
      if (!verdict.ok) {
        return NextResponse.json({ error: verdict.error, code: verdict.code }, { status: verdict.status });
      }
    }

    // The approved request IS the authority here — decided by somebody who
    // could reach the courier, for this order and these fields. Without one,
    // the ordinary orders.edit scope applies exactly as before.
    const editAuth = viaRequest ? { allowed: true as const } : authorize(user, 'orders.edit', existing);
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
        // The same guard the confirmation route applies. This legacy path
        // wrote CANCELLED without it, so a parcel already handed to a
        // courier could be cancelled here — and its units counted as back
        // on the shelf while they sat in a van.
        const cancellable = assertCancellable(existing as StateSource);
        if (!cancellable.allowed) {
          return NextResponse.json(
            { error: cancellable.message, errorAr: cancellable.message, code: cancellable.code },
            { status: 409 }
          );
        }
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
      // Tenant-validate the moderator (same rule as POST /orders) — a client
      // can never attach a moderator from another company, even with a valid
      // user id. null/unset clears the assignment (existing behavior kept).
      if (moderatorId) {
        const mod = await db.user.findFirst({ where: { id: moderatorId, companyId }, select: { id: true } });
        if (!mod) {
          return NextResponse.json({ error: 'الموديريتور غير موجود في هذه الشركة' }, { status: 404 });
        }
      }
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
    if (channelId !== undefined) {
      // The channel is the order's attribution — which campaign, page or
      // person the sale is credited to, and what every source report reads.
      // A confirmation agent editing the order she is working on must not be
      // able to move that credit; it is a different authority from fixing an
      // address or a quantity.
      if (!can(user, 'orders.assign')) {
        return NextResponse.json(
          {
            error: 'لا تملك صلاحية تغيير جهة الطلب',
            errorAr: 'لا تملك صلاحية تغيير جهة الطلب',
            code: 'CHANNEL_FORBIDDEN',
          },
          { status: 403 }
        );
      }
      if (channelId === null) {
        updateData.channelId = null;
      } else {
        const channel = await db.orderChannel.findFirst({
          where: { id: channelId, companyId },
          select: { id: true, name: true },
        });
        if (!channel) {
          return NextResponse.json({ error: 'القناة غير موجودة' }, { status: 404 });
        }
        updateData.channelId = channel.id;
        updateData.source = channel.name;
      }
    }
    if (trackingCode !== undefined) {
      updateData.trackingNumber = trackingCode || null;
    }

    // Shipping and delivery cost belong to the shipping authority, not to
    // whoever may edit the order. The agent on the phone fixes a wrong
    // address; she does not decide what the parcel costs to send.
    if (shippingCost !== undefined && !can(user, 'orders.change_status')) {
      return NextResponse.json(
        {
          error: 'لا تملك صلاحية تعديل الشحن والتوصيل',
          errorAr: 'لا تملك صلاحية تعديل الشحن والتوصيل',
          code: 'SHIPPING_FORBIDDEN',
        },
        { status: 403 }
      );
    }

    // ── The seal: a batch that has been handed over ──
    //
    // Once "استلمت شركة الشحن" is pressed the parcels have left the
    // building, and the address the driver holds, the goods in the box and
    // the amount he collects are all fixed somewhere we do not control.
    // What was a direct edit becomes a change request: somebody who can
    // still reach the courier decides, and says what has to happen if the
    // change is no longer possible. Silence never approves it.
    // An approved change request is what the seal asks for, so it passes —
    // and only it, and only with the fields that were approved (the body
    // could carry nothing else, see above).
    const sealedAsked = viaRequest ? [] : sealedFieldsIn(data as Record<string, unknown>);
    if (sealedAsked.length > 0) {
      const batch = await db.shippingBatch.findFirst({
        where: { orders: { some: { id } }, companyId },
        select: { status: true, batchNumber: true },
      });
      // The order's own state counts too: a parcel can leave on its own
      // while the batch it came from is still open and taking work.
      const seal = orderSeal({
        shippingBatch: batch,
        shippingStatus: existing.shippingStatus,
        shippedAt: (existing as { shippedAt?: Date | null }).shippedAt ?? null,
        labelPrintedAt: (existing as { labelPrintedAt?: Date | null }).labelPrintedAt ?? null,
      });
      if (seal.sealed) {
        return NextResponse.json(
          {
            error: sealMessage(seal.batchNumber, sealedAsked, seal.reason),
            errorAr: sealMessage(seal.batchNumber, sealedAsked, seal.reason),
            code: 'ORDER_SEALED',
            fields: sealedAsked,
            batchNumber: seal.batchNumber,
          },
          { status: 409 }
        );
      }
    }

    // ── Order line editing (price / quantity / discount / shipping / product) ──
    // totalAmount mirrors the create formula: sellingPrice * quantity + shippingCost − discount
    const editingLine =
      sellingPrice !== undefined ||
      quantity !== undefined ||
      discountAmount !== undefined ||
      shippingCost !== undefined ||
      productId !== undefined ||
      items !== undefined;

    // The lines this edit leaves the order with. An explicit array replaces
    // them; otherwise the existing lines carry on, adjusted by whatever
    // single-line fields were sent.
    let nextLines: { productId: string; quantity: number; unitPrice: number }[] = [];
    let lineProducts = new Map<string, { id: string; name: string }>();
    let lineMoney: ReturnType<typeof computeCod> | null = null;

    if (editingLine) {
      if (items) {
        // Replacing the set deletes the rows it drops, and those rows carry
        // the reservation and what was actually delivered or returned. Once
        // stock has been held against a line, or the parcel has left, the
        // line is a record of something that happened — not a draft.
        const committed = await db.orderItem.findFirst({
          where: {
            orderId: id,
            OR: [{ reservedQty: { gt: 0 } }, { deliveredQty: { gt: 0 } }, { returnedQty: { gt: 0 } }],
          },
          select: { id: true },
        });
        if (committed || hasEverShipped(existing as StateSource)) {
          return NextResponse.json(
            {
              error: 'لا يمكن تعديل بنود طلب حُجزت بضاعته أو خرج للشحن — عدّل الكميات من شاشة المرتجعات',
              code: 'LINES_COMMITTED',
            },
            { status: 409 }
          );
        }

        const ids = [...new Set(items.map((l) => l.productId))];
        const rows = await db.product.findMany({
          where: { id: { in: ids }, companyId },
          select: { id: true, name: true },
        });
        if (rows.length !== ids.length) {
          return NextResponse.json({ error: 'أحد المنتجات غير موجود في هذه الشركة' }, { status: 404 });
        }
        lineProducts = new Map(rows.map((r) => [r.id, r]));
        nextLines = items.map((l) => ({ ...l }));
      } else {
        // The single-line shorthand: price is the TOTAL for the quantity, the
        // same meaning intake gives it.
        nextLines = [
          {
            productId: productId ?? existing.productId,
            quantity: quantity ?? existing.quantity,
            unitPrice: sellingPrice ?? existing.sellingPrice,
          },
        ];
      }

      const nextDiscount = discountAmount ?? Number(existing.discountAmount ?? 0);
      const nextShipping = shippingCost ?? Number(existing.shippingCost ?? 0);

      // ONE COD function — never a second formula. The one that used to live
      // here read `sellingPrice * quantity`, multiplying a price that is
      // already the line's total by the quantity again, and added the
      // delivery fee even on a store whose prices include it.
      // The add-ons the customer accepted stay part of what is collected.
      // Editing a line rebuilt the total from the lines alone, which quietly
      // dropped them — the same loss shipment creation had.
      const acceptedAddOns = await db.orderAddOn.findMany({
        where: { orderId: id, companyId },
        select: { quantity: true, price: true },
      });
      const money = computeCod({
        lines: nextLines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.quantity > 0 ? l.unitPrice / l.quantity : l.unitPrice,
        })),
        discount: nextDiscount,
        deliveryFee: nextShipping,
        priceIncludesDelivery: existing.priceIncludesDelivery === true,
        minorUnit: country.minorUnit,
        addOns: acceptedAddOns.map((a) => ({ quantity: a.quantity, unitPrice: Number(a.price) })),
      });

      if (nextDiscount > money.subtotal) {
        return NextResponse.json({ error: 'الخصم لا يمكن أن يتجاوز إجمالي قيمة الطلب' }, { status: 400 });
      }

      updateData.sellingPrice = money.subtotal;
      updateData.quantity = nextLines.reduce((sum, l) => sum + l.quantity, 0);
      updateData.discountAmount = money.discount;
      updateData.shippingCost = nextShipping;
      updateData.totalAmount = money.cod;
      // The order is named after its first line, as it is at intake.
      updateData.productId = nextLines[0].productId;
      if (items) {
        updateData.productNameSnapshot = lineProducts.get(nextLines[0].productId)?.name ?? existing.productNameSnapshot;
      }
      lineMoney = money;
    }
    if (productId !== undefined && productId !== existing.productId) {
      const product = await db.product.findFirst({ where: { id: productId, companyId }, select: { id: true, name: true } });
      if (!product) {
        return NextResponse.json({ error: 'المنتج غير موجود في هذه الشركة' }, { status: 404 });
      }
      updateData.productId = productId;
      updateData.productNameSnapshot = product.name;
    }

    // Region edit — must belong to THIS order's country, so a Jordanian
    // order can never be pointed at a Syrian governorate.
    let regionName: string | undefined;
    if (regionId !== undefined) {
      if (regionId === null) {
        updateData.regionId = null;
      } else {
        const region = await db.region.findFirst({
          where: { id: regionId, countryId: existing.countryId, isActive: true },
          select: { id: true, name: true },
        });
        if (!region) {
          return NextResponse.json(
            { error: 'المحافظة غير موجودة في بلد هذا الطلب', code: 'REGION_NOT_IN_COUNTRY' },
            { status: 400 }
          );
        }
        updateData.regionId = region.id;
        regionName = region.name;
      }
    }

    // Customer information edit (name / phone / address) — applied to the linked Customer row
    const editingCustomer =
      customerName !== undefined || customerPhone !== undefined || customerAddress !== undefined ||
      customerAltPhone !== undefined || regionName !== undefined;
    // A corrected phone has to actually be a phone for this country —
    // otherwise "fixing" a wrong number just writes a different wrong one.
    if (customerPhone !== undefined && !isValidPhoneFor(country.code, customerPhone)) {
      return NextResponse.json(
        { error: phoneErrorFor(country.code), code: 'INVALID_PHONE', field: 'customerPhone' },
        { status: 400 }
      );
    }
    // The second number is optional, but a number that is there must be real.
    if (customerAltPhone && !isValidPhoneFor(country.code, customerAltPhone)) {
      return NextResponse.json(
        { error: phoneErrorFor(country.code), code: 'INVALID_PHONE', field: 'customerAltPhone' },
        { status: 400 }
      );
    }

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

      // The lines themselves, only when an explicit set was sent. Replacing
      // them wholesale is what the screen does — a product removed from the
      // list is removed from the order — and it happens in this transaction
      // so the order's totals and its lines can never disagree.
      if (items && lineMoney) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({
          data: nextLines.map((line, i) => ({
            companyId,
            orderId: id,
            productId: line.productId,
            productName: lineProducts.get(line.productId)?.name ?? '',
            quantity: line.quantity,
            unitPrice: line.quantity > 0 ? line.unitPrice / line.quantity : line.unitPrice,
            discountShare: lineMoney!.discountShares[i] ?? 0,
            lineTotal: lineMoney!.lineTotals[i] ?? 0,
            addedById: user.id,
            addedStage: 'EDIT',
          })),
        });
      }

      // Customer information edit — same transaction as the order write
      if (editingCustomer) {
        const custData: any = {};
        if (customerName !== undefined) custData.fullName = customerName;
        if (customerAddress !== undefined) custData.address = customerAddress;
        // Keep the written city in step with the chosen governorate.
        if (regionName !== undefined) custData.city = regionName;
        if (customerPhone !== undefined) {
          custData.phone = normalizePhoneNumber(customerPhone);
          custData.rawPhone = customerPhone;
        }
        if (customerAltPhone !== undefined) {
          custData.altPhone = customerAltPhone?.trim() || null;
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
        // Stock is never held by a dead order. The reservation is dropped in
        // THIS transaction, so a failure cannot leave the units reserved
        // against an order that no longer exists in any queue.
        await releaseOrderLines(tx, id);
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
          ...(customerAltPhone !== undefined ? ['customerAltPhone'] : []),
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
      action: viaRequest ? 'ORDER_UPDATED_BY_CHANGE_REQUEST' : 'ORDER_UPDATED',
      entity: 'Order',
      entityId: id,
      previousData: existing,
      newData: viaRequest
        ? {
            ...updatedOrder,
            // Who carried it out is the audit's own userId; WHY is the
            // request's reason and the decision on it. An edit that passed
            // the seal must say what allowed it.
            changeRequest: { id: viaRequest.id, reason: viaRequest.reason, decision: viaRequest.decisionNote },
          }
        : updatedOrder,
    });

    if (viaRequest) {
      // Once. `appliedAt: null` in the filter makes a second, concurrent apply
      // a no-op here — and the values are absolute ("to 3", not "+1"), so the
      // order itself ends the same either way.
      await db.orderChangeRequest.updateMany({
        where: { id: viaRequest.id, appliedAt: null },
        data: { appliedAt: new Date(), appliedById: user.id },
      });
    }

    // A confirmation outcome goes to this store's confirmation supervisors
    // and to the moderator who entered the order — their commission rides
    // on it. Not to whoever just pressed the button. After commit; never
    // throws.
    if (status && status !== previousStatus && (TERMINAL_STATUSES as readonly string[]).includes(status)) {
      notify({
        companyId,
        storeId: existing.storeId ?? storeId,
        // The moderator the order belonged to AND the one it belongs to now:
        // one edit can move the order and decide it, and the commission
        // follows the new owner while the old one saw it until a moment ago.
        audience: {
          permission: 'confirmation.supervise',
          userIds: [existing.moderatorId, updatedOrder?.moderatorId],
        },
        actorId: user.id,
        title: status === 'CONFIRMED' ? 'تأكيد طلب' : status === 'REJECTED' ? 'رفض طلب' : 'إلغاء طلب',
        message: `الطلب #${existing.orderNumber} أصبح بالحالة ${status} بواسطة ${user.name}.`,
        type: 'SYSTEM_ALERT',
        link: '/orders',
      });
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
