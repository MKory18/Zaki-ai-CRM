import { describe, expect, it } from 'vitest';
import {
  CHANNEL_BANDS,
  MIN_CONFIRMED,
  collectionTrust,
  channelBand,
  scoreChannel,
  unattributedShare,
  whyNoScore,
} from './channel-score';

/**
 * THE GUARDS, WRITTEN AGAINST THE MEASURED DATABASE.
 *
 * Every figure quoted in a test name was read off the live database before
 * the screen was touched: four channels carrying 149, 5, 2 and 1 orders,
 * 34 of 153 decided parcels returned, and zero orders ever collected.
 */

/** The measured shop's one gradeable door: الشيت. */
const SHEET = {
  delivery_rate: { value: 78 },      // 115 delivered of 147 confirmed
  return_rate: { value: 21 },        // 30 of 145 decided at the door
  confirmation_rate: { value: 99 },  // 147 of 149 decided
  collection_rate: { value: null },  // nothing has ever been collected
  delivered_value: { value: 20.19, reference: 50.01 },
};

describe('the weights', () => {
  it('sum to a hundred, so a full score is a full score', () => {
    expect(CHANNEL_BANDS.reduce((s, b) => s + b.weight, 0)).toBe(100);
  });

  it('put the most on the question the owner actually asked', () => {
    const heaviest = [...CHANNEL_BANDS].sort((a, b) => b.weight - a.weight)[0];
    expect(heaviest.key).toBe('delivery_rate');
  });

  it('treat a return as a cost, never as a credit', () => {
    expect(channelBand('return_rate').negative).toBe(true);
    expect(channelBand('delivery_rate').negative).toBeUndefined();
  });
});

describe('a door with enough orders behind it', () => {
  it('scores out of only the bands that could be measured', () => {
    const s = scoreChannel(SHEET, { sample: 147 });
    // Collection is unmeasurable on this data, so its 15 points leave the
    // denominator rather than being lost inside it.
    expect(s.possible).toBe(85);
    expect(s.total).not.toBeNull();
    expect(s.reason).toBeNull();
  });

  it('and its parts add up to its headline', () => {
    const s = scoreChannel(SHEET, { sample: 147 });
    const sum = s.bands.reduce((t, b) => t + (b.points ?? 0), 0);
    expect(s.total).toBe(sum);
  });

  it('turning the measured rates into the measured score', () => {
    const s = scoreChannel(SHEET, { sample: 147 });
    const points = (k: string) => s.bands.find((b) => b.key === k)?.points;
    expect(points('delivery_rate')).toBe(27);       // 78% of 35
    expect(points('return_rate')).toBe(16);         // (1 − 21%) of 20
    expect(points('confirmation_rate')).toBe(20);   // 99% of 20
    expect(points('delivered_value')).toBe(4);      // 20.19 / 50.01 of 10
    expect(points('collection_rate')).toBeNull();
    expect(s.total).toBe(67);
  });

  it('scoring a band that had nothing to measure as null, never as zero', () => {
    const s = scoreChannel(SHEET, { sample: 147 });
    const collection = s.bands.find((b) => b.key === 'collection_rate')!;
    expect(collection.points).toBeNull();
    expect(collection.weight).toBe(15);
  });
});

describe('a door with almost nothing behind it', () => {
  it('gets no score at all — Facebook Ads, 4 confirmed', () => {
    const s = scoreChannel({ delivery_rate: { value: 50 }, return_rate: { value: 33 } }, { sample: 4 });
    expect(s.total).toBeNull();
    expect(s.possible).toBe(0);
    expect(s.reason).toBe('BELOW_MINIMUM');
  });

  it('and says why, with the count, so nobody reads it as «bad»', () => {
    const why = whyNoScore(scoreChannel({ delivery_rate: { value: 50 } }, { sample: 4 }));
    expect(why).toContain('4');
    expect(why).toContain(String(MIN_CONFIRMED));
  });

  it('while a graded door has nothing to explain away', () => {
    expect(whyNoScore(scoreChannel(SHEET, { sample: 147 }))).toBeNull();
  });

  it('shares the floor with the bar health.ts puts under a rate', () => {
    // Not a coincidence to be re-tuned: a channel whose delivery rate
    // health.ts refuses to judge must not get a score built out of it.
    expect(MIN_CONFIRMED).toBe(10);
  });
});

describe('the value band', () => {
  it('is measured against the best door in the shop', () => {
    const best = scoreChannel({ delivered_value: { value: 50, reference: 50 } }, { sample: 20 });
    expect(best.bands.find((b) => b.key === 'delivered_value')?.points).toBe(10);
  });

  it('gives a lone door full marks rather than dividing by nothing', () => {
    const alone = scoreChannel({ delivered_value: { value: 20, reference: 0 } }, { sample: 20 });
    expect(alone.bands.find((b) => b.key === 'delivered_value')?.points).toBe(10);
  });

  it('refuses to grade a door that delivered nothing', () => {
    // TikTok on the measured data: one order, nothing delivered, no basket.
    const none = scoreChannel({ delivered_value: { value: 0, reference: 50 } }, { sample: 20 });
    expect(none.bands.find((b) => b.key === 'delivered_value')?.points).toBeNull();
  });

  it('never lets one door score more than the band is worth', () => {
    const over = scoreChannel({ delivered_value: { value: 500, reference: 50 } }, { sample: 20 });
    expect(over.bands.find((b) => b.key === 'delivered_value')?.points).toBe(10);
  });
});

describe('broken and out-of-range inputs', () => {
  it('clamp rather than escaping the band', () => {
    const s = scoreChannel({ delivery_rate: { value: 140 }, return_rate: { value: 140 } }, { sample: 20 });
    expect(s.bands.find((b) => b.key === 'delivery_rate')?.points).toBe(35);
    expect(s.bands.find((b) => b.key === 'return_rate')?.points).toBe(0);
  });

  it('and a negative rate cannot earn points', () => {
    const s = scoreChannel({ delivery_rate: { value: -20 } }, { sample: 20 });
    expect(s.bands.find((b) => b.key === 'delivery_rate')?.points).toBe(0);
  });

  it('a non-finite value is unmeasurable, not zero', () => {
    const s = scoreChannel({ delivery_rate: { value: Number.NaN } }, { sample: 20 });
    expect(s.bands.find((b) => b.key === 'delivery_rate')?.points).toBeNull();
  });

  it('a broken sample is no sample', () => {
    expect(scoreChannel(SHEET, { sample: Number.NaN }).reason).toBe('BELOW_MINIMUM');
    expect(scoreChannel(SHEET, { sample: -5 }).sample).toBe(0);
  });
});

describe('whether «collected» may be scored at all', () => {
  it('is withheld on the measured shop — 0 collected of 119 delivered', () => {
    const t = collectionTrust(0, 119);
    expect(t.level).toBe('WITHHELD');
    expect(t.share).toBe(0);
    expect(t.ar).toContain('119');
    expect(t.ar).toContain('التحصيل');
  });

  it('and opens as soon as statements are actually matched', () => {
    expect(collectionTrust(115, 119).level).toBe('STATED');
  });

  it('asked once for the shop, not per door', () => {
    // A per-channel question would give four channels four zeroes and rank
    // them by a tie. The signature takes shop-wide counts only.
    expect(collectionTrust.length).toBe(2);
  });
});

describe('the orders that carry no channel', () => {
  it('are a share somebody can see — 14 of 171', () => {
    expect(unattributedShare(14, 171)).toBe(8);
  });

  it('and are null rather than zero when there are no orders at all', () => {
    expect(unattributedShare(0, 0)).toBeNull();
  });
});
