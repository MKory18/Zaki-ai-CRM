import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A STREET IS NOT A GOVERNORATE.
 *
 * «يتعلم السيستم خلال كم بصير التسليم لكل محافظةٍ وعنوان» — and only the
 * first half of that sentence was built. `delivery-time.ts` quoted the
 * owner's words in full at the top of the file and then grouped by
 * `regionId` alone: the address was in the comment and nowhere in the code.
 *
 * عمّان is a governorate of four million. A parcel to a tower downtown and
 * a parcel to a village on its edge are both «عمّان», and quoting the
 * governorate's median to the second is how a promise gets broken at a
 * door two days late.
 *
 * ── AND THE DATA CANNOT CARRY IT YET, WHICH IS WHY THE FLOOR MATTERS ──
 *
 * MEASURED on this database the day this was written: 26 delivered orders,
 * every one of them with `deliveredAt` within ONE SECOND of `shippedAt`,
 * one governorate carrying all of them, and three distinct addresses across
 * thirty-seven customers. There are no real durations here at all.
 *
 * So what is asserted below is not «the prediction is right on this data».
 * It is that the engine stays SILENT until there is something to say, that
 * the finer grain beats the coarser one the day it fills up, and that the
 * two spellings of one street are one street. The day real deliveries land
 * it starts answering by itself; until then it says nothing, which is the
 * only honest answer and the one the floor exists to produce.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { db } = vi.hoisted(() => ({ db: { order: { findMany: vi.fn() } } }));
vi.mock('./db', () => ({ db }));

import {
  ETA_LEVEL_AR,
  EVERYWHERE,
  MIN_DELIVERIES,
  addressKey,
  deliveryWindows,
  windowFor,
  windowWithLevel,
} from './delivery-time';

const T0 = new Date('2026-09-01T00:00:00.000Z').getTime();

/** A delivery that took `days`, to `address` in `regionId` («عمّان»). */
const took = (regionId: string, days: number, address: string | null, regionName = 'عمّان') => ({
  regionId,
  shippedAt: new Date(T0),
  deliveredAt: new Date(T0 + days * 86_400_000),
  customer: address === null ? null : { address },
  region: { name: regionName },
});

const scope = { companyId: 'c1', storeId: 's1' };
const many = (n: number, f: () => unknown) => Array.from({ length: n }, f);

beforeEach(() => vi.clearAllMocks());

