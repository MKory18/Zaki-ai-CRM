import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repoFile, stripComments } from '@/lib/guard-source';

/**
 * «ليش ما سحب الانفاق؟» — measured on production: «كيوان 3: (#3018) The start date of the time range cannot be beyond
 * 37 months from the current date». The sync asked Meta from the OLDEST start date of the account's campaigns, one
 * campaign on the account started years ago, and Meta refused the whole request — the campaign running today included.
 *
 * And the ad link on the campaigns screen read «https://0.0.0.0:3000/s/saha?c=…»: the container's own address, which
 * opens nothing for a shopper.
 */

const { db, fetchSpend, readCredentials } = vi.hoisted(() => ({
  db: { adAccount: { findMany: vi.fn(), update: vi.fn() }, campaign: { update: vi.fn() } },
  fetchSpend: vi.fn(),
  readCredentials: vi.fn(),
}));
vi.mock('../db', () => ({ db }));
vi.mock('./index', async (original) => {
  const real = await original<typeof import('./index')>();
  return {
    ...real,
    readCredentials: (...a: unknown[]) => readCredentials(...a),
    adapterFor: () => ({ platform: 'META', fetchSpend: (...a: unknown[]) => fetchSpend(...a), explainError: (e: unknown) => String(e) }),
  };
});

import { earliestAskable, syncAdSpend } from './sync';

const account = (campaigns: { id: string; externalId: string; startDate: Date; endDate?: Date | null }[]) => ({
  id: 'a1', platform: 'META', accountId: 'act_1', accountName: 'كيوان 3', tokenEncrypted: 'enc', storeId: 'st',
  campaigns: campaigns.map((c) => ({ name: c.id, endDate: null, spend: 0, ...c })),
});

beforeEach(() => {
  vi.resetAllMocks();
  readCredentials.mockReturnValue({ token: 't' });
  fetchSpend.mockResolvedValue([
    { campaignId: 'ext-old', spend: 40 },
    { campaignId: 'ext-now', spend: 12.5 },
  ]);
});

describe('the spend window Meta will answer', () => {
  it('is never older than 36 months — even when a campaign on the account started years ago', async () => {
    db.adAccount.findMany.mockResolvedValue([
      account([
        { id: 'old', externalId: 'ext-old', startDate: new Date('2019-03-01') },
        { id: 'now', externalId: 'ext-now', startDate: new Date('2026-10-20') },
      ]),
    ]);
    const result = await syncAdSpend({ companyId: 'co', storeId: 'st' });
    expect(result.accounts[0].error).toBeNull();
    const floor = earliestAskable().toISOString().slice(0, 10);
    for (const [, , since] of fetchSpend.mock.calls) expect(since >= floor, String(since)).toBe(true);
  });

  it('and the campaign running today gets its spend', async () => {
    db.adAccount.findMany.mockResolvedValue([account([{ id: 'now', externalId: 'ext-now', startDate: new Date('2026-10-20') }])]);
    await syncAdSpend({ companyId: 'co', storeId: 'st' });
    expect(db.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'now' }, data: expect.objectContaining({ spend: 12.5 }) }));
  });

  it('NEGATIVE: a recent start is asked exactly as it was — the floor only lifts what Meta would refuse', async () => {
    db.adAccount.findMany.mockResolvedValue([account([{ id: 'now', externalId: 'ext-now', startDate: new Date('2026-10-20') }])]);
    await syncAdSpend({ companyId: 'co', storeId: 'st' });
    expect(fetchSpend.mock.calls[0][2]).toBe('2026-10-20');
  });

  it('the floor is 36 months back from the day asked', () => {
    expect(earliestAskable(new Date('2026-10-25T12:00:00Z')).toISOString().slice(0, 10)).toBe('2023-10-25');
  });
});

describe('the ad link', () => {
  it('is built on the public address, not on the request the container saw', () => {
    const src = stripComments(repoFile('src/app/api/growth/campaigns/route.ts'));
    expect(src).toContain('const origin = publicOrigin(req);');
    // NEGATIVE: the container's own origin never reaches a link again.
    expect(src).not.toContain('new URL(req.url).origin');
  });
});

describe('how many times Meta is asked', () => {
  it('once for the account, then once per DISTINCT campaign window — not once per campaign', async () => {
    // Six campaigns: two start on the account’s earliest day and run on (the wide window), four share two windows.
    const ended = new Date('2026-10-10');
    db.adAccount.findMany.mockResolvedValue([
      account([
        { id: 'a', externalId: 'ext-a', startDate: new Date('2026-09-01') },
        { id: 'b', externalId: 'ext-b', startDate: new Date('2026-09-01') },
        { id: 'c', externalId: 'ext-c', startDate: new Date('2026-09-15'), endDate: ended },
        { id: 'd', externalId: 'ext-d', startDate: new Date('2026-09-15'), endDate: ended },
        { id: 'e', externalId: 'ext-e', startDate: new Date('2026-10-01') },
        { id: 'f', externalId: 'ext-f', startDate: new Date('2026-10-01') },
      ]),
    ]);
    fetchSpend.mockImplementation(async () => ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => ({ campaignId: `ext-${x}`, spend: 7 })));
    const result = await syncAdSpend({ companyId: 'co', storeId: 'st' });
    expect(result.accounts[0].error).toBeNull();
    // 1 wide + 2 distinct windows (09-15→10-10, 10-01→today) — six campaigns, three calls.
    expect(fetchSpend).toHaveBeenCalledTimes(3);
    expect(db.campaign.update).toHaveBeenCalledTimes(6);
  });

  it('NEGATIVE: a campaign whose window differs still gets the spend of ITS window, not the account-wide figure', async () => {
    db.adAccount.findMany.mockResolvedValue([
      account([
        { id: 'a', externalId: 'ext-a', startDate: new Date('2026-09-01') },
        { id: 'c', externalId: 'ext-c', startDate: new Date('2026-09-15'), endDate: new Date('2026-10-10') },
      ]),
    ]);
    fetchSpend.mockImplementation(async (_c: unknown, _a: unknown, since: string) =>
      since === '2026-09-01' ? [{ campaignId: 'ext-a', spend: 50 }, { campaignId: 'ext-c', spend: 99 }] : [{ campaignId: 'ext-c', spend: 30 }]
    );
    await syncAdSpend({ companyId: 'co', storeId: 'st' });
    const wrote = Object.fromEntries(db.campaign.update.mock.calls.map((c: any[]) => [c[0].where.id, c[0].data.spend]));
    expect(wrote).toEqual({ a: 50, c: 30 });
  });
});
