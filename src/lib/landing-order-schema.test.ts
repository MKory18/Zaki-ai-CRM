import { describe, expect, it } from 'vitest';

/**
 * Public landing-page order validation.
 *
 * Ported from tests/landing-order-validation-tests.ts, which validated Syria
 * and only Syria. The rules now follow the country the page sells into, so
 * every case runs against both a Syrian and a Jordanian store.
 */

import {
  buildPublicOrderSchema,
  mapZodFieldErrors,
  isKnownRegion,
} from './landing-order-schema';
import { isValidPhoneFor, phoneErrorFor } from './phone-rules';

const SYRIA = { countryCode: 'SY', regions: ['دمشق', 'حلب', 'اللاذقية', 'طرطوس'] };
const JORDAN = { countryCode: 'JO', regions: ['عمّان', 'إربد', 'الزرقاء', 'العقبة'] };

const syriaSchema = buildPublicOrderSchema(SYRIA);
const jordanSchema = buildPublicOrderSchema(JORDAN);

const GOOD_SY = {
  full_name: 'محمد العلي',
  phone: '0932545678',
  address: 'شارع الحمراء 5',
  city: 'اللاذقية',
  offerId: '1234567890abcd',
  notes: '',
  website: '',
  ts: '',
};

const GOOD_JO = { ...GOOD_SY, phone: '0790123456', city: 'عمّان', address: 'شارع المدينة المنورة 20' };

describe('phone rules per country', () => {
  it('accepts Syrian numbers in every written form', () => {
    for (const p of ['0932545678', '932545678', '+963932545678', '00963932545678', '0932 - 545 678', '0212345678']) {
      expect(isValidPhoneFor('SY', p), p).toBe(true);
    }
  });

  it('accepts Jordanian numbers in every written form', () => {
    for (const p of ['0790123456', '790123456', '+962790123456', '00962790123456', '079 012 3456', '062345678']) {
      expect(isValidPhoneFor('JO', p), p).toBe(true);
    }
  });

  it('refuses the other country’s number — the whole point of the fix', () => {
    expect(isValidPhoneFor('JO', '0932545678')).toBe(false); // Syrian mobile on a Jordanian store
    expect(isValidPhoneFor('SY', '0790123456')).toBe(false); // Jordanian mobile on a Syrian store
  });

  it('refuses nonsense regardless of country', () => {
    for (const p of ['abc', '123', '09325', '', 'هاتف', '093254567812345678']) {
      expect(isValidPhoneFor('SY', p), p).toBe(false);
      expect(isValidPhoneFor('JO', p), p).toBe(false);
    }
  });

  it('falls back to a length check for a country with no rule, rather than refusing everyone', () => {
    expect(isValidPhoneFor('ZZ', '0790123456')).toBe(true);
    expect(isValidPhoneFor(null, '0932545678')).toBe(true);
    expect(isValidPhoneFor('ZZ', '12')).toBe(false);
    expect(isValidPhoneFor('ZZ', 'abc')).toBe(false);
  });

  it('names the country in the error the visitor reads', () => {
    expect(phoneErrorFor('JO')).toContain('أردني');
    expect(phoneErrorFor('SY')).toContain('سوري');
    expect(phoneErrorFor('ZZ')).toBe('يرجى إدخال رقم هاتف صحيح.');
  });
});

