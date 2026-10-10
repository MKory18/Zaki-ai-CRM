import { NextResponse } from 'next/server';
import { db } from './db';
import { COOKIE_NAME, createSessionToken, sessionCookieOptions } from './auth';
import { ROLE_PERMISSIONS, type UserRole, type UserStatus } from '@/types/auth';
import { logAudit } from './audit';
import { markLogin } from './attendance';
import { createDeviceToken } from './auth';
import { DEVICE_COOKIE, TRUST_DAYS, claimsFor, deviceCookieOptions } from './trusted-device';

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
  /**
   * Recorded on the audit row so a sign-in says how it was proved. A
   * sign-in row that cannot say how it was proved is a trail nobody can
   * read backwards.
   *
   *   `password+passkey` — the fingerprint standing where the six digits
   *   stand, after the password was accepted.
   *
   *   `passkey` — the fingerprint standing where the WHOLE login stands.
   *   Not a weaker door: the signature covers the origin, so it cannot be
   *   phished; what is stored is a public key, so it cannot be breached
   *   out of us; and the device only signs after verifying the person, so
   *   it is possession and inherence together. It is written differently
   *   from the others precisely so the audit can tell them apart.
   */
  /**
   *   `password+device` — the password, and a device that proved the six
   *   digits within the last thirty days standing where the six digits
   *   stand. Written as its own word so the audit can answer «how many
   *   sign-ins skipped the code, and on whose devices» — which is the
   *   question somebody will ask of this feature first.
   */
  factor:
    | 'password'
    | 'password+totp'
    | 'password+recovery'
    | 'password+device'
    | 'password+passkey'
    | 'passkey';
  /**
   * «لا تطلب الرمز على هذا الجهاز» — the person ticked the box.
   *
   * IT IS SET HERE AND NOT IN THE ROUTE, and the rule that put it here is
   * worth repeating: `two-factor.test.ts` forbids either door writing a
   * cookie of its own, because the day one route is allowed to set one is
   * the day a route sets the SESSION cookie without the `tokenVersion`
   * bump. So everything a successful sign-in grants is granted in this one
   * function, and «no cookies in the routes» stays a rule with no
   * exception rather than a rule with one.
   */
  trustDevice?: boolean;
  /**
   * The moment the authenticator was enrolled, which the trust token
   * carries so that resetting 2FA revokes every device at once. Passed in
   * rather than re-read: the caller has the row already, and a second read
   * is a second chance to read a different one.
   */
  totpEnabledAt?: Date | null;
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

  /**
   * THE TRUSTED DEVICE, GRANTED ONLY BY PROVING THE SECOND FACTOR.
   *
   * Two independent reasons have to agree before a device is trusted, and
   * that is deliberate on a security rule:
   *
   *   · the caller asked for it — the person ticked the box, and the only
   *     caller that passes it is the one that just accepted a six-digit
   *     code;
   *   · and the factor is not a recovery code. A recovery code means the
   *     authenticator was not to hand, which is also what it means when
   *     somebody else is holding the account. One printed code must not buy
   *     thirty days of skipping the second factor, and printed codes are
   *     exactly what gets photographed.
   *
   * Either reason alone refuses. A caller that forgets the second is still
   * refused here; a function that forgot it would still be refused by the
   * caller.
   */
  if (input.trustDevice && input.factor === 'password+totp' && input.totpEnabledAt) {
    response.cookies.set(
      DEVICE_COOKIE,
      await createDeviceToken(claimsFor({ id: user.id, totpEnabledAt: input.totpEnabledAt })),
      deviceCookieOptions()
    );
    await logAudit({
      companyId: user.companyId || 'platform',
      userId: user.id,
      action: 'TWO_FACTOR_DEVICE_TRUSTED',
      entity: 'User',
      entityId: user.id,
      newData: { ip, days: TRUST_DAYS },
    });
  }

  return response;
}
