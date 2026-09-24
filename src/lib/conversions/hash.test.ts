import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  normalizePhone, normalizeName, normalizeEmail, normalizeCity, normalizeCountry,
  splitName, buildUserData, matchQuality,
} from './hash';

const sha = (v: string) => crypto.createHash('sha256').update(v, 'utf8').digest('hex');

/**
 * The failure this file exists to prevent.
 *
 * A mis-normalised phone number does not throw, does not warn, and is not
 * rejected. Meta accepts the event, reports success, and matches nobody —
 * so the seller sees a working integration and a match rate near zero, with
 * nothing anywhere to explain it. Every rule below is a rule that, broken,
 * produces exactly that silence.
 */

describe('phone — the same person must hash to the same fingerprint', () => {
  it('reduces every way a Jordanian mobile is written to one form', () => {
    const forms = [
      '0791234567',
      '00962791234567',
      '+962791234567',
      '962791234567',
      '+962 79 123 4567',
      '079-123-4567',
      '(079) 1234567',
      ' 0791234567 ',
    ];
    const normalised = forms.map((f) => normalizePhone(f));
    expect(new Set(normalised).size).toBe(1);
    expect(normalised[0]).toBe('962791234567');
  });

  it('keeps an already-international number intact', () => {
    expect(normalizePhone('962781234567')).toBe('962781234567');
    expect(normalizePhone('962771234567')).toBe('962771234567');
  });

  it('drops the trunk zero and only the trunk zero', () => {
    // 962 followed by too few digits is not an international number that
    // happens to start with 962 — it is a local number being misread.
    expect(normalizePhone('0796')).toBe('962796');
    expect(normalizePhone('96279')).toBe('96296279');
  });

  it('serves another country when the store is in one', () => {
    expect(normalizePhone('0501234567', '966')).toBe('966501234567');
    expect(normalizePhone('+966501234567', '966')).toBe('966501234567');
  });

  it('returns nothing rather than an empty hash', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('0')).toBeNull();
  });
});

describe('name — Arabic decoration is not identity', () => {
  it('drops diacritics, kashida and punctuation, keeps the letters', () => {
    expect(normalizeName('مُحَمَّد')).toBe(normalizeName('محمد'));
    expect(normalizeName('محـــمد')).toBe('محمد');
    expect(normalizeName('  أحمد  ')).toBe('أحمد');
  });

  it('lowercases Latin names', () => {
    expect(normalizeName('Ahmad')).toBe('ahmad');
    expect(normalizeName('AHMAD')).toBe('ahmad');
  });

  it('takes the LAST part as the surname, not the second', () => {
    expect(splitName('محمد عبد الله الشمري')).toEqual({
      fn: normalizeName('محمد'),
      ln: normalizeName('الشمري'),
    });
  });

  it('gives a first name and no surname when there is only one word', () => {
    expect(splitName('محمد')).toEqual({ fn: normalizeName('محمد'), ln: null });
    expect(splitName('   ')).toEqual({ fn: null, ln: null });
  });
});

describe('email, city and country', () => {
  it('lowercases an email and refuses a non-email', () => {
    expect(normalizeEmail('  Ahmad@Example.COM ')).toBe('ahmad@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });

  it('strips spaces from a city, so "عمان " and "عمان" are one place', () => {
    expect(normalizeCity('  عمّان ')).toBe(normalizeCity('عمان'));
    expect(normalizeCity('Az Zarqa')).toBe('azzarqa');
  });

  it('falls back to the store country rather than sending nothing', () => {
    expect(normalizeCountry('JO')).toBe('jo');
    expect(normalizeCountry('')).toBe('jo');
    expect(normalizeCountry('Jordan')).toBe('jo');
    expect(normalizeCountry('', 'sa')).toBe('sa');
  });
});

describe('user_data', () => {
  it('hashes what Meta hashes and passes through what it does not', () => {
    const u = buildUserData({
      phone: '0791234567',
      fullName: 'أحمد الشمري',
      city: 'عمان',
      ip: '95.1.2.3',
      userAgent: 'Mozilla/5.0',
      fbc: 'fb.1.1700000000.ABC',
      fbp: 'fb.1.1700000000.123',
    });

    expect(u.ph).toEqual([sha('962791234567')]);
    expect(u.ct).toEqual([sha(normalizeCity('عمان')!)]);
    expect(u.country).toEqual([sha('jo')]);

    // Not hashed: hashing these makes them useless to Meta.
    expect(u.client_ip_address).toBe('95.1.2.3');
    expect(u.client_user_agent).toBe('Mozilla/5.0');
    expect(u.fbc).toBe('fb.1.1700000000.ABC');
  });

  it('omits an absent field instead of sending the hash of nothing', () => {
    const u = buildUserData({ phone: '0791234567' });
    const EMPTY = sha('');
    expect(u.em).toBeUndefined();
    expect(u.fn).toBeUndefined();
    expect(JSON.stringify(u)).not.toContain(EMPTY);
  });

  it('never lets a raw personal value into the payload', () => {
    const u = buildUserData({
      phone: '0791234567',
      fullName: 'أحمد الشمري',
      email: 'ahmad@example.com',
      city: 'عمان',
      externalId: 'cust_9',
    });
    const json = JSON.stringify(u);
    for (const raw of ['0791234567', '962791234567', 'أحمد', 'الشمري', 'ahmad@example.com', 'عمان', 'cust_9']) {
      expect(json).not.toContain(raw);
    }
  });

  it('produces only lowercase hex of the right length', () => {
    const u = buildUserData({ phone: '0791234567', fullName: 'Ahmad Shamari', email: 'a@b.co' });
    for (const key of ['ph', 'fn', 'ln', 'em', 'ct', 'country'] as const) {
      for (const v of u[key] ?? []) expect(v).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('is stable: the same customer twice gives the same fingerprints', () => {
    const facts = { phone: '+962 79 123 4567', fullName: ' أحمد  الشمري ' };
    expect(buildUserData(facts)).toEqual(buildUserData({ phone: '0791234567', fullName: 'أحمد الشمري' }));
  });
});

describe('match quality', () => {
  it('rises as more is known, and is never invented', () => {
    const none = matchQuality({});
    const phone = matchQuality(buildUserData({ phone: '0791234567' }));
    const lots = matchQuality(
      buildUserData({ phone: '0791234567', fullName: 'أحمد الشمري', city: 'عمان', email: 'a@b.co', fbc: 'fb.1.1.A' })
    );
    expect(none).toBe(0);
    expect(phone).toBeGreaterThan(0);
    expect(lots).toBeGreaterThan(phone);
    expect(lots).toBeLessThanOrEqual(1);
  });
});
