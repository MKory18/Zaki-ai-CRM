import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { manageableUsersWhere } from '@/lib/manageable-user';
import { performanceSettings } from '@/lib/performance-settings';
import { currentSpan } from '@/lib/commission-period';
import { scoreRole } from '@/lib/performance-metrics';
import { peersOf } from '@/lib/performance-people';
import { bandsForRole } from '@/lib/performance-score';
import {
  byEmployeeGrade,
  gradeEmployee,
  rosterReadiness,
  type EmployeeFacts,
  type EmployeeGrade,
  type EmployeeTrace,
} from '@/lib/employee-grade';

/**
 * GET /api/users/grades?ids=… — the grade for the employees on one page.
 *
 * THE SCORE IS FETCHED, NOT COMPUTED. Every number this route returns for
 * quality comes out of `scoreRole` — the same function `/api/performance/card`
 * and `/api/performance/team` call, over the same window, from the same
 * settings. A person's grade on the employees list and on their own card are
 * therefore the same number by construction, not by two pieces of arithmetic
 * happening to agree.
 *
 * WHAT IS READ HERE AND NOWHERE ELSE is presence: whether an account has ever
 * recorded an action, over how many distinct days, and how long ago the last
 * one was. Measured on this database, six of nineteen accounts have never
 * recorded one — a fact no screen in this system could previously state.
 *
 * BY ID LIST, DELIBERATELY. The employees list already owns the filters, the
 * search and the paging; a second route re-deriving them would drift from the
 * first and the grades would belong to a different set of rows than the names
 * beside them. So the screen loads its page and then asks about exactly the
 * people it is showing — which also bounds the work to one page's worth.
 *
 * And the ids are still filtered through `manageableUsersWhere`, because an id
 * arriving in a query string is a request, not a permission: asking about
 * another company's user must answer nothing rather than answer «not found»,
 * which is itself an answer.
 */

/** One page of the employees list, with room to spare. */
const MAX_IDS = 100;

/**
 * EVERY PLACE THIS SYSTEM RECORDS THAT A PERSON DID SOMETHING.
 *
 * Seven, and all seven are needed, because the roles divide across them: a
 * moderator appears as `orders.moderatorId` and may touch nothing else; a
 * confirmation agent appears in the claim history and the status log; a
 * warehouse keeper or an accountant appears ONLY in the audit log. A trace
 * built from the order tables alone would report the entire back office as
 * having never worked.
 *
 * `order_activities` is deliberately NOT among them. Measured: 89 rows, 13 of
 * which carry no `userId` at all, and every one of the other 76 is written
 * beside a row in one of the seven below — so it would inflate the count
 * without adding a single person.
 *
 * The union is scoped by company only and filtered by id once, in the outer
 * query: the alternative repeats the id list seven times for no gain, and the
 * company scope is what every one of these tables is indexed on.
 */
function traceSql(companyId: string, ids: string[], timezone: string) {
  return Prisma.sql`
    select uid,
           count(*)::int as events,
           count(distinct ((ts at time zone 'UTC') at time zone ${timezone})::date)::int as days,
           max(ts) as last_seen
    from (
      select "moderatorId" as uid, "createdAt" as ts from orders where "companyId" = ${companyId}
      union all
      select "confirmedById", "confirmedAt" from orders where "companyId" = ${companyId} and "confirmedAt" is not null
      union all
      select "userId", "createdAt" from order_claim_history where "companyId" = ${companyId}
      union all
      select "changedById", "createdAt" from order_status_logs where "companyId" = ${companyId}
      union all
      select "employeeId", "createdAt" from order_contact_attempts where "companyId" = ${companyId}
      union all
      select "userId", "createdAt" from audit_logs where "companyId" = ${companyId}
      union all
      select "deliveryAgentId", "createdAt" from delivery_attempts where "companyId" = ${companyId}
    ) ev
    where uid in (${Prisma.join(ids)})
    group by uid`;
}

interface TraceRow {
  uid: string;
  events: number;
  days: number;
  last_seen: Date | null;
}

