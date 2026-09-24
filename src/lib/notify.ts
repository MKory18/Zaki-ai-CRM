import { after } from 'next/server';
import { createNotification } from './notification';

/**
 * TELL PEOPLE — AFTER THE ANSWER HAS GONE.
 *
 * Deciding who hears about something now costs a handful of queries: every
 * active employee, their overrides, the roles, the store and who may enter
 * it. Awaited inside the request, that sat in front of the response to
 * every confirmation, every new order and every public checkout.
 *
 * Inside a request this schedules the work with Next's `after`, which runs
 * once the response is sent (and runs even if the handler then fails).
 * Outside one — the worker, a script, a test — there is no response to
 * wait for, `after` refuses, and the work simply starts now, unawaited.
 *
 * It lives apart from notification.ts on purpose: route tests replace that
 * module with a stub, and this one must keep working in front of it.
 */
export function afterResponse(work: () => Promise<unknown>): void {
  const run = () => work().catch((e) => console.error('Deferred notification failed (non-fatal):', e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** createNotification, after the response. For callers that do not need its result. */
export function notify(opts: Parameters<typeof createNotification>[0]): void {
  afterResponse(() => createNotification(opts));
}
