import { apiJson } from '@/lib/api-client';
import type { ChangeRequestValue } from '@/components/screens/confirmation/ActionDialogs';

/**
 * RAISING ONE OF THE THREE ASKS, FROM WHEREVER THE ORDER IS.
 *
 * Two screens open the same door — the agent's own queue, and the order
 * itself — and the second one is the one that matters after dispatch,
 * because an order she no longer holds is only reachable there.
 *
 * Both do exactly this, and a second copy of it would be the place where
 * «cancellations carry their reason» stops being true on one screen. So the
 * POST and the carry-out that follows it live here, once.
 *
 * WHAT THE CARRY-OUT IS DEPENDS ON THE ASK, and each goes through the door
 * that already does that thing: an edit through the order's own money path,
 * a cancellation or a postponement through the stand-down door, which
 * releases the reservation in the same transaction and, for a postponement,
 * puts the order back in front of whoever is free on its date.
 *
 * `readyToApply` is the server saying the raiser may also decide it and the
 * parcel is still ours. When it is false the request is in somebody's
 * queue, and this returns having asked — which is the whole of what she can
 * do.
 */
export async function raiseChangeRequest(orderId: string, value: ChangeRequestValue): Promise<void> {
  /**
   * Each ask carries only what it means. A cancellation names no field and
   * a postponement names no value; sending empty ones would have the server
   * storing «the customer's name, changed to nothing» beside every one.
   */
  const body =
    value.intent === 'EDIT'
      ? { intent: value.intent, reason: value.reason, changes: { [value.field]: { to: value.to } } }
      : value.intent === 'CANCEL'
        ? { intent: value.intent, reason: value.reason, cancelReason: value.cancelReason }
        : {
            intent: value.intent,
            reason: value.reason,
            postponeUntil: new Date(`${value.postponeDate}T10:00:00`).toISOString(),
          };

  const res = await apiJson<{ request: { id: string }; readyToApply?: boolean }>(
    `/api/orders/${orderId}/change-requests`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.readyToApply) return;

  if (value.intent === 'EDIT') {
    await apiJson(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeRequestId: res.request.id }),
    });
    return;
  }
  await apiJson('/api/ops/shipments/stand-down', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      outcome: value.intent === 'CANCEL' ? 'CANCEL' : 'POSTPONE',
      changeRequestId: res.request.id,
    }),
  });
}
