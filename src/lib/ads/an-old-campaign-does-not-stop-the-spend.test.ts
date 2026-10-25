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
