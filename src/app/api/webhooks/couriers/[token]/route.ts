import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mapStatusFor } from '@/lib/couriers';
import { applyCourierEvent } from '@/lib/couriers/apply-event';
import { hashWebhookToken } from '@/lib/couriers/webhook-token';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/webhooks/couriers/<token> — a courier telling us a status
 * changed, instead of us asking every two minutes.
 *
 * This is the only courier endpoint reachable without a session: the caller
 * is LogesTechs' server, which has no account here. The token in the path IS
 * the credential — we hash what we are given and look the provider up by
 * that, so an unknown token finds nothing and is refused without a hint as
 * to why.
 *
 * What it may change is deliberately narrow. The event goes through
 * `applyCourierEvent`, the same gate the polling job uses, which refuses to
 * let any courier feed assert DELIVERED, RETURNED, PARTIALLY_DELIVERED or
 * CANCELLED. Those move money or reverse it, and a push we did not ask for
 * is not the place to decide that.
 *
 * An authenticated call always gets 200, even when nothing was applied.
 * Couriers retry on a non-2xx, and a retry storm over a status we chose not
 * to act on is worse than a quiet acknowledgement. The body says what
 * happened; failures for real reasons are 4xx.
 */

export const dynamic = 'force-dynamic';

/**
 * Couriers do not agree on field names, and LogesTechs has not told us
 * theirs yet. Rather than guess one and silently drop everything else, we
 * accept the names that are actually common and — when none match — record
 * which keys DID arrive, so the first real callback tells us the shape.
 */
const BARCODE_KEYS = ['barcode', 'trackingNumber', 'tracking_number', 'awb', 'waybill', 'shipmentBarcode', 'packageBarcode'];
const STATUS_KEYS = ['status', 'statusCode', 'status_code', 'shipmentStatus', 'newStatus', 'state'];
const NOTE_KEYS = ['note', 'notes', 'comment', 'description', 'reason'];
const WHEN_KEYS = ['occurredAt', 'timestamp', 'date', 'statusDate', 'updatedAt', 'eventTime'];

function parseWhen(payload: Record<string, unknown>): Date | null {
  const raw = pick(payload, WHEN_KEYS);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pick(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

/** One level of nesting, because several couriers wrap the thing in `data`. */
function unwrap(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const top = body as Record<string, unknown>;
  for (const key of ['data', 'payload', 'shipment', 'package', 'body']) {
    const inner = top[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const merged = { ...(inner as Record<string, unknown>), ...top };
      return merged;
    }
  }
  return top;
}

/**
 * A person checking the URL works, by pasting it into a browser.
 *
 * A browser sends GET, and this endpoint takes POST, so Next answers 405 —
 * a blank "This page isn't working" that reads as a broken address. The URL
 * is not broken, and whoever pasted it deserves to be told so rather than
 * left guessing whether to send it to the courier.
 *
 * It says nothing about whether the token is valid. Confirming a guess is
 * exactly the help an attacker wants, and the person setting this up has
 * the settings screen to tell them.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      ar: 'هذا العنوان يعمل. إنه مخصّص لشركة الشحن ترسل عليه الحالات بطريقة POST — فتحه من المتصفح لا يفعل شيئاً. أرسله كما هو لشركة الشحن.',
      en: 'Endpoint is live. It accepts POST from the courier; opening it in a browser does nothing.',
      accepts: 'POST',
    },
    { status: 200 }
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(req);
  // Generous: a courier pushing a day's worth of scans is normal traffic.
  // Tight enough that guessing tokens from one address is hopeless.
  const rl = rateLimit(`courier-webhook:${ip}`, 600, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { token } = await params;
  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const provider = await db.deliveryProvider.findUnique({
    where: { webhookSecretHash: hashWebhookToken(token) },
    select: {
      id: true,
      name: true,
      code: true,
      companyId: true,
      adapterCode: true,
      apiEnabled: true,
      apiConfig: true,
      apiCredentials: true,
      isActive: true,
    },
  });

  // Unknown token, or a courier switched off. Same answer either way — the
  // caller learns nothing about which.
  if (!provider || !provider.isActive) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const payload = unwrap(body);
  if (!payload) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  await db.deliveryProvider.update({
    where: { id: provider.id },
    data: { webhookLastSeenAt: new Date() },
  });

  const barcode = pick(payload, BARCODE_KEYS);
  const rawStatus = pick(payload, STATUS_KEYS);

  if (!barcode || !rawStatus) {
    // The shape is not one we know. Record the KEY NAMES only — a courier
    // payload can carry a customer's name, phone and address, and none of
    // that belongs in an audit row. The names alone are what we need to
    // teach the parser this courier's dialect.
    await logAudit({
      companyId: provider.companyId,
      userId: null,
      action: 'COURIER_WEBHOOK_UNPARSED',
      entity: 'DeliveryProvider',
      entityId: provider.id,
      newData: { courier: provider.name, keys: Object.keys(payload).slice(0, 40) },
    });
    return NextResponse.json({ ok: true, applied: false, reason: 'UNRECOGNISED_PAYLOAD' });
  }

  const order = await db.order.findFirst({
    where: { companyId: provider.companyId, deliveryProviderId: provider.id, trackingNumber: barcode },
    select: { id: true, companyId: true, shippingStatus: true },
  });
  if (!order) {
    return NextResponse.json({ ok: true, applied: false, reason: 'UNKNOWN_BARCODE' });
  }

  const outcome = await applyCourierEvent({
    order,
    event: {
      trackingNumber: barcode,
      // The courier's own timestamp if it sent one, otherwise now. A push we
      // could not date is still a push we just received.
      occurredAt: parseWhen(payload) ?? new Date(),
      // A lookup table, not an API call — so a courier can push statuses
      // from the day the URL is added, before their login reaches us.
      status: mapStatusFor(provider.adapterCode, rawStatus),
      rawStatus,
      note: pick(payload, NOTE_KEYS) ?? undefined,
    },
    courierName: provider.name,
    source: 'WEBHOOK',
  });

  return NextResponse.json({ ok: true, applied: outcome === 'APPLIED', reason: outcome });
}