const MS_PER_DAY = 86400000;

/**
 * WHOLE DAYS SINCE, FLOORED.
 *
 * Floored rather than rounded so that «قبل 14 يوماً» is never printed about
 * something that happened thirteen and a half days ago: the staleness floor
 * is a line somebody will argue about, and it must not be crossed by
 * rounding. Null in, null out — an account with no last action has no age,
 * and zero would read as «today».
 */
export function daysSince(last: Date | null, now: Date): number | null {
  if (!last) return null;
  return Math.max(0, Math.floor((now.getTime() - last.getTime()) / MS_PER_DAY));
}

export async function GET(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    // Two permissions, two different questions: may this person see the
    // roster at all, and may they see how people are performing. An admin who
    // manages accounts without monitoring the team gets the list without the
    // column, which is the same split `/api/performance/team` already makes.
    await requirePermission('users.view');
    await requirePermission('team.monitor');

    const asked = (new URL(req.url).searchParams.get('ids') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ids = [...new Set(asked)].slice(0, MAX_IDS);

    const settings = await performanceSettings(companyId);
    const span = currentSpan(settings.period === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY', new Date());

    if (ids.length === 0) {
      return NextResponse.json({
        window: { start: span.start, end: span.end, period: settings.period },
        minSample: settings.minSample,
        grades: [],
        readiness: rosterReadiness([]),
      });
    }

    // The one tenancy rule, in its list shape. Written by hand here as
    // `{ id: { in: ids }, companyId }` it would silently drop the unplaced
    // accounts a company admin is meant to see — the exact fault
    // manageable-user.ts was written to end.
    const people = await db.user.findMany({
      where: { AND: [manageableUsersWhere(user), { id: { in: ids } }] },
      select: { id: true, role: true, status: true },
    });

    const found = people.map((p) => p.id);
    const traces =
      found.length > 0
        ? await db.$queryRaw<TraceRow[]>(traceSql(companyId, found, country.timezone))
        : [];
    const byUser = new Map(traces.map((t) => [t.uid, t]));

    // One scored pass per role that HAS bands, not one per person: a volume
    // band is read against the best in the same role and store, so the whole
    // role has to be scored together or the reference is wrong. Roles with no
    // bands are not queried at all — there is nothing for the query to find.
    const roles = [...new Set(people.map((p) => p.role))].filter((r) => bandsForRole(r).length > 0);
    const calendar = {
      workHoursStart: country.workHoursStart,
      workHoursEnd: country.workHoursEnd,
      weekendDays: country.weekendDays,
      timezone: country.timezone,
    };
    const scope = { companyId, storeId, start: span.start, end: span.end, calendar };

    const scored = new Map<string, EmployeeFacts['scored']>();
    for (const role of roles) {
      const peers = await peersOf(db, { companyId, storeId, role });
      const rows = await scoreRole(scope, role, peers, settings.minSample);
      for (const row of rows) {
        scored.set(row.id, {
          total: row.score.total,
          possible: row.score.possible,
          sample: row.score.sample,
          minSample: row.score.minSample,
          rank: row.rank,
          of: row.of,
        });
      }
    }

    const now = new Date();
    const grades: EmployeeGrade[] = people
      .map((p) => {
        const t = byUser.get(p.id);
        const trace: EmployeeTrace = {
          events: t?.events ?? 0,
          activeDays: t?.days ?? 0,
          lastSeenDaysAgo: daysSince(t?.last_seen ?? null, now),
        };
        return gradeEmployee({ userId: p.id, role: p.role, status: p.status, trace, scored: scored.get(p.id) ?? null });
      })
      .sort(byEmployeeGrade);

    return NextResponse.json({
      window: { start: span.start, end: span.end, period: settings.period },
      minSample: settings.minSample,
      // Which store the quality half is scoped to. The row says so out loud:
      // a rank across stores would compare two different businesses.
      store: { id: storeId },
      grades,
      readiness: rosterReadiness(grades),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
