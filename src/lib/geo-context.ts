import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { db } from './db';
import { requireCompanyTenant } from './auth';
import { can } from './authorization';
import type { SessionUser } from '@/types/auth';

/**
 * GEO CONTEXT — Company -> Country -> Store.
 *
 * The selected country + store live in a signed, HTTP-only cookie bound to
 * the user id. Every business API resolves them through requireContext();
 * a request without both is rejected here, never in the UI.
 *
 * Access rules:
 *   - SUPER_ADMIN and geo.manage holders enter every country of the company.
 *   - Everyone else enters only countries listed in UserCountryAccess.
 *   - Inside a country, UserStoreAccess rows narrow the stores; no rows for
 *     that country = every store of the country.
 */

export const CONTEXT_COOKIE = 'salesflow_ctx';

export class ContextError extends Error {
  constructor(public code: 'CONTEXT_REQUIRED' | 'STORE_REQUIRED', message: string) {
    super(message);
    this.name = 'ContextError';
  }
}

export interface GeoContext {
  user: SessionUser;
  companyId: string;
  countryId: string;
  storeId: string;
  country: {
    id: string;
    code: string;
    name: string;
    currencyCode: string;
    minorUnit: number;
    timezone: string;
    orderPrefix: string;
    allowNegativeStock: boolean;
  };
}

type Selection = { countryId: string; storeId: string | null };

function secret(): Uint8Array {
  // Same secret policy as the session token (auth.ts); the payload is bound
  // to the user id so a context cookie is useless for any other account.
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === 'production') throw new Error('SECURITY: JWT_SECRET is required');
    return new TextEncoder().encode('development_only_insecure_jwt_secret_key_0000');
  }
  return new TextEncoder().encode(s);
}

export async function signSelection(userId: string, sel: Selection): Promise<string> {
  return new SignJWT({ u: userId, c: sel.countryId, s: sel.storeId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
}

export async function readSelection(userId: string, token: string | undefined): Promise<Selection | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.u !== userId || typeof payload.c !== 'string') return null;
    return { countryId: payload.c, storeId: typeof payload.s === 'string' ? payload.s : null };
  } catch {
    return null;
  }
}

export function contextCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };
}

/** True when the user sees every country of the company. */
export function seesAllCountries(user: SessionUser): boolean {
  return user.role === 'SUPER_ADMIN' || can(user, 'geo.manage');
}

/** Active countries the user may enter, with their active store counts. */
export async function listAccessibleCountries(user: SessionUser, companyId: string) {
  const where = seesAllCountries(user)
    ? { companyId, isActive: true }
    : { companyId, isActive: true, access: { some: { userId: user.id } } };
  const countries = await db.country.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true, code: true, name: true, currencyCode: true,
      _count: { select: { stores: { where: { status: 'ACTIVE' } } } },
    },
  });
  return countries.map(({ _count, ...c }) => ({ ...c, activeStores: _count.stores }));
}

/** Stores of one accessible country the user may enter (null = country not accessible). */
export async function listAccessibleStores(user: SessionUser, companyId: string, countryId: string) {
  const country = await db.country.findFirst({
    where: seesAllCountries(user)
      ? { id: countryId, companyId, isActive: true }
      : { id: countryId, companyId, isActive: true, access: { some: { userId: user.id } } },
    select: { id: true },
  });
  if (!country) return null;

  const narrowed = seesAllCountries(user)
    ? 0
    : await db.userStoreAccess.count({ where: { userId: user.id, store: { countryId } } });

  return db.store.findMany({
    where: {
      companyId,
      countryId,
      ...(narrowed > 0 ? { access: { some: { userId: user.id } } } : {}),
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, logo: true, status: true, type: true },
  });
}

/**
 * Validates a selection against the database and the user's access.
 * Switching country without a storeId clears the store — it is never
 * carried over from the previous country.
 */
export async function validateSelection(
  user: SessionUser,
  companyId: string,
  countryId: string,
  storeId: string | null
): Promise<Selection> {
  const stores = await listAccessibleStores(user, companyId, countryId);
  if (!stores) throw new Error('Forbidden: country not accessible');
  if (storeId === null) return { countryId, storeId: null };
  if (!stores.some((s) => s.id === storeId)) throw new Error('Forbidden: store not accessible in this country');
  return { countryId, storeId };
}

/**
 * Entry resolution for the pickers. Applies the skip rules server-side:
 * one accessible country -> selected without asking; one store in it ->
 * selected too. Returns the (possibly new) selection and what to show next.
 */
export async function resolveEntry(user: SessionUser, companyId: string, current: Selection | null) {
  const countries = await listAccessibleCountries(user, companyId);

  let selection: Selection | null = null;
  if (current && countries.some((c) => c.id === current.countryId)) {
    selection = await validateSelection(user, companyId, current.countryId, current.storeId).catch(() => ({
      countryId: current.countryId,
      storeId: null,
    }));
  }
  if (!selection && countries.length === 1) selection = { countryId: countries[0].id, storeId: null };

  let stores: Awaited<ReturnType<typeof listAccessibleStores>> = null;
  if (selection) {
    stores = await listAccessibleStores(user, companyId, selection.countryId);
    if (selection.storeId === null && stores && stores.length === 1) {
      selection = { ...selection, storeId: stores[0].id };
    }
  }

  const next: 'PICK_COUNTRY' | 'NO_COUNTRY' | 'CREATE_FIRST_STORE' | 'PICK_STORE' | 'READY' =
    countries.length === 0
      ? 'NO_COUNTRY'
      : !selection
        ? 'PICK_COUNTRY'
        : !stores || stores.length === 0
          ? 'CREATE_FIRST_STORE'
          : !selection.storeId
            ? 'PICK_STORE'
            : 'READY';

  return {
    countries,
    stores: stores ?? [],
    selection,
    next,
    canAddCountry: can(user, 'geo.manage'),
    canAddStore: can(user, 'geo.manage'),
    skipCountryPicker: countries.length === 1,
  };
}

/**
 * Service-layer guard: resolves tenant + country + store for this request.
 * Throws ContextError when the selection is missing, and a Forbidden error
 * when it no longer matches the user's access (revoked, store moved, ...).
 */
export async function requireContext(): Promise<GeoContext> {
  const { user, companyId } = await requireCompanyTenant();
  const jar = await cookies();
  const sel = await readSelection(user.id, jar.get(CONTEXT_COOKIE)?.value);
  if (!sel) throw new ContextError('CONTEXT_REQUIRED', 'Country and store must be selected');
  if (!sel.storeId) throw new ContextError('STORE_REQUIRED', 'A store must be selected');

  const valid = await validateSelection(user, companyId, sel.countryId, sel.storeId);
  const country = await db.country.findFirst({
    where: { id: valid.countryId, companyId },
    select: {
      id: true, code: true, name: true, currencyCode: true, minorUnit: true,
      timezone: true, orderPrefix: true, allowNegativeStock: true,
    },
  });
  if (!country) throw new Error('Forbidden: country not accessible');
  return { user, companyId, countryId: country.id, storeId: valid.storeId as string, country };
}