describe('Ⅰ · the address answers for itself once it has earned it', () => {
  it('a street with five deliveries beats the governorate it sits in', async () => {
    /*
     * The governorate is slow — twenty deliveries at six days — and this
     * one street is fast. Before this, the seller was told six days for a
     * street that has never taken more than one.
     */
    db.order.findMany.mockResolvedValue([
      ...many(20, () => took('r-amman', 6, 'جبل الحسين')),
      ...many(5, () => took('r-amman', 1, 'الصويفية')),
    ]);
    const windows = await deliveryWindows(scope);

    const region = windowFor(windows, 'r-amman');
    expect(region!.medianDays, 'المحافظةُ لم تُقَس').toBe(6);

    const street = windowFor(windows, 'r-amman', { text: 'الصويفية', governorate: 'عمّان' });
    expect(street!.medianDays, 'الشارعُ أخذَ رقمَ المحافظة').toBe(1);
    expect(street!.samples).toBe(5);
  });

  it('and a street with four falls back to the governorate — no anecdotes', async () => {
    expect(MIN_DELIVERIES, 'الحدُّ تغيّر وهذا الاختبارُ مبنيٌّ عليه').toBe(5);
    db.order.findMany.mockResolvedValue([
      ...many(20, () => took('r-amman', 6, 'جبل الحسين')),
      ...many(MIN_DELIVERIES - 1, () => took('r-amman', 1, 'الصويفية')),
    ]);
    const windows = await deliveryWindows(scope);
    const street = windowFor(windows, 'r-amman', { text: 'الصويفية', governorate: 'عمّان' });
    expect(street!.medianDays, 'أربعُ تسليماتٍ صارت وعداً').toBe(6);
  });

  it('and the governorate does NOT shrink as its streets fill up', async () => {
    /*
     * A delivery is evidence about the street AND about the governorate.
     * Taking it out of the wider set once the street has its own would make
     * the broader claim WEAKER the more the shop learns, which is backwards
     * — and on a shop whose every order goes to one street it would empty
     * the governorate entirely.
     */
    db.order.findMany.mockResolvedValue(many(8, () => took('r-amman', 3, 'الصويفية')));
    const windows = await deliveryWindows(scope);
    expect(windows.get('r-amman')?.samples, 'المحافظةُ فقدت تسليماتِ شوارعِها').toBe(8);
    expect(windows.get(EVERYWHERE)?.samples, 'البلدُ فقدَها كذلك').toBe(8);
  });

  it('and the answer says which grain it came from', async () => {
    db.order.findMany.mockResolvedValue([
      ...many(20, () => took('r-amman', 6, 'جبل الحسين')),
      ...many(5, () => took('r-amman', 1, 'الصويفية')),
    ]);
    const windows = await deliveryWindows(scope);

    expect(windowWithLevel(windows, 'r-amman', { text: 'الصويفية', governorate: 'عمّان' })?.level).toBe('address');
    expect(windowWithLevel(windows, 'r-amman', { text: 'شارع لم يُسلَّم إليه', governorate: 'عمّان' })?.level).toBe('region');
    expect(windowWithLevel(windows, 'r-unknown')?.level).toBe('country');
    expect(ETA_LEVEL_AR.address).toBe('لهذا العنوان');
  });

  it('and `windowWithLevel` and `windowFor` never disagree', async () => {
    /*
     * Two renderings of one lookup is the defect this repository keeps
     * finding. Walked over every combination rather than sampled.
     */
    db.order.findMany.mockResolvedValue([
      ...many(20, () => took('r-amman', 6, 'جبل الحسين')),
      ...many(5, () => took('r-amman', 1, 'الصويفية')),
    ]);
    const windows = await deliveryWindows(scope);
    const disagreements: string[] = [];
    for (const regionId of ['r-amman', 'r-unknown', null]) {
      for (const text of ['الصويفية', 'جبل الحسين', 'شارع غريب', '', null]) {
        const a = windowFor(windows, regionId, { text, governorate: 'عمّان' });
        const b = windowWithLevel(windows, regionId, { text, governorate: 'عمّان' })?.window ?? null;
        if (a !== b) disagreements.push(`${regionId} / ${text}: ${a?.medianDays} ضدّ ${b?.medianDays}`);
      }
    }
    expect(disagreements, `دالّتانِ لحُكمٍ واحد:\n${disagreements.join('\n')}`).toEqual([]);
  });
});

describe('Ⅱ · one street written two ways is one street', () => {
  it('a stretched letter and a hamza do not split a street in two', async () => {
    /*
     * Five deliveries to one street, typed five ways by five people. Group
     * them literally and each spelling sits at one delivery — below the
     * floor — so the street that HAS been learned answers nothing.
     */
    /*
     * EACH SPELLING IS GENUINELY DIFFERENT TEXT — asserted, because a
     * fixture of five identical strings would pass whatever the fold does
     * and this file would be testing nothing. A tatweel, a hamza, a
     * ta-marbuta, a trailing space and a doubled space: the five ways this
     * actually arrives.
     */
    const SPELLINGS = [
      'شارع الملك الحسين',
      'شارع الملك الحسـين',
      'شارع الملك الحسين ',
      'شارع  الملك  الحسين',
      'شارع الملك الحسىن',
    ];
    expect(new Set(SPELLINGS).size, 'التهجئاتُ متطابقةٌ — التجربةُ فارغة').toBe(5);

    db.order.findMany.mockResolvedValue([
      ...SPELLINGS.map((a) => took('r-amman', 1, a)),
      ...many(20, () => took('r-amman', 6, 'مكان آخر')),
    ]);
    const windows = await deliveryWindows(scope);
    // And all five fold to ONE key, which is the claim.
    expect(new Set(SPELLINGS.map((a) => addressKey('r-amman', a, 'عمّان'))).size).toBe(1);
    const street = windowFor(windows, 'r-amman', { text: 'شارع الملك الحسين', governorate: 'عمّان' });
    expect(street!.samples, 'الكتابةُ المختلفةُ صارت شارعاً آخر').toBe(5);
    expect(street!.medianDays).toBe(1);
  });

  it('and the governorate repeated at the front is not part of the street', async () => {
    /*
     * Most stored addresses came from a courier's statement, which writes
     * «عمّان - عمّان الصويفية». Keep that prefix and the same street typed
     * plainly by a seller is a different key.
     */
    db.order.findMany.mockResolvedValue([
      ...many(3, () => took('r-amman', 2, 'عمّان - عمّان الصويفية')),
      ...many(2, () => took('r-amman', 2, 'الصويفية')),
      ...many(20, () => took('r-amman', 7, 'مكان آخر')),
    ]);
    const windows = await deliveryWindows(scope);
    const street = windowFor(windows, 'r-amman', { text: 'الصويفية', governorate: 'عمّان' });
    expect(street!.samples, 'بادئةُ المحافظةِ فرَّقت الشارعَ عن نفسِه').toBe(5);
    expect(street!.medianDays).toBe(2);
  });

  it('and the key is namespaced so an address can never be read as a region id', async () => {
    const key = addressKey('r-amman', 'الصويفية', 'عمّان')!;
    expect(key.startsWith('@'), 'مفتاحُ العنوانِ يُشبهُ معرِّفَ محافظة').toBe(true);
    expect(key).toContain('r-amman');
    expect(key).not.toBe(EVERYWHERE);
  });
});

