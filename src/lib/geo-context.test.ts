import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Geo context guard — the service layer rejects any request without a valid
 * country + store selection. Prisma, auth and next/headers are mocked; the
 * signing, validation and entry rules run for real.
 */

const { db, requireCompanyTenant, can, jar } = vi.hoisted(() => ({
  db: {
    country: { findFirst: vi.fn(), findMany: vi.fn() },
    store: { findMany: vi.fn() },
    userStoreAccess: { count: vi.fn() },
  },
  requireCompanyTenant: vi.fn(),
  can: vi.fn(),
  jar: { value: undefined as string | undefined },
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('./db', () => ({ db }));
vi.mock('./auth', () => ({ requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a) }));
vi.mock('./authorization', () => ({ can: (...a: unknown[]) => can(...a) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (jar.value ? { value: jar.value } : undefined) }),
}));

import {
  ContextError,
  listAccessibleCountries,
  readSelection,
  requireContext,
  resolveEntry,
  signSelection,
  validateSelection,
} from './geo-context';
import { apiError } from './api-error';

const agent = { id: 'u-agent', role: 'CONFIRMATION_AGENT', status: 'ACTIVE' } as any;
const COMPANY = 'company-1';
const JO = '11111111-1111-4111-8111-111111111111';
const SY = '22222222-2222-4222-8222-222222222222';
const STORE_JO = '33333333-3333-4333-8333-333333333333';
const STORE_SY = '44444444-4444-4444-8444-444444444444';

const joCountry = {
  id: JO, code: 'JO', name: 'الأردن', currencyCode: 'JOD', minorUnit: 3,
  timezone: 'Asia/Amman', orderPrefix: 'ORD', allowNegativeStock: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  jar.value = undefined;
  requireCompanyTenant.mockResolvedValue({ user: agent, companyId: COMPANY });
  can.mockReturnValue(false);
  db.userStoreAccess.count.mockResolvedValue(0);
});

describe('requireContext', () => {
  it('rejects a request with no selection (400 CONTEXT_REQUIRED)', async () => {
    const err = await requireContext().catch((e) => e);
    expect(err).toBeInstanceOf(ContextError);
    expect(err.code).toBe('CONTEXT_REQUIRED');
    expect(apiError(err)).toEqual({ body: { error: err.message, code: 'CONTEXT_REQUIRED' }, status: 400 });
  });

  it('rejects a country without a store (STORE_REQUIRED)', async () => {
    jar.value = await signSelection(agent.id, { countryId: JO, storeId: null });
    const err = await requireContext().catch((e) => e);
    expect(err.code).toBe('STORE_REQUIRED');
  });

  it('rejects a selection signed for another user', async () => {
    jar.value = await signSelection('someone-else', { countryId: JO, storeId: STORE_JO });
    const err = await requireContext().catch((e) => e);
    expect(err.code).toBe('CONTEXT_REQUIRED');
  });

  it('rejects a tampered selection token', async () => {
    const token = await signSelection(agent.id, { countryId: JO, storeId: STORE_JO });
    jar.value = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
    const err = await requireContext().catch((e) => e);
    expect(err.code).toBe('CONTEXT_REQUIRED');
  });

  it('rejects a country the user is no longer assigned to (403)', async () => {
    jar.value = await signSelection(agent.id, { countryId: SY, storeId: STORE_SY });
    db.country.findFirst.mockResolvedValue(null); // access filter in the query excludes it
    const err = await requireContext().catch((e) => e);
    expect(apiError(err).status).toBe(403);
  });

  it('rejects a store that is not in the selected country (403)', async () => {
    jar.value = await signSelection(agent.id, { countryId: JO, storeId: STORE_SY });
    db.country.findFirst.mockResolvedValue({ id: JO });
    db.store.findMany.mockResolvedValue([{ id: STORE_JO }]);
    const err = await requireContext().catch((e) => e);
    expect(apiError(err).status).toBe(403);
  });

  it('returns tenant, country and store for a valid selection', async () => {
    jar.value = await signSelection(agent.id, { countryId: JO, storeId: STORE_JO });
    db.country.findFirst.mockResolvedValueOnce({ id: JO }).mockResolvedValueOnce(joCountry);
    db.store.findMany.mockResolvedValue([{ id: STORE_JO }]);
    const ctx = await requireContext();
    expect(ctx).toMatchObject({ companyId: COMPANY, countryId: JO, storeId: STORE_JO, country: { minorUnit: 3 } });
  });
});

