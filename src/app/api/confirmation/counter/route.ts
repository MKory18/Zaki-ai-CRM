import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { awaitingConfirmationCount, counterKindFor, waitingCount } from '@/lib/confirmation-queue';

/**
 * GET /api/confirmation/counter — a number, never a list.
 *
 *   POOL — for whoever may pull: how many orders are waiting to be pulled.
 *   MINE — for a moderator: how many of THEIR orders are not yet confirmed.
 *
 * The moderator's count is scoped to the session's own id and takes no
 * parameter, so there is no way to ask it about somebody else's orders.
 * Nothing here returns an order, an id or a name: the pool stays closed to
 * a moderator exactly as the queue route keeps it.
 */
export async function GET() {
  try {
    const { user, companyId, storeId } = await requireContext();
    const scope = { companyId, storeId };

    const kind = counterKindFor({
      pull: can(user, 'confirmation.pull') || can(user, 'confirmation.supervise'),
      create: can(user, 'orders.create'),
    });

    if (!kind) return NextResponse.json({ kind: null, count: 0 });

    const count =
      kind === 'POOL' ? await waitingCount(db, scope) : await awaitingConfirmationCount(db, scope, user.id);

    return NextResponse.json({ kind, count });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
