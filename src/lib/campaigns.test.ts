import { describe, it, expect } from 'vitest';
import {
  campaignResult,
  campaignLink,
  generateCampaignCode,
  campaignCodeSchema,
  campaignInputSchema,
  datesMakeSense,
  wasRunning,
} from './campaigns';

/**
 * THE ARITHMETIC A SELLER WILL MAKE DECISIONS WITH.
 *
 * Every number here decides whether an ad keeps running. Division by zero,
 * a rounding that disagrees with the export, a "profit" that forgot the cost
 * of the goods — each of those is a seller spending money they should not,
 * or stopping a campaign that was working.
 */

describe('what an ad cost and brought back', () => {
  const row = { revenue: 1000, brought: 40, delivered: 25 };

  it('works out the return on the spend', () => {
    const r = campaignResult(250, row);
    expect(r.roas).toBe(4); // 1000 ÷ 250
    expect(r.net).toBe(750);
  });

  it('says what one delivered order cost in ad money', () => {
    expect(campaignResult(250, row).costPerDelivered).toBe(10); // 250 ÷ 25
  });

  it('says what one order cost, delivered or not', () => {
    // The cost of a lead — worth seeing beside the delivered figure,
    // because the gap between them is the confirmation team's work.
    expect(campaignResult(250, row).costPerOrder).toBe(6.25);
  });

  it('refuses to divide by a spend of nothing, but still costs it', () => {
    const r = campaignResult(0, row);
    // ROAS is undefined: there is no return ON nothing.
    expect(r.roas).toBeNull();
    // Cost per order is not. Forty orders for nothing cost nothing each,
    // and that is a real answer a seller would want to see.
    expect(r.costPerOrder).toBe(0);
    expect(r.costPerDelivered).toBe(0);
    // The revenue is still real: orders arrive before the bill does.
    expect(r.revenue).toBe(1000);
    expect(r.net).toBe(1000);
  });

  it('refuses to divide by no orders', () => {
    const r = campaignResult(500, { revenue: 0, brought: 0, delivered: 0 });
    expect(r.costPerDelivered).toBeNull();
    expect(r.costPerOrder).toBeNull();
    expect(r.roas).toBe(0); // spent 500, got nothing — that IS the answer
    expect(r.net).toBe(-500);
  });

  it('handles a campaign with orders but nothing delivered yet', () => {
    const r = campaignResult(300, { revenue: 0, brought: 12, delivered: 0 });
    expect(r.costPerOrder).toBe(25);
    expect(r.costPerDelivered).toBeNull();
  });

  it('survives a campaign nobody has any rows for', () => {
    const r = campaignResult(100, null);
    expect(r.revenue).toBe(0);
    expect(r.net).toBe(-100);
  });

  it('never reports a negative spend', () => {
    // Whatever arrives in the field, money does not leave backwards.
    expect(campaignResult(-500, row).spend).toBe(0);
    expect(campaignResult(Number.NaN, row).spend).toBe(0);
  });

  it('calls it net and not profit, because the goods cost something', () => {
    const r = campaignResult(250, row);
    // A seller reading "profit: 750" on a 1000 revenue would be reading a
    // number too high by the entire cost of what they sold.
    expect(Object.keys(r)).not.toContain('profit');
    expect(r.net).toBe(750);
  });
});

