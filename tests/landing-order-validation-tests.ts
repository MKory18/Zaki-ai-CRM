/**
 * PUBLIC ORDER VALIDATION — Arabic field errors, Syrian phone/city, no Zod leaks.
 * Run: npx tsx tests/landing-order-validation-tests.ts
 */

import {
  publicOrderSchema,
  mapZodFieldErrors,
  ORDER_VALIDATION_ERROR_BODY,
  isValidSyrianPhone,
} from '../src/lib/landing-order-schema';

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}

const GOOD = {
  full_name: 'محمد العلي',
  phone: '0932545678',
  address: 'شارع الحمراء 5',
  city: 'اللاذقية',
  offerId: '1234567890abcd',
  notes: '',
  website: '',
  ts: '',
};

function check(name: string, payload: Record<string, unknown>, expectValid: boolean, expectField?: string) {
  const parsed = publicOrderSchema.safeParse(payload);
  if (expectValid) {
    ok(name, parsed.success);
  } else {
    if (!parsed.success) {
      const fe = mapZodFieldErrors(parsed.error);
      const raw = JSON.stringify(parsed.error.issues);
      ok(`${name} + no Zod internals leak`, !raw.includes('Too small') && !raw.includes('Invalid input') && !raw.includes('Expected string'));
      ok(`${name} → field: ${expectField}`, !!expectField && Object.keys(fe).includes(expectField));
    } else {
      ok(`${name} (expected invalid)`, false);
    }
  }
}

async function main() {
  console.log('\n══ PUBLIC ORDER VALIDATION TESTS ══\n');

  // ─── Phone validation unit tests ───
  console.log('— Syrian phone —');
  ok('1a. mobile 0932545678', isValidSyrianPhone('0932545678'));
  ok('1b. mobile without zero 932545678', isValidSyrianPhone('932545678'));
  ok('1c. +963 prefix', isValidSyrianPhone('+963932545678'));
  ok('1d. 00963 prefix', isValidSyrianPhone('00963932545678'));
  ok('1e. formatted with spaces/dashes', isValidSyrianPhone('0932 - 545 678'));
  ok('1f. landline 021 2345678', isValidSyrianPhone('0212345678'));
  ok('1g. letters rejected', !isValidSyrianPhone('abc'));
  ok('1h. short number rejected', !isValidSyrianPhone('123'));
  ok('1i. too short (5 digits) rejected', !isValidSyrianPhone('09325'));
  ok('1j. empty rejected', !isValidSyrianPhone(''));
  ok('1k. arabic text rejected', !isValidSyrianPhone('هاتف'));
  ok('1l. too long rejected', !isValidSyrianPhone('093254567812345678'));

  // ─── Field-level schema tests ───
  console.log('— Field validation —');
  check('2a. valid full payload', GOOD, true);
  check('2b. missing name', { ...GOOD, full_name: '' }, false, 'full_name');
  check('2c. 1-char name rejected', { ...GOOD, full_name: 'م' }, false, 'full_name');
  check('2d. invalid phone', { ...GOOD, phone: 'abc' }, false, 'phone');
  check('2e. short phone', { ...GOOD, phone: '123' }, false, 'phone');
  check('2f. short-but-formatted phone rejected', { ...GOOD, phone: '093-25' }, false, 'phone');
  check('2g. valid short address (≥5) accepted', { ...GOOD, address: 'حلب الجديدة' }, true);
  check('2h. short address rejected', { ...GOOD, address: 'شارع' }, false, 'address');
  check('2i. invalid city rejected', { ...GOOD, city: 'باريس' }, false, 'city');
  check('2j. empty city rejected', { ...GOOD, city: '' }, false, 'city');
  check('2k. injection city rejected', { ...GOOD, city: "دمشق'; DROP TABLE x;--" }, false, 'city');
  check('2l. missing offer accepted (page without offers)', { ...GOOD, offerId: '' }, true);
  check('2m. optional notes', { ...GOOD, notes: 'ملاحظة' }, true);
  check('2n. missing name field entirely', { phone: GOOD.phone, address: GOOD.address, city: GOOD.city }, false, 'full_name');
  check('2o. missing phone field entirely', { full_name: GOOD.full_name, address: GOOD.address, city: GOOD.city }, false, 'phone');
  check('2p. missing address field entirely', { full_name: GOOD.full_name, phone: GOOD.phone, city: GOOD.city }, false, 'address');
  check('2q. missing city field entirely', { full_name: GOOD.full_name, phone: GOOD.phone, address: GOOD.address }, false, 'city');

  // ─── Client price/quantity manipulation ignored by design ───
  console.log('— Server-derived values —');
  const parsed = publicOrderSchema.safeParse({
    ...GOOD,
    price: 1,
    quantity: 999,
    freeQuantity: 50,
    productId: 'hack',
    companyId: 'hack',
    status: 'CONFIRMED',
    moderatorId: 'hack',
  });
  ok('3a. payload with manipulation still validates', parsed.success);
  if (parsed.success) {
    const keys = Object.keys(parsed.data as Record<string, unknown>);
    ok('3b. price NOT in parsed output', !('price' in (parsed.data as Record<string, unknown>)));
    ok('3c. productId NOT in parsed output', !('productId' in (parsed.data as Record<string, unknown>)));
    ok('3d. quantity NOT in parsed output', !('quantity' in (parsed.data as Record<string, unknown>)));
    ok('3e. status NOT in parsed output', !('status' in (parsed.data as Record<string, unknown>)));
    ok('3f. companyId NOT in parsed output', !('companyId' in (parsed.data as Record<string, unknown>)));
  }

  // ─── Error mapping never leaks Zod internals ───
  console.log('— Error sanitization —');
  const bad = publicOrderSchema.safeParse({ full_name: '', phone: '', address: '', city: '' });
  if (!bad.success) {
    const fe = mapZodFieldErrors(bad.error);
    const values = JSON.stringify(fe);
    ok('4a. all messages are Arabic (no "Too small"/"Invalid"/"Expected")',
      !values.includes('Too small') && !values.includes('Invalid input') && !values.includes('Expected'));
    ok('4b. phone error is the Arabic message', fe.phone === 'يرجى إدخال رقم هاتف صحيح.');
    ok('4c. city error is the Arabic message', fe.city === 'يرجى اختيار المدينة.');
    ok('4d. name error is the Arabic message', fe.full_name === 'يرجى إدخال الاسم الكامل.');
    ok('4e. address error is the Arabic message', fe.address === 'يرجى إدخال العنوان.');
  } else {
    ok('4. empty payload should fail', false);
  }

  console.log(`\n══ RESULT: ${passed} passed, ${failed} failed ══\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).then(() => process.exit(0));