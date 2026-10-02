import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EDITING A CAMPAIGN MUST NOT SPEND ITS MONEY FOR IT.
 *
 * `PATCH` read `campaignInputSchema.omit({ code: true }).partial()` and
 * merged on `!== undefined`. `.partial()` in zod 4 keeps every `.default()`,
 * so `{ name: 'new name' }` arrived as
 *
 *     { name: 'new name', platform: 'META', status: 'ACTIVE', spend: 0 }
 *
 * and the merge wrote all four. Renaming a campaign reset its platform,
 * re-activated an ENDED or PAUSED one, and wiped the ad spend the seller
 * had typed in — and the audit entry recorded the loss as though it were
 * the edit they asked for, because the spend is exactly what that entry
 * carries.
 *
 * These tests assert what the route WROTE, field by field, not that it
 * answered 200.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: {
    campaign: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    adAccount: { findFirst: vi.fn() },
    landingPage: { findFirst: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { PATCH } from './route';

/**
 * A campaign that ran, cost money, and was stopped. Every one of these four
 * values differs from the default the schema used to supply, which is what
 * makes the loss visible rather than a coincidence.
 */
const RAN = {
  id: 'c-1',
  name: 'حملة الشتاء',
  platform: 'TIKTOK',
  status: 'ENDED',
  spend: 1250,
  code: 'WNT24',
  landingPageId: 'lp-1',
};

const ctx = { params: Promise.resolve({ id: 'c-1' }) };
const patch = (body: unknown) =>
  PATCH(
    new Request('http://localhost/api/growth/campaigns/c-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    ctx
  );

/** What the route asked Prisma to write. */
const written = () => db.campaign.update.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'co-1', storeId: 'st-1' });
  requirePermission.mockResolvedValue(undefined);
  db.campaign.findFirst.mockResolvedValue(RAN);
  db.campaign.update.mockImplementation(async ({ data }: never) => ({ ...RAN, ...(data as object) }));
  db.landingPage.findFirst.mockResolvedValue({ id: 'lp-1' });
  db.adAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
});

describe('renaming a campaign', () => {
  it('writes the name and nothing else at all', async () => {
    expect((await patch({ name: 'حملة الشتاء — نسخة ٢' })).status).toBe(200);
    expect(Object.keys(written())).toEqual(['name']);
  });

  it('does not wipe the ad spend to 0 — that money left for TikTok', async () => {
    await patch({ name: 'اسم جديد' });
    expect('spend' in written()).toBe(false);
    expect(written().spend).toBeUndefined();
  });

  it('does not re-activate a campaign somebody ended', async () => {
    await patch({ name: 'اسم جديد' });
    expect('status' in written()).toBe(false);
  });

  it('does not reset the platform to META', async () => {
    await patch({ name: 'اسم جديد' });
    expect('platform' in written()).toBe(false);
  });

  it('leaves the spend standing in the audit entry, which is what gets asked about', async () => {
    await patch({ name: 'اسم جديد' });
    const entry = logAudit.mock.calls[0][0];
    expect(entry.previousData).toMatchObject({ spend: 1250 });
    // It used to read `{ spend: 0 }` here and say CAMPAIGN_UPDATED about it.
    expect(entry.newData).toMatchObject({ spend: 1250, status: 'ENDED' });
  });
});

describe('an edit that really is about one of those fields', () => {
  it('writes the spend when the spend was sent', async () => {
    await patch({ spend: 2000 });
    expect(written()).toEqual({ spend: 2000 });
  });

  it('writes the status when the status was sent', async () => {
    await patch({ status: 'ACTIVE' });
    expect(written()).toEqual({ status: 'ACTIVE' });
  });

  it('writes several when several were sent', async () => {
    await patch({ name: 'اسم', spend: 10, status: 'PAUSED' });
    expect(written()).toEqual({ name: 'اسم', spend: 10, status: 'PAUSED' });
  });

  it('clears a nullable field the caller explicitly nulled', async () => {
    await patch({ landingPageId: null, notes: null, endDate: null });
    expect(written()).toEqual({ landingPageId: null, notes: null, endDate: null });
  });
});

describe('an empty edit', () => {
  it('writes nothing — it used to write a whole default row', async () => {
    expect((await patch({})).status).toBe(200);
    expect(written()).toEqual({});
  });
});

describe('what the edit door still refuses', () => {
  it('a campaign of another store reads as missing', async () => {
    db.campaign.findFirst.mockResolvedValue(null);
    expect((await patch({ name: 'اسم' })).status).toBe(404);
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  it('a name too short to name anything', async () => {
    expect((await patch({ name: 'x' })).status).toBe(400);
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  it('a negative spend', async () => {
    expect((await patch({ spend: -5 })).status).toBe(400);
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  it('an end date before the start date', async () => {
    const res = await patch({ startDate: '2026-02-01', endDate: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  it('a landing page belonging to another store', async () => {
    db.landingPage.findFirst.mockResolvedValue(null);
    expect((await patch({ landingPageId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  it('the code, which is stamped on every order the campaign brought', async () => {
    // `code` is omitted from the patch shape; the door is not strict, so it
    // is ignored rather than refused — what matters is that it is never
    // written.
    await patch({ code: 'OTHER' });
    expect('code' in written()).toBe(false);
  });
});

describe('linking to an ad account is its own branch and is untouched', () => {
  it('sets SYNCED when both halves of the link arrive', async () => {
    await patch({ adAccountId: '00000000-0000-4000-8000-00000000000a', externalId: 'x1' });
    expect(written()).toMatchObject({ spendSource: 'SYNCED' });
  });

  it('unlinking returns the spend to the seller and does not erase it', async () => {
    await patch({ adAccountId: null });
    const data = written();
    expect(data).toMatchObject({ adAccountId: null, spendSource: 'MANUAL' });
    expect('spend' in data).toBe(false);
  });
});
