import { NextResponse } from 'next/server';
import { db } from './db';
import { COOKIE_NAME, createSessionToken, sessionCookieOptions } from './auth';
import { ROLE_PERMISSIONS, type UserRole, type UserStatus } from '@/types/auth';
import { logAudit } from './audit';
import { markLogin } from './attendance';

/**
 * ISSUING A SESSION — ONE PLACE, BECAUSE THERE ARE NOW TWO DOORS.
 *
 * Before the second factor there was one: the login route did the password,
 * the version bump, the attendance mark, the audit row and the cookie, all
 * in a line. Now a protected role signs in through `/api/auth/2fa/verify`
 * instead, and a second copy of that line would be the place where one of
 * them quietly stops bumping `tokenVersion` — which is the rule that makes
 * an account work on one device at a time.
 *
 * THE VERSION BUMP BELONGS HERE AND NOWHERE EARLIER. Bumping it when the
 * password is accepted would sign the person out of the device they are
 * already using, before they have proved anything — so a stolen password
 * alone could log an owner out of their own session, over and over, without
 * ever getting in.
 */
export async function issueSession(input: {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    companyId: string | null;
    commissionRate: unknown;
    company?: { name: string } | null;
  };
  remember: boolean;
  ip: string;
  /** Recorded on the audit row so a sign-in says how it was proved. */
  /**
   * `password+passkey` is a fingerprint standing where the six digits
   * stand — never where the password stands. A sign-in row that cannot
   * say how it was proved is a trail nobody can read backwards.
   */
  factor: 'password' | 'password+totp' | 'password+recovery' | 'password+passkey';
}): Promise<NextResponse> {
  const { user, remember, ip } = input;

  const refreshed = await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });

  await markLogin(user.companyId, user.id);

  await logAudit({
    companyId: user.companyId || 'platform',
    userId: user.id,
    action: 'USER_LOGGED_IN',
    entity: 'User',
    entityId: user.id,
    newData: { email: user.email, role: user.role, status: user.status, ip, factor: input.factor },
  });

  const role = user.role as UserRole;
  const status = user.status as UserStatus;

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    role,
    status,
    companyId: user.companyId,
    tv: refreshed.tokenVersion,
    remember,
  });

  const response = NextResponse.json({
    success: true,
    status,
    role,
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

  response.cookies.set({ name: COOKIE_NAME, value: token, ...sessionCookieOptions(remember) });
  return response;
}
