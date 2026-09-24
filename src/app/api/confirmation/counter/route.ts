import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ContextError, requireContext } from '@/lib/geo-context';
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
    // No store chosen — in this tab or, through the shared cookie, in
    // another — is "no counter", not an error. This route is POLLED in the
    // background; answering 400 made the client send the whole tab to the
    // store picker, mid-form, without a click.
    let context;
    try {
      context = await requireContext();
    } catch (e) {
      if (e instanceof ContextError) return NextResponse.json({ kind: null, count: 0 });
      throw e;
    }
    const { user, companyId, storeId } = context;
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
