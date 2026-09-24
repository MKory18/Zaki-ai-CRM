import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE ONE THING A VISITOR GETS TO SAY ABOUT ATTRIBUTION.
 *
 * A browser sends a campaign CODE. It never sends an id, and this is why:
 * an id taken from a request would let anyone credit another shop's ad
 * spend with their own order, and attribution that can be forged is
 * attribution nobody can act on.
 *
 * The other half matters just as much in the other direction. A code that
 * matches nothing must resolve to null and let the order through — a
 * mistyped link in an advert must never cost a sale.
 */

const { db } = vi.hoisted(() => ({ db: { campaign: { findFirst: vi.fn() } } }));
vi.mock('./db', () => ({ db }));

import { resolveCampaign } from './campaigns-server';

const CO = 'company-1';
const STORE = 'store-1';

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findFirst.mockResolvedValue({ id: 'camp-1' });
});

describe('resolving the code a visitor arrived with', () => {
  it('finds the campaign and returns its id', async () => {
    expect(await resolveCampaign(CO, STORE, 'Y6KQPA')).toBe('camp-1');
  });

  it('looks it up in THIS store, not merely this company', async () => {
    // Two shops may well pick the same short code. The unique index only
    // promises they cannot do it within one shop.
    await resolveCampaign(CO, STORE, 'Y6KQPA');
    expect(db.campaign.findFirst.mock.calls[0][0].where).toEqual({
      companyId: CO,
      storeId: STORE,
      code: 'Y6KQPA',
    });
  });

  it('accepts a code however the link happened to spell it', async () => {
    await resolveCampaign(CO, STORE, '  y6kqpa ');
    expect(db.campaign.findFirst.mock.calls[0][0].where.code).toBe('Y6KQPA');
  });
});

describe('what it refuses', () => {
  it('lets the order through when the code matches nothing', async () => {
    // A wrong code in an advert costs the attribution. It must never cost
    // the sale.
    db.campaign.findFirst.mockResolvedValue(null);
    expect(await resolveCampaign(CO, STORE, 'NOSUCH')).toBeNull();
  });

  it('never queries at all for a code that could not be one', async () => {
    for (const bad of ['', 'ab', 'x'.repeat(40), 'a b', 'كود', "' OR 1=1 --", '../../etc']) {
      expect(await resolveCampaign(CO, STORE, bad), bad).toBeNull();
    }
    expect(db.campaign.findFirst).not.toHaveBeenCalled();
  });

  it('ignores anything that is not text', async () => {
    for (const bad of [null, undefined, 42, {}, [], true, { id: 'camp-2' }]) {
      expect(await resolveCampaign(CO, STORE, bad), String(bad)).toBeNull();
    }
    // Above all this one: an object carrying an id must not become an id.
    expect(db.campaign.findFirst).not.toHaveBeenCalled();
  });
});
