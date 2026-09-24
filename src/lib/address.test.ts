import { describe, it, expect } from 'vitest';
import { placeLine, sameArabicName, stripLeadingGovernorate } from './address';

/**
 * The samples are the real addresses from the dev data — the courier's own
 * "<governorate> - <city> <street>" text, copied from its statement.
 */

describe('placeLine — the governorate once', () => {
  it('drops the courier’s repeated prefix', () => {
    expect(placeLine('طرطوس', 'طرطوس', 'طرطوس - طرطوس بانياس. استراد بانياس جبلة')).toBe(
      'طرطوس — بانياس. استراد بانياس جبلة'
    );
  });

  it('leaves a governorate later in the text alone — it is meaning there', () => {
    expect(placeLine('دمشق', 'دمشق', 'دمشق - دمشق المهاجرين دمشق')).toBe('دمشق — المهاجرين دمشق');
    // «شمالي حلب» is "north of Aleppo"; removing «حلب» would ship to «شمالي».
    expect(placeLine('حلب', 'حلب', 'حلب - حلب حربل - مارع - شمالي حلب')).toBe('حلب — حربل - مارع - شمالي حلب');
  });

  it('prints just the governorate when that is all the address was', () => {
    expect(placeLine('اللاذقية', 'اللاذقية', 'اللاذقية - اللاذقية اللاذقية')).toBe('اللاذقية');
    // The Telegram case: governorate stored as the address.
    expect(placeLine('حلب', 'حلب', 'حلب')).toBe('حلب');
  });

  it('matches the governorate however the hamza is written', () => {
    expect(placeLine('إدلب', 'إدلب', 'ادلب - إدلب - إدلب معرة مصرين')).toBe('إدلب — معرة مصرين');
  });

  it('handles an address that starts with the governorate without a dash', () => {
    expect(placeLine('حلب', 'حلب', 'حلب مدينة الباب')).toBe('حلب — مدينة الباب');
  });

  it('matches a governorate of two words whole', () => {
    expect(placeLine('ريف دمشق', null, 'ريف دمشق - ريف دمشق بلدة معربا')).toBe('ريف دمشق — بلدة معربا');
    // «ريف» alone is not «ريف دمشق», so nothing is removed.
    expect(placeLine('ريف دمشق', null, 'ريف حماة الغربي')).toBe('ريف دمشق — ريف حماة الغربي');
  });

  it('keeps a clean address as it was', () => {
    expect(placeLine('دمشق', 'دمشق', 'المزة، جانب الجامع')).toBe('دمشق — المزة، جانب الجامع');
    expect(placeLine('الفردوس', null, 'الفردوس - شارع 14')).toBe('الفردوس — شارع 14');
  });

  it('falls back to the city when the order has no region', () => {
    expect(placeLine(null, 'عمان', 'عمان - الشميساني')).toBe('عمان — الشميساني');
  });

  it('prints the address alone when nothing names a governorate', () => {
    expect(placeLine(null, null, 'شارع الجامعة')).toBe('شارع الجامعة');
    expect(placeLine('', '  ', 'شارع الجامعة')).toBe('شارع الجامعة');
  });

  it('never loops or empties on odd input', () => {
    expect(placeLine('حلب', null, '')).toBe('حلب');
    expect(placeLine('حلب', null, ' - - ')).toBe('حلب');
    expect(placeLine('حلب', null, 'حلب - حلب - حلب - حلب')).toBe('حلب');
  });
});

describe('sameArabicName', () => {
  it('treats spelling variants of one name as one', () => {
    expect(sameArabicName('ادلب', 'إدلب')).toBe(true);
    expect(sameArabicName('حماة', 'حماه')).toBe(true);
    expect(sameArabicName('مُحَمَّد', 'محمد')).toBe(true);
  });

  it('keeps different names different, and nothing equals nothing', () => {
    expect(sameArabicName('حلب', 'حمص')).toBe(false);
    expect(sameArabicName('', '')).toBe(false);
  });
});

describe('stripLeadingGovernorate', () => {
  it('removes only from the start', () => {
    expect(stripLeadingGovernorate('بانياس - طرطوس', 'طرطوس')).toBe('بانياس - طرطوس');
  });

  it('does not eat a word that merely begins with the governorate', () => {
    // «حلبون» is a place of its own, not «حلب».
    expect(stripLeadingGovernorate('حلبون الشرقية', 'حلب')).toBe('حلبون الشرقية');
  });
});