describe('Ⅲ · what is not an address', () => {
  it('an empty address, or one that is only the governorate, is not a key', () => {
    for (const text of ['', '   ', null, undefined, 'عمّان', 'عمّان - عمّان', 'ب']) {
      expect(addressKey('r-amman', text, 'عمّان'), String(text)).toBeNull();
    }
  });

  it('and such an order still teaches the governorate', async () => {
    // Telegram intake stores the governorate AS the address when none was
    // given. Those deliveries are real and must not be thrown away.
    db.order.findMany.mockResolvedValue(many(6, () => took('r-amman', 3, 'عمّان')));
    const windows = await deliveryWindows(scope);
    expect(windows.get('r-amman')?.samples, 'تسليماتٌ بلا عنوانٍ ضاعت').toBe(6);
    expect(windowWithLevel(windows, 'r-amman', { text: 'عمّان', governorate: 'عمّان' })?.level).toBe('region');
  });

  it('and a customer row that is missing entirely does not throw', async () => {
    db.order.findMany.mockResolvedValue(many(6, () => took('r-amman', 3, null)));
    const windows = await deliveryWindows(scope);
    expect(windows.get('r-amman')?.samples).toBe(6);
  });

  it('and no region means no address key, whatever the text says', () => {
    expect(addressKey(null, 'الصويفية', 'عمّان')).toBeNull();
    expect(addressKey(undefined, 'الصويفية', 'عمّان')).toBeNull();
  });
});

describe('Ⅳ · the engine is silent on the data it actually has', () => {
  it('26 deliveries that took no time at all produce «أقل من يوم», not a guess', async () => {
    /*
     * THE MEASURED STATE, reproduced. Every delivered order on this
     * database has `deliveredAt` within a second of `shippedAt`, all in one
     * governorate. The engine must not round that up into a promise — and
     * it must not refuse it either, because zero days IS what happened.
     */
    db.order.findMany.mockResolvedValue(
      many(26, () => ({
        regionId: 'r-amman',
        shippedAt: new Date(T0),
        deliveredAt: new Date(T0 + 1000),
        customer: { address: 'عمّان' },
        region: { name: 'عمّان' },
      }))
    );
    const windows = await deliveryWindows(scope);
    const w = windowFor(windows, 'r-amman');
    expect(w!.medianDays, 'ثانيةٌ واحدةٌ صارت يوماً').toBe(0);
    expect(w!.slowDays).toBe(0);
  });

  it('and an empty shop says nothing at all', async () => {
    db.order.findMany.mockResolvedValue([]);
    const windows = await deliveryWindows(scope);
    expect(windowWithLevel(windows, 'r-amman', { text: 'الصويفية', governorate: 'عمّان' })).toBeNull();
    expect(windowFor(windows, 'r-amman')).toBeNull();
  });

  it('and a negative span is never learned from, at either grain', async () => {
    db.order.findMany.mockResolvedValue([
      ...many(5, () => took('r-amman', -3, 'الصويفية')),
      ...many(5, () => took('r-amman', 2, 'الصويفية')),
    ]);
    const windows = await deliveryWindows(scope);
    const street = windowFor(windows, 'r-amman', { text: 'الصويفية', governorate: 'عمّان' });
    expect(street!.samples, 'مدّةٌ سالبةٌ دخلت التعلُّم').toBe(5);
    expect(street!.medianDays).toBe(2);
  });
});
