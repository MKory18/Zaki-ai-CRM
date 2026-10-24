import { apiJson } from './api-client';

/**
 * «الزبون على الخط — أكّده الآن» — CONFIRM THE ORDER THAT WAS JUST MADE.
 *
 * It used to be a second button on the shipping-batches screen that opened a second copy of
 * the new-order form and then confirmed the result. It is an option of the one form now
 * (`CreateOrderModal`), and this is its second half.
 *
 * NOT A SECOND CONFIRMATION PATH. It goes through the ordinary endpoint
 * (`POST /api/orders/<id>/confirmation`), the one that reserves the stock, stamps who
 * confirmed and when, and writes the status log — and that asks `orders.confirm` of the
 * caller on the server. Re-implementing any of that here would be a copy that drifts, and
 * the first thing to drift would be the reservation. The form only OFFERS the option to
 * somebody who holds that permission; the door decides regardless.
 *
 * The order exists either way. A refusal is returned, not thrown, so the caller can say
 * «created, but not confirmed» instead of leaving anyone to wonder whether it was made.
 */
export type ConfirmNowResult = { ok: true } | { ok: false; reason: string };

export async function confirmOrderNow(orderId: string): Promise<ConfirmNowResult> {
  try {
    // The version the screen would have loaded: confirmation is an optimistic-concurrency write.
    const fresh = await apiJson<{ order: { version: number } }>(`/api/orders/${orderId}`);
    await apiJson(`/api/orders/${orderId}/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', expectedVersion: fresh.order.version }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'تعذّر التأكيد' };
  }
}
