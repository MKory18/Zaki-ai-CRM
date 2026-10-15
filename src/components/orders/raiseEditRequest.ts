import { apiJson } from '@/lib/api-client';
import type { ChangeableField } from '@/lib/change-request-fields';

/**
 * AN EDIT ON A CONFIRMED ORDER, AS A REQUEST — ALL ITS FIELDS AT ONCE.
 *
 * `raiseChangeRequest` next door carries ONE field, because the three
 * dialogs it serves ask about one thing each («الكمية», «السعر»…). The
 * cards in the order window are a FORM: a person fixes a name and a street
 * in the same save, and splitting that into two requests would put two
 * rows in «طلبات التعديل» that a supervisor has to approve separately —
 * one of which can be approved and the other refused, leaving the order in
 * a state nobody asked for.
 *
 * So this is the same door with the whole diff in one `changes` object,
 * which is exactly what `POST /api/orders/[id]/change-requests` already
 * accepts (a partial record over `CHANGEABLE_FIELDS`).
 *
 * `readyToApply` is the server saying the raiser may also decide it and
 * the parcel is still ours. When it is false the request is in somebody's
 * queue and this returns `applied: false` — which is the whole of what the
 * raiser can do, and what the card says out loud.
 */
export async function raiseEditRequest(
  orderId: string,
  changes: Partial<Record<ChangeableField, string | number | null>>,
  reason: string,
  /**
   * The version the screen loaded the order at. The order route refuses
   * every write without it, so a request the raiser could also decide
   * would be raised, approved, and then fail at the last step.
   */
  expectedVersion: number
): Promise<{ applied: boolean; requestId: string }> {
  const res = await apiJson<{ request: { id: string }; readyToApply?: boolean }>(
    `/api/orders/${orderId}/change-requests`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'EDIT',
        reason,
        changes: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, { to: v }])),
      }),
    }
  );

  if (!res.readyToApply) return { applied: false, requestId: res.request.id };

  await apiJson(`/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changeRequestId: res.request.id, expectedVersion }),
  });
  return { applied: true, requestId: res.request.id };
}
