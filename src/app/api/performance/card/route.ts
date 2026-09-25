import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { performanceSettings } from '@/lib/performance-settings';
import { currentSpan } from '@/lib/commission-period';
import { scoreRole } from '@/lib/performance-metrics';
import { owedTo } from '@/lib/commission-payout';
import { peersOf } from '@/lib/performance-people';

/**
 * GET /api/performance/card?userId= — one person's performance card.
 *
 * Their OWN card needs no permission. They are their own numbers, and a
 * system that shows somebody their delivery rate only if an administrator
 * remembered to tick a box is a system where nobody knows where they stand.
 *
 * Somebody ELSE's card is a different decision and needs `team.monitor`.
 *
 * What comes back is the score BAND BY BAND — never one opaque figure. A
 * person told "your score is 71" can do nothing with it; a person told
 * which band cost them the points can.
 */
export async function GET(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();

    const asked = new URL(req.url).searchParams.get('userId') || user.id;
    const own = asked === user.id;
    if (!own && !can(user, 'team.monitor')) {
      return NextResponse.json({ error: 'Forbidden: missing required permission team.monitor' }, { status: 403 });
    }

    const person = await db.user.findFirst({
      where: { id: asked, companyId },
      select: { id: true, name: true, role: true, commissionCurrency: true },
    });
    if (!person) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });

    const settings = await performanceSettings(companyId);
    const span = currentSpan(settings.period === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY', new Date());
    const calendar = {
      workHoursStart: country.workHoursStart,
      workHoursEnd: country.workHoursEnd,
      weekendDays: country.weekendDays,
      timezone: country.timezone,
    };

    // The whole role is scored in one pass, because a volume has no meaning
    // without the role's own numbers to read it against — and because the
    // rank then comes from the same pass instead of a second query that
    // could disagree with the first.
    const peers = await peersOf(db, { companyId, storeId, role: person.role });
    const rows = await scoreRole(
      { companyId, storeId, start: span.start, end: span.end, calendar },
      person.role,
      peers,
      settings.minSample
    );
    const mine = rows.find((r) => r.id === person.id) ?? null;

    // What they are owed right now, from the ledger that already knows.
    const owed = await owedTo(db, { companyId, userId: person.id }).catch(() => null);

    return NextResponse.json({
      person: { id: person.id, name: person.name, role: person.role },
      window: { start: span.start, end: span.end, period: settings.period },
      bars: { deliveryRate: settings.deliveryRateBar, issuesRate: settings.issuesRateBar },
      score: mine?.score ?? null,
      // Rank within this role and this store. Never across roles: the bands
      // a role cannot earn are not the same bands.
      rank: mine ? { position: mine.rank, of: mine.of } : null,
      owed,
      currency: person.commissionCurrency ?? country.currencyCode,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
