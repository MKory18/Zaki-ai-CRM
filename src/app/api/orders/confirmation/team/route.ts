import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * GET /api/orders/confirmation/team — every confirmation employee at once.
 *
 * The per-employee endpoint answers "how am I doing"; a manager asking "who
 * is doing well" needed one request per employee and had no list to start
 * from. This is the same arithmetic over everyone who has actually claimed
 * an order, computed in grouped queries rather than a loop of round trips.
 *
 * An employee with no claimed orders is not listed: a row of zeros for
 * somebody whose job is not confirmation reads as bad performance.
 */
export async function GET() {
  try {
    const { user, companyId, storeId } = await requireContext();

    const mayViewTeam =
      can(user, 'users.view') || ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER'].includes(user.role);
    if (!mayViewTeam) {
      return NextResponse.json({ error: 'Forbidden: cannot view team performance' }, { status: 403 });
    }

    const base = { companyId, storeId, claimedById: { not: null } };

    // One grouped pass per question, rather than a query per employee.
    const [claimed, confirmed, rejected, noAnswer] = await Promise.all([
      db.order.groupBy({ by: ['claimedById'], where: base, _count: { _all: true } }),
      db.order.groupBy({
        by: ['claimedById'],
        where: { ...base, confirmationStatus: 'CONFIRMED' },
        _count: { _all: true },
      }),
      db.order.groupBy({
        by: ['claimedById'],
        where: { ...base, confirmationStatus: { in: ['REJECTED', 'CANCELLED'] } },
        _count: { _all: true },
      }),
      db.order.groupBy({
        by: ['claimedById'],
        where: { ...base, confirmationStatus: { in: ['NO_ANSWER', 'FOLLOW_UP_REQUIRED'] } },
        _count: { _all: true },
      }),
    ]);

    const ids = [...new Set(claimed.map((r) => r.claimedById).filter(Boolean) as string[])];
    if (ids.length === 0) return NextResponse.json({ employees: [] });

    // Looked up by id alone, and that is not a hole: the ids came from
    // orders already scoped to this company and store, so whoever claimed
    // them was operating here. Demanding user.companyId as well would drop
    // a platform-level owner — whose own row carries no company — from the
    // list of people who did the work.
    const people = await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, role: true },
    });
    const nameOf = new Map(people.map((p) => [p.id, p]));
    const countOf = (rows: typeof claimed, id: string) =>
      rows.find((r) => r.claimedById === id)?._count._all ?? 0;

    const employees = ids
      .map((id) => {
        const person = nameOf.get(id);
        const total = countOf(claimed, id);
        const ok = countOf(confirmed, id);
        const no = countOf(rejected, id);
        // Processed means decided: an order still being worked is neither a
        // success nor a failure, and counting it as one would punish whoever
        // is holding the most work right now.
        const processed = ok + no;
        return {
          id,
          name: person?.name ?? '—',
          role: person?.role ?? null,
          claimed: total,
          confirmed: ok,
          rejected: no,
          noAnswer: countOf(noAnswer, id),
          processed,
          open: total - processed,
          confirmationRate: processed > 0 ? Math.round((ok / processed) * 100) : null,
        };
      })
      .sort((a, b) => b.claimed - a.claimed);

    return NextResponse.json({ employees });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