describe('city comes from the country’s own regions', () => {
  it('accepts a region of that country', () => {
    expect(jordanSchema.safeParse(GOOD_JO).success).toBe(true);
    expect(syriaSchema.safeParse(GOOD_SY).success).toBe(true);
  });

  it('refuses a Syrian governorate on a Jordanian store', () => {
    const parsed = jordanSchema.safeParse({ ...GOOD_JO, city: 'اللاذقية' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(mapZodFieldErrors(parsed.error).city).toBe('يرجى اختيار المدينة من القائمة.');
  });

  it('tells the visitor WHICH country’s number is expected', () => {
    const parsed = jordanSchema.safeParse({ ...GOOD_JO, phone: '0932545678' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(mapZodFieldErrors(parsed.error).phone).toContain('أردني');
  });

  it('refuses a city that is nobody’s region', () => {
    expect(jordanSchema.safeParse({ ...GOOD_JO, city: 'باريس' }).success).toBe(false);
    expect(jordanSchema.safeParse({ ...GOOD_JO, city: "عمّان'; DROP TABLE x;--" }).success).toBe(false);
  });

  it('matches ignoring case and surrounding spaces', () => {
    expect(isKnownRegion(['عمّان'], '  عمّان ')).toBe(true);
    expect(isKnownRegion(['Amman'], 'amman')).toBe(true);
  });

  it('falls back to free text when a country has no regions recorded yet', () => {
    const schema = buildPublicOrderSchema({ countryCode: 'JO', regions: [] });
    expect(schema.safeParse({ ...GOOD_JO, city: 'أي مدينة' }).success).toBe(true);
    // still required, still bounded
    expect(schema.safeParse({ ...GOOD_JO, city: '' }).success).toBe(false);
  });
});

describe('field validation', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['missing name', { ...GOOD_JO, full_name: '' }, 'full_name'],
    ['one-character name', { ...GOOD_JO, full_name: 'م' }, 'full_name'],
    ['letters for a phone', { ...GOOD_JO, phone: 'abc' }, 'phone'],
    ['short phone', { ...GOOD_JO, phone: '123' }, 'phone'],
    ['short but formatted phone', { ...GOOD_JO, phone: '079-25' }, 'phone'],
    ['short address', { ...GOOD_JO, address: 'شارع' }, 'address'],
    ['empty city', { ...GOOD_JO, city: '' }, 'city'],
  ];

  for (const [name, payload, field] of cases) {
    it(`refuses ${name} and names the field`, () => {
      const parsed = jordanSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(Object.keys(mapZodFieldErrors(parsed.error))).toContain(field);
    });
  }

  it('accepts a page with no offer selected', () => {
    expect(jordanSchema.safeParse({ ...GOOD_JO, offerId: '' }).success).toBe(true);
  });

  it('accepts a short-but-real address', () => {
    expect(jordanSchema.safeParse({ ...GOOD_JO, address: 'إربد الوسط' }).success).toBe(true);
  });
});

describe('the browser never decides price, quantity or ownership', () => {
  it('drops every value the client had no business sending', () => {
    const parsed = jordanSchema.safeParse({
      ...GOOD_JO,
      price: 1, quantity: 999, freeQuantity: 50,
      productId: 'hack', companyId: 'hack', status: 'CONFIRMED', moderatorId: 'hack',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      for (const key of ['price', 'quantity', 'freeQuantity', 'productId', 'companyId', 'status', 'moderatorId']) {
        expect(parsed.data).not.toHaveProperty(key);
      }
    }
  });
});

describe('errors never leak Zod internals to a visitor', () => {
  it('returns Arabic messages for an entirely empty payload', () => {
    const parsed = jordanSchema.safeParse({ full_name: '', phone: '', address: '', city: '' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const fieldErrors = mapZodFieldErrors(parsed.error);
    const serialized = JSON.stringify(fieldErrors);
    for (const leak of ['Too small', 'Invalid input', 'Expected', 'String must']) {
      expect(serialized).not.toContain(leak);
    }
    expect(fieldErrors.phone).toBe('يرجى إدخال رقم هاتف صحيح.');
    expect(fieldErrors.city).toBe('يرجى اختيار المدينة.');
    expect(fieldErrors.full_name).toBe('يرجى إدخال الاسم الكامل.');
    // The specific rule that fired wins when it has its own Arabic message.
    expect(fieldErrors.address).toBe('يرجى إدخال العنوان بشكل أوضح.');
  });
});
