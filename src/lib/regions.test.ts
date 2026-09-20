import { describe, expect, it } from 'vitest';
import { matchRegion, normalizePlace } from './regions';

/**
 * The matcher that keeps an order from reaching the shipment screen with no
 * region — which is what stopped it being priced at all.
 */

const JO = [
  { id: 'amman', name: 'عمّان' },
  { id: 'irbid', name: 'إربد' },
  { id: 'zarqa', name: 'الزرقاء' },
  { id: 'karak', name: 'الكرك' },
  { id: 'tafila', name: 'الطفيلة' },
];

const SY = [
  { id: 'damascus', name: 'دمشق' },
  { id: 'rif', name: 'ريف دمشق' },
  { id: 'aleppo', name: 'حلب' },
  { id: 'idlib', name: 'إدلب' },
];

describe('normalizePlace', () => {
  it('ignores harakat, hamza spelling and the word محافظة', () => {
    expect(normalizePlace('عمّان')).toBe(normalizePlace('عمان'));
    expect(normalizePlace('إربد')).toBe(normalizePlace('اربد'));
    expect(normalizePlace('محافظة الكرك')).toBe(normalizePlace('الكرك'));
    expect(normalizePlace('  الطفيلة  ')).toBe(normalizePlace('الطفيلة'));
  });
});

describe('matchRegion', () => {
  it('matches the plain name', () => {
    expect(matchRegion(JO, 'عمّان')?.id).toBe('amman');
    expect(matchRegion(JO, 'الكرك')?.id).toBe('karak');
    expect(matchRegion(JO, 'الطفيلة')?.id).toBe('tafila');
  });

  it('matches however it was typed', () => {
    expect(matchRegion(JO, 'عمان')?.id).toBe('amman');
    expect(matchRegion(JO, 'محافظة اربد')?.id).toBe('irbid');
    expect(matchRegion(JO, ' الزرقاء ')?.id).toBe('zarqa');
  });

  it('pulls the region out of a full written address', () => {
    expect(matchRegion(SY, 'ريف دمشق - ريف دمشق بلدة معربا')?.id).toBe('rif');
    expect(matchRegion(SY, 'دمشق - دمشق المهاجرين دمشق')?.id).toBe('damascus');
  });

  it('prefers the longer name so ريف دمشق never collapses into دمشق', () => {
    expect(matchRegion(SY, 'ريف دمشق')?.id).toBe('rif');
  });

  it('returns null rather than guessing', () => {
    expect(matchRegion(JO, 'باريس')).toBeNull();
    expect(matchRegion(JO, '')).toBeNull();
    expect(matchRegion(JO, null)).toBeNull();
    expect(matchRegion(JO, 'إدلب')).toBeNull(); // a Syrian governorate on a Jordanian list
  });

  it('returns null on a tie instead of picking one', () => {
    const tie = [{ id: 'a', name: 'شمال' }, { id: 'b', name: 'جنوب' }];
    expect(matchRegion(tie, 'المنطقة')).toBeNull();
  });
});
