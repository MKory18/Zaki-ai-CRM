import { describe, it, expect } from 'vitest';
import { CURRENCIES, currencyLabel, minorUnitFor } from './currencies';

describe('the decimals a currency is counted in', () => {
  it('gives the three-decimal dinars three', () => {
    // The fils. A JOD country left at the old default of 2 rounded every
    // COD, commission and settlement to the wrong unit.
    for (const code of ['JOD', 'KWD', 'BHD', 'OMR', 'IQD', 'LYD', 'TND']) {
      expect(minorUnitFor(code)).toBe(3);
    }
  });

  it('gives the two-decimal currencies two', () => {
    for (const code of ['USD', 'SAR', 'AED', 'EGP', 'EUR', 'SYP']) expect(minorUnitFor(code)).toBe(2);
  });

  it('reads a code however it is typed', () => {
    expect(minorUnitFor(' jod ')).toBe(3);
  });

  it('knows nothing it was not told, rather than guessing 2', () => {
    expect(minorUnitFor('GBP')).toBeNull();
  });

  it('lists every currency once, with a valid ISO code and an Arabic name', () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.ar.length).toBeGreaterThan(2);
      expect(c.minorUnit).toBeGreaterThanOrEqual(0);
      expect(c.minorUnit).toBeLessThanOrEqual(4);
    }
  });

  it('labels a known code in Arabic and an unknown one as itself', () => {
    expect(currencyLabel('JOD')).toBe('دينار أردني (JOD)');
    expect(currencyLabel('GBP')).toBe('GBP');
  });
});
