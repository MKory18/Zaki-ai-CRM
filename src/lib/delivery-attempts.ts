import type { Prisma } from '@prisma/client';
import type { db } from './db';
import type { DeliveryAttemptResult } from './shipping-workflow';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * THE KNOCK ON THE DOOR — ONE PLACE THAT WRITES IT.
 *
 * `delivery_attempts` measured 0 rows against 166 orders, and the reason was
 * not that nobody delivered anything. Three things end a delivery in this
 * product and NONE of them wrote here:
 *
 *   • the manual transition (`/api/orders/[id]/shipping`) — it moved the
 *     order to DELIVERED and recorded nothing;
 *   • the door-side partial delivery (`recordPartialDelivery`) — the screen
 *     built for the person standing at the door, recording no attempt;
 *   • the courier feed — which is not allowed to assert a delivery at all
 *     (`COURIER_CANNOT_ASSERT`), correctly, and so writes nothing either.
 *
 * The single row that DID get written came from the browser: the failure
 * modal POSTed the attempt and then PATCHed the transition, as two requests.
 * That is the wrong shape twice over. It is not atomic — an attempt could be
 * appended to a permanent, append-only audit table for a transition that
 * then failed, or that the person abandoned by closing the tab — and it put
 * the rule in the one place a client can decline to run it.
 *
 * WHAT THE EMPTINESS COST. Only failures were ever written, so the count
 * shown on the tracking screen as «محاولات» was a count of failures: an
 * order delivered on the first knock read 0, and one delivered on the third
 * read 2. «Delivered first time» and «attempts per delivery» — the two
 * numbers that say whether a courier is any good — were not computable from
 * the table built to hold them, because the successes were never there.
 *
 * So the attempt is now appended in the SAME transaction as the status
 * change, beside `consumeOrderStock`, for the same reason it is: there must
 * be no instant in which an order is delivered and the delivery is not
 * recorded.
 */
export async function appendDeliveryAttempt(
  tx: Tx,
  input: {
    orderId: string;
    companyId: string;
    result: DeliveryAttemptResult;
    /** Required by the schema whenever the result is FAILED. */
    failureReason?: string | null;
    note?: string | null;
    /** Falls back to the order's assigned provider when not given. */
    deliveryProviderId?: string | null;
    /** The actor, or null when nobody pressed anything. */
    userId?: string | null;
  }
) {
  // `@@unique([orderId, attemptNumber])` is the backstop: two attempts racing
  // to be number three means one transaction fails rather than two rows
  // claiming the same position in the history.
  const last = await tx.deliveryAttempt.findFirst({
    where: { orderId: input.orderId },
    orderBy: { attemptNumber: 'desc' },
    select: { attemptNumber: true },
  });

  return tx.deliveryAttempt.create({
    data: {
      companyId: input.companyId,
      orderId: input.orderId,
      deliveryProviderId: input.deliveryProviderId ?? null,
      deliveryAgentId: input.userId ?? null,
      attemptNumber: (last?.attemptNumber ?? 0) + 1,
      result: input.result,
      failureReason: input.result === 'FAILED' ? (input.failureReason ?? 'OTHER') : null,
      note: input.note?.trim() || null,
    },
  });
}
