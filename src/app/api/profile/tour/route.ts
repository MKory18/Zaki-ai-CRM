import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * PATCH /api/profile/tour — «I have seen the walkthrough; do not open it again».
 *
 * The first-run tour lives ONCE per person, on their row: `tourDoneAt`. The
 * session carries it, the shell reads it, and this is the only door that
 * writes it. Like `/api/profile/theme` it takes no permission — it is the
 * person's own eyes — and it always writes THEIR row, never an id from the
 * body: «the id came from the request» is how a harmless endpoint becomes
 * the way somebody writes to another person's record.
 *
 * There is no DELETE and no «show me the tour again» toggle: a tour that
 * somebody can be walked through again by an endpoint is a tour that can
 * ambush a person who already said no. Resetting it is a decision on the
 * user row, by hand, if it is ever wanted at all.
 *
 * A body is accepted and ignored. The dismissal is a fact about the person,
 * not a value somebody posts: any successful call means «dismissed, now».
 */
export async function PATCH() {
  try {
    const user = await requireAuth();
    await db.user.update({
      where: { id: user.id },
      data: { tourDoneAt: new Date() },
    });
    return NextResponse.json({ tourDoneAt: new Date().toISOString() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
