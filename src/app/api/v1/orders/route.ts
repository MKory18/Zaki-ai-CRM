import { requireSystemToken } from '@/lib/v1/system-token';
import {
  V1_CODE,
  V1Fault,
  requestIdOf,
  v1ErrorResponse,
  v1Ok,
} from '@/lib/v1/door';
import {
  claimIdempotency,
  idempotencyKeyOf,
  releaseIdempotency,
  rememberIdempotency,
  requestFingerprint,
} from '@/lib/v1/idempotency';
import { createSystemOrder, v1OrderSchema } from '@/lib/v1/order-intake';
import { amountString } from '@/lib/v1/shape';

/**
 * POST /api/v1/orders — an order another system took, landing here.
 *
 * THE HANDLER DOES FOUR THINGS AND DECIDES NONE OF THEM: it proves who is
 * calling (`requireSystemToken`, the authorization layer), settles whether
 * this request has already been answered (`claimIdempotency`), hands the
 * body to the intake service (`createSystemOrder`, which owns every rule
 * about customers, prices, stock and events) and shapes the answer.
 *
 * ── WHY THE KEY IS CLAIMED BEFORE THE BODY IS VALIDATED ──
 *
 * It is not. The body is parsed FIRST, because the fingerprint of the
 * request has to be taken over the bytes that arrived, and a malformed body
 * must not burn a key the caller will legitimately retry with a fixed one.
 * A 422 leaves the key unused.
 *
 * ── AND A RETRY IS ANSWERED 200, NOT 201 ──
 *
 * «رد 201 (أو 200 لنفس المفتاح — نفس الطلب، ولا نسخة تانية)». The caller
 * can tell «I just created this» from «this already existed», which is the
 * whole value of the mechanism to it.
 */

export async function POST(req: Request) {
  const requestId = requestIdOf(req);
  let claimed: { companyId: string; key: string } | null = null;
  try {
    const caller = await requireSystemToken(req, 'orders.create');

    // The raw bytes, because the fingerprint is of what ARRIVED. Parsing
    // first and re-serialising would make two byte-different bodies hash the
    // same, and `IDEMPOTENCY_CONFLICT` would stop catching the mistake it
    // exists for.
    const raw = await req.text();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new V1Fault(422, V1_CODE.VALIDATION_FAILED, 'The body is not JSON');
    }

    const parsed = v1OrderSchema.safeParse(body);
    if (!parsed.success) {
      /*
       * THE FIELD NAMES, AND NEVER THE VALUES.
       *
       * A validation error that echoed the input would put the customer's
       * name, phone and address into the calling system's error log — a
       * place nobody here decided to keep them. `z.treeifyError` is not used
       * for the same reason: it carries the received value in some shapes.
       */
      throw new V1Fault(422, V1_CODE.VALIDATION_FAILED, 'The body does not fit the schema', {
        fields: [...new Set(parsed.error.issues.map((i) => i.path.join('.')))].slice(0, 20),
      });
    }

    const key = idempotencyKeyOf(req);
    // The path as it ARRIVED, not a literal. Two reasons: the same key used
    // against a different endpoint must be a conflict rather than a replay
    // of the wrong answer, and a hard-coded path here could drift from the
    // folder this file sits in without anything noticing.
    const fingerprint = requestFingerprint('POST', new URL(req.url).pathname, raw);
    const replay = await claimIdempotency(caller.companyId, key, fingerprint);
    if (replay) return v1Ok(requestId, replay.body as Record<string, unknown>, replay.status);
    claimed = { companyId: caller.companyId, key };

    const result = await createSystemOrder(caller, parsed.data);

    const answer = {
      order_id: result.orderId,
      order_number: result.orderNumber,
      status: result.status,
      // Our figures, always — «ما بيثق بأرقام نظام تاني». `price_adjusted`
      // says whether they differ from what was quoted, so the calling system
      // can tell the customer before the courier does.
      price_adjusted: result.priceAdjusted,
      totals: {
        subtotal: amountString(result.totals.subtotal, result.minorUnit),
        discount: amountString(result.totals.discount, result.minorUnit),
        delivery_fee: amountString(result.totals.deliveryFee, result.minorUnit),
        total: amountString(result.totals.total, result.minorUnit),
        currency: result.currency,
      },
    };

    await rememberIdempotency(caller.companyId, key, 201, answer);
    claimed = null;
    return v1Ok(requestId, answer, 201);
  } catch (error) {
    /*
     * A FAILED ATTEMPT GIVES THE KEY BACK.
     *
     * Without this, an order that fell over on a database hiccup would hold
     * its key for ever and every retry would meet `IDEMPOTENCY_IN_PROGRESS`
     * — the caller permanently unable to place an order it never placed.
     *
     * `claimed` is cleared the moment the answer is stored, so this never
     * deletes a key that has a real answer behind it.
     */
    if (claimed) await releaseIdempotency(claimed.companyId, claimed.key);
    return v1ErrorResponse(requestId, error);
  }
}