describe('access is applied inside the query', () => {
  it('a non-manager only lists countries with an access row', async () => {
    db.country.findMany.mockResolvedValue([]);
    await listAccessibleCountries(agent, COMPANY);
    expect(db.country.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: COMPANY, isActive: true, access: { some: { userId: agent.id } } },
      })
    );
  });

  it('a geo.manage holder lists every country of the company', async () => {
    can.mockImplementation((_u: unknown, p: string) => p === 'geo.manage');
    db.country.findMany.mockResolvedValue([]);
    await listAccessibleCountries(agent, COMPANY);
    expect(db.country.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY, isActive: true });
  });
});

describe('selection rules', () => {
  it('switching country without a store clears the store', async () => {
    db.country.findFirst.mockResolvedValue({ id: SY });
    db.store.findMany.mockResolvedValue([{ id: STORE_SY }]);
    await expect(validateSelection(agent, COMPANY, SY, null)).resolves.toEqual({ countryId: SY, storeId: null });
  });

  it('a signed selection round-trips only for its own user', async () => {
    const token = await signSelection(agent.id, { countryId: JO, storeId: STORE_JO });
    await expect(readSelection(agent.id, token)).resolves.toEqual({ countryId: JO, storeId: STORE_JO });
    await expect(readSelection('other', token)).resolves.toBeNull();
  });
});

describe('resolveEntry skip rules', () => {
  const country = (id: string, name: string) => ({ id, code: 'XX', name, currencyCode: 'USD', _count: { stores: 1 } });

  it('one country with one store skips both pickers', async () => {
    db.country.findMany.mockResolvedValue([country(JO, 'الأردن')]);
    db.country.findFirst.mockResolvedValue({ id: JO });
    db.store.findMany.mockResolvedValue([{ id: STORE_JO, name: 'Main' }]);
    const entry = await resolveEntry(agent, COMPANY, null);
    expect(entry.skipCountryPicker).toBe(true);
    expect(entry.selection).toEqual({ countryId: JO, storeId: STORE_JO });
    expect(entry.next).toBe('READY');
  });

  it('two countries and no selection asks for the country', async () => {
    db.country.findMany.mockResolvedValue([country(JO, 'الأردن'), country(SY, 'سوريا')]);
    const entry = await resolveEntry(agent, COMPANY, null);
    expect(entry.skipCountryPicker).toBe(false);
    expect(entry.selection).toBeNull();
    expect(entry.next).toBe('PICK_COUNTRY');
  });

  it('a country with zero stores leads to creating the first store, not a dead end', async () => {
    db.country.findMany.mockResolvedValue([country(JO, 'الأردن')]);
    db.country.findFirst.mockResolvedValue({ id: JO });
    db.store.findMany.mockResolvedValue([]);
    const entry = await resolveEntry(agent, COMPANY, null);
    expect(entry.next).toBe('CREATE_FIRST_STORE');
  });

  it('a stale store in the cookie is dropped, the country is kept', async () => {
    db.country.findMany.mockResolvedValue([country(JO, 'الأردن'), country(SY, 'سوريا')]);
    db.country.findFirst.mockResolvedValue({ id: JO });
    db.store.findMany.mockResolvedValue([{ id: STORE_JO }, { id: 'another-store' }]);
    const entry = await resolveEntry(agent, COMPANY, { countryId: JO, storeId: STORE_SY });
    expect(entry.selection).toEqual({ countryId: JO, storeId: null });
    expect(entry.next).toBe('PICK_STORE');
  });
});
