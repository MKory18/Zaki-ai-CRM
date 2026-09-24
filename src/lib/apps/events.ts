import crypto from 'crypto';
import { db } from '../db';
import { decryptSecret } from '../secrets';

/**
 * TELLING AN APP WHAT HAPPENED.
 *
 * An external app is told; it is not given the keys. That is the whole of
 * its power for now, and it is deliberate: a webhook can be pointed at a
 * wrong URL and leak a phone number, but it cannot delete an order, move
 * money, or read a customer it was never told about.
 *
 * Every attempt is written down before it is made. A webhook that fails
 * silently is an integration that stops silently — the seller believes the
 * two systems are in step and the developer has no way to find out they are
 * not. A delivery row says what was sent, where, how many times, and what
 * came back.
 *
 * Delivery is never inline with the thing that happened. An order must not
 * fail to save because somebody's server is down, so the row is written and
 * the worker does the sending.
 */

/** What an app may ask to hear about. */
export const APP_EVENTS = [
  'order.created',
  'order.confirmed',
  'order.shipped',
  'order.delivered',
  'order.returned',
  'order.cancelled',
] as const;

export type AppEvent = (typeof APP_EVENTS)[number];

export const APP_EVENT_AR: Record<AppEvent, string> = {
  'order.created': 'طلب جديد',
  'order.confirmed': 'تأكيد طلب',
  'order.shipped': 'شحن طلب',
  'order.delivered': 'تسليم طلب',
  'order.returned': 'إرجاع طلب',
  'order.cancelled': 'إلغاء طلب',
};

export function isAppEvent(v: string): v is AppEvent {
  return (APP_EVENTS as readonly string[]).includes(v);
}

/** Retry schedule in seconds: quick, then patient, then give up. */
export const BACKOFF = [30, 120, 600, 3600, 21600];
export const MAX_ATTEMPTS = BACKOFF.length;

/**
 * Queue this event for every installed app that asked for it.
 *
 * Never throws. Announcing what happened must not be able to undo it: an
 * order that saved has saved, whatever any integration thinks about it.
 */
export async function emitAppEvent(
  companyId: string,
  event: AppEvent,
  payload: Record<string, unknown>
): Promise<number> {
  try {
    const installs = await db.appInstall.findMany({
      where: {
        companyId,
        enabled: true,
        app: { status: 'ACTIVE', webhookUrl: { not: null } },
      },
      select: { id: true, app: { select: { events: true, webhookUrl: true } } },
    });

    const listening = installs.filter((i) => {
      try {
        const events = JSON.parse(i.app?.events ?? '[]');
        return Array.isArray(events) && events.includes(event);
      } catch {
        return false;
      }
    });
    if (listening.length === 0) return 0;

    const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload });

    await db.appDelivery.createMany({
      data: listening.map((i) => ({
        companyId,
        installId: i.id,
        event,
        payload: body,
        url: i.app!.webhookUrl!,
        status: 'PENDING',
        nextAttemptAt: new Date(),
      })),
    });
    return listening.length;
  } catch (e) {
    console.error('emitAppEvent failed (non-fatal):', e);
    return 0;
  }
}

/**
 * The signature an app checks.
 *
 * `sha256=<hex>` over `<timestamp>.<body>` with the app's secret. The
 * timestamp is inside the signed string so a captured request cannot be
 * replayed a week later with the same signature still valid.
 */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Send one pending delivery.
 *
 * Returns whether it landed. A 2xx is success; anything else is a retry
 * until the attempts run out, because a developer's server being down for
 * an hour should not lose them a day of orders.
 */
export async function deliverOne(deliveryId: string): Promise<boolean> {
  const delivery = await db.appDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true, url: true, payload: true, event: true, attempts: true,
      install: { select: { app: { select: { secret: true, code: true } } } },
    },
  });
  if (!delivery) return false;

  const attempt = delivery.attempts + 1;
  const timestamp = String(Date.now());

  let secret: string | null = null;
  try {
    secret = delivery.install.app?.secret ? decryptSecret(delivery.install.app.secret) : null;
  } catch {
    // An unreadable secret cannot be signed with, and sending unsigned would
    // teach the receiver to accept unsigned. Fail it loudly instead.
    await db.appDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', attempts: attempt, error: 'SECRET_UNREADABLE', nextAttemptAt: null },
    });
    return false;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(delivery.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Zaki-Event': delivery.event,
        'X-Zaki-Delivery': delivery.id,
        'X-Zaki-Timestamp': timestamp,
        ...(secret ? { 'X-Zaki-Signature': signPayload(secret, timestamp, delivery.payload) } : {}),
      },
      body: delivery.payload,
      signal: controller.signal,
      redirect: 'manual', // a webhook that redirects is a webhook pointed somewhere else
    });
    clearTimeout(timer);

    const ok = res.status >= 200 && res.status < 300;
    await db.appDelivery.update({
      where: { id: delivery.id },
      data: ok
        ? { status: 'OK', attempts: attempt, responseCode: res.status, deliveredAt: new Date(), nextAttemptAt: null, error: null }
        : nextTry(attempt, `HTTP ${res.status}`, res.status),
    });
    return ok;
  } catch (e) {
    await db.appDelivery.update({
      where: { id: delivery.id },
      data: nextTry(attempt, e instanceof Error ? e.message.slice(0, 200) : 'network error', null),
    });
    return false;
  }
}

function nextTry(attempt: number, error: string, code: number | null) {
  const exhausted = attempt >= MAX_ATTEMPTS;
  return {
    status: exhausted ? 'FAILED' : 'PENDING',
    attempts: attempt,
    responseCode: code,
    error,
    nextAttemptAt: exhausted ? null : new Date(Date.now() + BACKOFF[attempt - 1] * 1000),
  };
}

/** Deliveries that are due now, oldest first. */
export async function dueDeliveries(limit = 50) {
  return db.appDelivery.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });
}
