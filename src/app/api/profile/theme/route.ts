import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { apiErrorResponse } from '@/lib/api-error';
import { sanitizeTheme } from '@/lib/system-themes';

/**
 * PATCH /api/profile/theme — which look this person chose.
 *
 * No permission: it is their own eyes. A system that lets somebody pick a
 * dark theme only if an administrator remembered to tick a box is a system
 * somebody works around by turning the screen brightness down.
 *
 * Always THEIR row, never an id from the body. A theme is harmless, but
 * "the id came from the request" is how a harmless endpoint becomes the way
 * somebody writes to another person's record.
 */
export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const body = (await req.json().catch(() => null)) as { theme?: unknown } | null;

    // An unknown key becomes the default rather than being stored: a value
    // this build does not know renders a screen with no colours at all.
    const theme = sanitizeTheme(body?.theme);

    await db.user.update({ where: { id: user.id }, data: { systemTheme: theme } });
    return NextResponse.json({ theme });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
