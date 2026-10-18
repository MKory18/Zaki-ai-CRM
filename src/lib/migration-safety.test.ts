import { describe, expect, it } from 'vitest';
// The migration tool's safety rules live in a pure module so these rules can
// be held by the same suite that gates every merge — not only by the person
// who happens to run the tool.
import { evaluateVerify, resolveStoreTarget, resolveWipeTarget } from '../../scripts/migration/lib/safety-rules.mjs';

describe('the migration never guesses which company to wipe', () => {
  const companies = [
    { id: 'demo-uuid', name: 'المبارك ستور — Al Mubarak Store', _count: { users: 11 } },
    { id: 'salah-uuid', name: 'صحة بلس' },
    { id: 'real-uuid', name: 'شركة حقيقية' },
  ];

  it('refuses to wipe anything without an explicit --wipe-company-id', () => {
    const r = resolveWipeTarget(['node', 'run.mjs'], companies, 'صحة بلس');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/--wipe-company-id/);
  });

  it('refuses an id that matches no company', () => {
    const r = resolveWipeTarget(['node', 'run.mjs', '--wipe-company-id', 'nope'], companies, 'صحة بلس');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no company with id nope/);
  });

  it('refuses to wipe the migration\'s own destination company', () => {
    const r = resolveWipeTarget(['node', 'run.mjs', '--wipe-company-id', 'salah-uuid'], companies, 'صحة بلس');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/never allowed/);
  });

  it('accepts the exact demo company and names it', () => {
    const r = resolveWipeTarget(['node', 'run.mjs', '--wipe-company-id', 'demo-uuid'], companies, 'صحة بلس');
    expect(r.ok).toBe(true);
    expect(r.company?.id).toBe('demo-uuid');
    expect(r.company?.name).toBe('المبارك ستور — Al Mubarak Store');
  });

  it('never returns more than one company as the target', () => {
    const r = resolveWipeTarget(['node', 'run.mjs', '--wipe-company-id', 'demo-uuid'], companies, 'صحة بلس');
    expect(r.company).toBeDefined();
    expect(r.candidates).toHaveLength(3); // listed for the human, not for deletion
  });

  it('refuses when the flag has no value', () => {
    const r = resolveWipeTarget(['node', 'run.mjs', '--wipe-company-id'], companies, 'صحة بلس');
    expect(r.ok).toBe(false);
  });
});

describe('the migration reuses the existing store instead of duplicating it', () => {
  const stores = [
    { id: 'existing-store', slug: 'salah-plus', companyId: 'salah-co', countryId: 'syria-country', name: 'صحة بلس' },
    { id: 'other-store', slug: 'other-shop', companyId: 'other-co', countryId: 'jo-country', name: 'متجر آخر' },
    { id: 'salah-plus-elsewhere', slug: 'salah-plus', companyId: 'other-co', countryId: 'jo-country', name: 'صحة بلس في شركة أخرى' },
  ];
  const dest = { companyId: 'salah-co', countryId: 'syria-country' };

  it('reuses the destination company\'s own salah-plus store', () => {
    const r = resolveStoreTarget(['node', 'run.mjs'], stores, dest);
    expect(r.ok).toBe(true);
    expect(r.action).toBe('reuse');
    expect(r.store?.id).toBe('existing-store');
  });

  it('never mistakes a same-slug store in ANOTHER company for the destination', () => {
    const noOwn = stores.filter((s) => s.companyId === 'other-co');
    const r = resolveStoreTarget(['node', 'run.mjs'], noOwn, dest);
    expect(r.ok).toBe(true);
    expect(r.action).toBe('create'); // create inside the destination, never reach across companies
  });

  it('reuses an explicit --store-id when it belongs to the destination company and country', () => {
    const r = resolveStoreTarget(['node', 'run.mjs', '--store-id', 'existing-store'], stores, dest);
    expect(r.ok).toBe(true);
    expect(r.action).toBe('reuse');
    expect(r.store?.id).toBe('existing-store');
  });

  it('refuses an explicit store id that exists nowhere', () => {
    const r = resolveStoreTarget(['node', 'run.mjs', '--store-id', 'nope'], stores, dest);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no store with id nope/);
  });

  it('refuses to adopt a store from another company — moving companies is a separate migration', () => {
    const r = resolveStoreTarget(['node', 'run.mjs', '--store-id', 'other-store'], stores, dest);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/separate migration/);
  });

  it('refuses a destination-company store bound to the wrong country', () => {
    const r = resolveStoreTarget(
      ['node', 'run.mjs', '--store-id', 'existing-store'],
      [{ ...stores[0], countryId: 'jo-country' }],
      dest,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/country/);
  });
});

describe('the migration may not claim success while money disagrees', () => {
  it('passes when the sums and counts match', () => {
    const r = evaluateVerify({ legacySum: 418229.75, migratedSum: 418229.75, countChecks: { orders: [17021, 17021] }, orphanCounts: { items_without_product: 0 } });
    expect(r.ok).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it('fails on a money checksum mismatch', () => {
    const r = evaluateVerify({ legacySum: 418229.75, migratedSum: 418229.70 });
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/MISMATCH/);
  });

  it('tolerates the currency\'s own rounding dust', () => {
    const r = evaluateVerify({ legacySum: 100.001, migratedSum: 100.002 });
    expect(r.ok).toBe(true);
  });

  it('fails on any count mismatch', () => {
    const r = evaluateVerify({ legacySum: 10, migratedSum: 10, countChecks: { order_items: [17056, 17055] } });
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/order_items/);
  });

  it('fails on broken references', () => {
    const r = evaluateVerify({ legacySum: 10, migratedSum: 10, orphanCounts: { orders_without_customer: 3 } });
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/orders_without_customer = 3/);
  });

  it('fails loudly on non-numeric sums', () => {
    const r = evaluateVerify({ legacySum: NaN, migratedSum: 5 });
    expect(r.ok).toBe(false);
  });
});
