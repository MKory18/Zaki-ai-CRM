import { NextResponse } from 'next/server';
import { requireContext } from '@/lib/geo-context';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * GET /api/orders/follow-ups — CLOSED (410), and why it is closed rather
 * than fixed.
 *
 * The follow-up queues computed on the server's clock, from before the
 * confirmation screens. Nothing calls it: «طلباتي» and «المتابعة» read
 * `/api/confirmation/*`. It asked for no permission at all, and decided
 * what to show by role NAME — managers and accountants got every follow-up
 * order in the company, agents and moderators their own plus the whole
 * unclaimed pool, with names and phones.
 *
 * A second copy of the confirmation rules, kept in step with the first by
 * nobody, is how this one drifted. So it answers 410 with where to go, and
 * the git history keeps what it was.
 */
export async function GET() {
  try {
    await requireContext();
    return NextResponse.json(
      {
        error: 'هالباب انسكّر — المتابعات بشاشة «طلباتي» و«المتابعة».',
        errorAr: 'هالباب انسكّر — المتابعات بشاشة «طلباتي» و«المتابعة».',
        code: 'GONE',
      },
      { status: 410 }
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