describe('the code that goes in the link', () => {
  it('avoids characters that are read as each other', () => {
    // A code typed off a screen into an ads manager. I, O, 0 and 1 are how
    // that goes wrong.
    for (let i = 0; i < 200; i++) {
      expect(generateCampaignCode()).not.toMatch(/[IO01]/);
    }
  });

  it('is the length asked for, and needs no escaping in a URL', () => {
    expect(generateCampaignCode(6)).toHaveLength(6);
    expect(generateCampaignCode(10)).toMatch(/^[A-Z2-9]{10}$/);
    for (let i = 0; i < 100; i++) {
      const code = generateCampaignCode();
      // Unchanged by encoding: a code that needed escaping would look one
      // way on the screen the seller copies from and another in the link.
      expect(encodeURIComponent(code)).toBe(code);
    }
  });

  it('accepts a code a seller typed, in any case', () => {
    expect(campaignCodeSchema.parse('  summer9 ')).toBe('SUMMER9');
  });

  it('refuses one that would not survive a URL', () => {
    for (const bad of ['a b', 'ab', 'x'.repeat(17), 'كود', 'a/b', 'a?c=1', '']) {
      expect(campaignCodeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('the link to paste into the ad', () => {
  it('points at a landing page with the code on it', () => {
    expect(campaignLink('https://shop.example', 'AB12CD', { kind: 'lp', slug: 'water' })).toBe(
      'https://shop.example/lp/water?c=AB12CD'
    );
  });

  it('points at the shopfront when no page was chosen', () => {
    expect(campaignLink('https://shop.example', 'AB12CD', { kind: 'store', slug: 'sehha' })).toBe(
      'https://shop.example/s/sehha?c=AB12CD'
    );
  });

  it('does not double the slash when the origin has one', () => {
    expect(campaignLink('https://shop.example/', 'X1', { kind: 'lp', slug: 'a' })).toBe(
      'https://shop.example/lp/a?c=X1'
    );
  });
});

describe('the dates', () => {
  it('refuses an end before the start', () => {
    expect(datesMakeSense(new Date('2026-03-10'), new Date('2026-03-01'))).toBe(false);
    expect(datesMakeSense(new Date('2026-03-01'), new Date('2026-03-10'))).toBe(true);
  });

  it('accepts a campaign with no end — most are still running', () => {
    expect(datesMakeSense(new Date('2026-03-01'), null)).toBe(true);
  });

  it('accepts one that starts and ends the same day', () => {
    const d = new Date('2026-03-01');
    expect(datesMakeSense(d, d)).toBe(true);
  });
});

describe('whether a campaign was even running in the window', () => {
  const c = { startDate: new Date('2026-03-01'), endDate: new Date('2026-03-31') };

  it('is in a window that overlaps it', () => {
    expect(wasRunning(c, new Date('2026-03-15'), new Date('2026-03-20'))).toBe(true);
  });

  it('is not in a window entirely before it', () => {
    expect(wasRunning(c, new Date('2026-01-01'), new Date('2026-02-01'))).toBe(false);
  });

  it('is not in a window entirely after it', () => {
    expect(wasRunning(c, new Date('2026-05-01'), new Date('2026-06-01'))).toBe(false);
  });

  it('counts an open-ended campaign as running in any later window', () => {
    const open = { startDate: new Date('2026-03-01'), endDate: null };
    expect(wasRunning(open, new Date('2026-12-01'), new Date('2026-12-31'))).toBe(true);
  });
});

describe('what a campaign may be created with', () => {
  const base = { name: 'حملة رمضان', startDate: '2026-03-01' };

  it('defaults to Meta, active, and nothing spent yet', () => {
    const c = campaignInputSchema.parse(base);
    expect(c.platform).toBe('META');
    expect(c.status).toBe('ACTIVE');
    expect(c.spend).toBe(0);
  });

  it('refuses a nameless campaign', () => {
    expect(campaignInputSchema.safeParse({ ...base, name: ' ' }).success).toBe(false);
  });

  it('refuses a platform nobody advertises on', () => {
    expect(campaignInputSchema.safeParse({ ...base, platform: 'MYSPACE' }).success).toBe(false);
  });

  it('refuses a negative spend', () => {
    expect(campaignInputSchema.safeParse({ ...base, spend: -1 }).success).toBe(false);
  });

  it('takes a spend typed as text, which is how a form sends it', () => {
    expect(campaignInputSchema.parse({ ...base, spend: '250.50' }).spend).toBe(250.5);
  });
});
