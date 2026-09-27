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
    // Business calendar: SLA counters freeze outside these hours.
    workHoursStart: string;
    workHoursEnd: string;
    weekendDays: number[];
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

/**
 * Active countries the user may enter, with their active store counts.
 *
 * SOMEBODY CONFINED TO NAMED STORES IS OFFERED ONLY THE COUNTRIES THOSE
 * STORES ARE IN. Without this the picker still listed a country where the
 * reach rule now grants them nothing — a door that opens onto an empty
 * room, and the person concludes the system is broken rather than that
 * they were never given anything there.
 */
export async function listAccessibleCountries(user: SessionUser, companyId: string) {
  const seesAll = seesAllCountries(user);
  const granted = seesAll
    ? []
    : await db.userStoreAccess.findMany({
        where: { userId: user.id },
        select: { store: { select: { countryId: true } } },
      });
  const namedCountries = new Set(granted.map((g) => g.store.countryId));

  const where = seesAll
    ? { companyId, isActive: true }
    : {
        companyId,
        isActive: true,
        access: { some: { userId: user.id } },
        ...(namedCountries.size > 0 ? { id: { in: [...namedCountries] } } : {}),
      };
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

/**
 * THE STORE-ENTRY RULE, with the facts already loaded.
 *
 * Pure on purpose. The pickers ask it for one user and every store of a
 * country; the notification fan-out asks it for every employee and one
 * store, from a worker process that has no session and no cookie. Both
 * must get the same answer, so there is one copy of the rule and each
 * caller only decides how to load the facts.
 */
export interface StoreReachFacts {
  /** SUPER_ADMIN or geo.manage — see seesAllCountries(). */
  seesAll: boolean;
  /** The store's country is active and belongs to the company. */
  countryOpen: boolean;
  /** The user has a UserCountryAccess row for that country. */
  countryAssigned: boolean;
  /** The user's UserStoreAccess rows inside that country. */
  storesInCountry: readonly string[];
  /**
   * WHETHER THIS USER WAS GIVEN NAMED STORES AT ALL — IN ANY COUNTRY.
   *
   * This used to be read per country only, and "no rows in this country"
   * was taken to mean "every store in it". So an employee granted one
   * store in Syria, and the country Libya, reached EVERY Libyan store —
   * measured: eight employees granted one store reached two. Which is
   * exactly the report: «أعطيه صلاحية على متجر معيّن، بدخل على كلّ
   * الدول والمتاجر».
   *
   * The distinction the rule was missing: somebody with NO store grant
   * anywhere is governed by their country grants, which is the ordinary
   * case and stays. Somebody who WAS given named stores is confined to
   * them — in every country, including ones where nobody thought to name
   * a store for them.
   */
  hasStoreGrants: boolean;
}

export function reachesStore(facts: StoreReachFacts, storeId: string): boolean {
  if (!facts.countryOpen) return false;
  if (facts.seesAll) return true;
  if (!facts.countryAssigned) return false;
  // Named stores mean those stores. A country with none named for them is
  // a country they may enter and find nothing in — not one they own.
  if (facts.hasStoreGrants) return facts.storesInCountry.includes(storeId);
  return true;
}

/** Stores of one accessible country the user may enter (null = country not accessible). */
export async function listAccessibleStores(user: SessionUser, companyId: string, countryId: string) {
  const seesAll = seesAllCountries(user);
  // The access filter inside the query answers countryOpen AND
  // countryAssigned at once: a country that comes back is both.
  const country = await db.country.findFirst({
    where: seesAll
      ? { id: countryId, companyId, isActive: true }
      : { id: countryId, companyId, isActive: true, access: { some: { userId: user.id } } },
    select: { id: true },
  });
  if (!country) return null;

  // Every store they were named, not only the ones in this country: the
  // rule needs to know whether they were named ANY, because that is what
  // decides whether an unnamed country is open or empty.
  const granted = seesAll
    ? []
    : await db.userStoreAccess.findMany({
        where: { userId: user.id },
        select: { storeId: true, store: { select: { countryId: true } } },
      });
  const storesInCountry = granted.filter((a) => a.store.countryId === countryId).map((a) => a.storeId);

  const stores = await db.store.findMany({
    where: { companyId, countryId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, logo: true, status: true, type: true },
  });
  const facts: StoreReachFacts = {
    seesAll,
    countryOpen: true,
    countryAssigned: true,
    storesInCountry,
    hasStoreGrants: granted.length > 0,
  };
  return stores.filter((s) => reachesStore(facts, s.id));
}

/**
 * Which of these users may enter this store — the same rule as the
 * pickers, for many users at once and without a session.
 *
 * Three queries whatever the number of users: the store, the country
 * assignments, the store narrowings. The users must carry their grants
 * (seesAllCountries asks can() about geo.manage).
 */
export async function usersReachingStore(
  users: readonly SessionUser[],
  companyId: string,
  storeId: string
): Promise<Set<string>> {
  const reached = new Set<string>();
  if (users.length === 0) return reached;

  const store = await db.store.findFirst({
    where: { id: storeId, companyId },
    select: { id: true, countryId: true, country: { select: { isActive: true, companyId: true } } },
  });
  if (!store) return reached;
  const countryOpen = !!store.country?.isActive && store.country.companyId === companyId;

  const narrowable = users.filter((u) => !seesAllCountries(u)).map((u) => u.id);
  const [assigned, narrowings] = narrowable.length
    ? await Promise.all([
        db.userCountryAccess.findMany({
          where: { userId: { in: narrowable }, countryId: store.countryId },
          select: { userId: true },
        }),
        // Every store row these users hold, in any country — the reach
        // rule needs «were they named any at all», not only «any here».
        db.userStoreAccess.findMany({
          where: { userId: { in: narrowable } },
          select: { userId: true, storeId: true, store: { select: { countryId: true } } },
        }),
      ])
    : [[], []];

  const assignedIds = new Set(assigned.map((a) => a.userId));
  const storesOf = new Map<string, string[]>();
  /** Who was named any store at all, anywhere. */
  const named = new Set<string>();
  for (const n of narrowings) {
    named.add(n.userId);
    if (n.store.countryId === store.countryId) {
      storesOf.set(n.userId, [...(storesOf.get(n.userId) ?? []), n.storeId]);
    }
  }

  for (const u of users) {
    const facts: StoreReachFacts = {
      seesAll: seesAllCountries(u),
      countryOpen,
      countryAssigned: assignedIds.has(u.id),
      storesInCountry: storesOf.get(u.id) ?? [],
      hasStoreGrants: named.has(u.id),
    };
    if (reachesStore(facts, storeId)) reached.add(u.id);
  }
  return reached;
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
      workHoursStart: true, workHoursEnd: true, weekendDays: true,
    },
  });
  if (!country) throw new Error('Forbidden: country not accessible');
  return { user, companyId, countryId: country.id, storeId: valid.storeId as string, country };
}
