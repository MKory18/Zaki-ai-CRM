import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { apiErrorResponse } from '@/lib/api-error';
import { markAttendance } from '@/lib/attendance';

/**
 * POST /api/attendance/mark — "استلمت" / "سلّمت".
 *
 * Only ever for yourself. Marking somebody else's arrival is the one thing
 * an attendance system must not allow, so there is no userId in the body to
 * forge: the mark is written for whoever is holding the session.
 *
 * The login already records an automatic arrival. This button exists for
 * the hours that leave no trace in the order records — a meeting, a
 * training, a shift spent waiting for a queue that stayed empty — and for
 * saying plainly "I have finished for today".
 */

const schema = z.object({
  kind: z.enum(['CHECK_IN', 'CHECK_OUT']),
  note: z.string().trim().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireContext();

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
    }
    const { kind, note } = parsed.data;

    // Pressing the same button twice in a row is a slip, not a second
    // arrival. The earlier mark stands; a day must not gain minutes because
    // somebody double-tapped.
    const since = new Date(Date.now() - 60 * 1000);
    const recent = await db.attendanceMark.findFirst({
      where: { userId: user.id, kind, at: { gte: since } },
      select: { id: true, at: true },
    });
    if (recent) {
      return NextResponse.json({ ok: true, at: recent.at, duplicate: true });
    }

    const written = await markAttendance({
      companyId,
      userId: user.id,
      kind,
      source: 'MANUAL',
      note: note ?? null,
    });

    return NextResponse.json({ ok: true, at: written.at, kind });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/**
 * GET /api/attendance/mark — where today stands for the person asking, so
 * the button can say "استلمت" or "سلّمت" rather than guessing.
 */
export async function GET() {
  try {
    const { user, country } = await requireContext();

    // Midnight in the country's own day, not the server's.
    const now = new Date();
    const dayStart = new Date(now.getTime() - 26 * 60 * 60 * 1000);

    const marks = await db.attendanceMark.findMany({
      where: { userId: user.id, at: { gte: dayStart } },
      select: { kind: true, at: true, source: true },
      orderBy: { at: 'asc' },
    });

    const local = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: country.timezone });
    const today = local(now);
    const todays = marks.filter((m) => local(m.at) === today);

    const arrivals = todays.filter((m) => m.kind !== 'CHECK_OUT');
    const departures = todays.filter((m) => m.kind === 'CHECK_OUT');

    return NextResponse.json({
      arrivedAt: arrivals[0]?.at ?? null,
      leftAt: departures[departures.length - 1]?.at ?? null,
      checkedIn: todays.some((m) => m.kind === 'CHECK_IN'),
      shift: { start: country.workHoursStart, end: country.workHoursEnd },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
