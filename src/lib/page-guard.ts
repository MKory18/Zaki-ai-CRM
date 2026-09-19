import { cache } from 'react';
import { cookies } from 'next/headers';
import { forbidden, notFound, redirect } from 'next/navigation';
import { getCurrentUser } from './auth';
import { findRoute, canAccessRoute, type RouteDef } from './route-registry';
import { CONTEXT_COOKIE, readSelection, validateSelection } from './geo-context';
import { db } from './db';
import type { SessionUser } from '@/types/auth';

/**
 * Server-side guards for shell pages. The sidebar only hides links; these
 * decide. A route outside the registry is a 404, a route the user may not
 * open is a real 403 (forbidden()), and every shell page needs a valid
 * country + store selection (otherwise -> /entry).
 */

/** One user lookup per request, shared by the layout and the page. */
export const sessionUser = cache(getCurrentUser);

/**
 * Signed-in, ACTIVE user with a company, or a redirect. The SessionUser
 * object is returned as-is: its effective grants live in a WeakMap keyed on
 * that exact object, so copying it would silently drop every scope.
 */
export async function requireActiveUser(): Promise<{ user: SessionUser; companyId: string }> {
  const user = await sessionUser();
  if (!user) redirect('/login');
  if (user.status === 'PENDING') redirect('/pending');
  if (user.status !== 'ACTIVE') redirect('/login?suspended=1');
  const companyId =
    user.companyId ??
    (user.role === 'SUPER_ADMIN' ? (await db.company.findFirst({ select: { id: true } }))?.id ?? null : null);
  if (!companyId) redirect('/login');
  return { user, companyId };
}

/** The selected country + store, validated against current access; else -> /entry. */
export const requireShellContext = cache(async () => {
  const { user, companyId } = await requireActiveUser();
  const jar = await cookies();
  const sel = await readSelection(user.id, jar.get(CONTEXT_COOKIE)?.value);
  if (!sel?.storeId) redirect('/entry');
  const valid = await validateSelection(user, companyId, sel.countryId, sel.storeId).catch(() => null);
  if (!valid?.storeId) redirect('/entry');

  const store = await db.store.findFirst({
    where: { id: valid.storeId, companyId },
    select: {
      id: true, name: true, logo: true, status: true,
      country: { select: { id: true, name: true, code: true, currencyCode: true } },
    },
  });
  if (!store) redirect('/entry');
  return { user, companyId, store };
});

/** Guard for one contract route: 404 outside the contract, 403 without permission. */
export async function guardRoute(path: string): Promise<{ user: SessionUser; route: RouteDef }> {
  const route = findRoute(path);
  if (!route) notFound();
  const { user } = await requireShellContext();
  if (!canAccessRoute(user, route)) forbidden();
  return { user, route };
}
