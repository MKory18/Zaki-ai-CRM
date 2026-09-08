import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME } from '@/lib/auth';
import { getCurrentUser } from '@/lib/auth';
import { UserRole, UserStatus, ROLE_PERMISSIONS } from '@/types/auth';

/**
 * DEMO-ONLY account switcher — STRICTLY DISABLED IN PRODUCTION.
 *
 * Security: this endpoint mints a session for an arbitrary email and must
 * never be reachable in production. Fail-closed: NODE_ENV must be a
 * non-production value AND ALLOW_DEMO_SWITCH must be explicitly "true".
 * The server rejects — never rely on hiding UI elements.
 */
export async function POST(req: Request) {
  // Fail closed: only explicit opt-in outside production
  const allowed =
    process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_SWITCH === 'true';
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    // Even in dev, require an authenticated SUPER_ADMIN to perform switches
    const actor = await getCurrentUser();
    if (!actor || actor.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { company: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const role = user.role as UserRole;
    const status = user.status as UserStatus;

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role,
      status,
      companyId: user.companyId,
      tv: user.tokenVersion,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        status,
        companyId: user.companyId,
        companyName: user.company?.name,
        commissionRate: user.commissionRate,
        permissions: ROLE_PERMISSIONS[role] || [],
      },
    });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      ...sessionCookieOptions(true),
    });

    return response;
  } catch (e: any) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
