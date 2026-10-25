import { describe, expect, it } from 'vitest';
import { buildPublicOrderSchema } from './landing-order-schema';
import { canonicalPhone, isValidPhoneFor, phoneErrorFor } from './phone-rules';
import { formatPhoneNumber } from './phone';
import { waNumber } from './message-templates';

/**
 * «زبون بالشمال السوري بخط تركي… لازم يقبل» · «هاي ارقام دول ثانية عادي» · «صح اللاندنج لازم تقبل ارقام».
 *
 * A Syrian store takes a foreign number beside the Syrian ones — on the landing page, the order screen and every import —
 * and the number keeps its own country code everywhere it is used: storage, the screen, the WhatsApp link.
 * Invented numbers.
 */

const TURKISH = ['+90 532 123 45 67', '905321234567', '00905321234567', '5321234567'];
const OTHER = ['+639171234567', '63917123456', '+491711234567'];

describe('a Syrian store', () => {
  it('takes a Turkish line in every written form, and a number of another country', () => {
    for (const p of [...TURKISH, ...OTHER]) expect(isValidPhoneFor('SY', p), p).toBe(true);
  });

  it('still takes every Syrian form it took before', () => {
    for (const p of ['0932545678', '932545678', '+963932545678', '00963932545678', '0212345678']) {
      expect(isValidPhoneFor('SY', p), p).toBe(true);
    }
  });

  it('NEGATIVE: a stub, a Syrian mobile with one digit too many, and a Syrian code with a wrong body are still refused', () => {
    for (const p of ['94123456', '09912345678', '9912345678', '96399123456', '0790123456', 'abc', '093254567812345678']) {
      expect(isValidPhoneFor('SY', p), p).toBe(false);
    }
  });

  it('the landing form takes it — the order is not refused at the door', () => {
    const schema = buildPublicOrderSchema({ countryCode: 'SY', regions: ['حلب'] });
    const order = { full_name: 'زبون', phone: '+90 532 123 45 67', address: 'شارع 5', city: 'حلب', offerId: '1234567890abcd', notes: '', website: '', ts: '' };
    expect(schema.safeParse(order).success).toBe(true);
  });

  it('and tells a visitor whose number fits neither that a full international number is welcome', () => {
    expect(phoneErrorFor('SY')).toContain('سوري');
    expect(phoneErrorFor('SY')).toContain('دولي');
  });
});

describe('every other country is unchanged', () => {
  it('NEGATIVE: a Jordanian store still refuses a Turkish line', () => {
    for (const p of TURKISH) expect(isValidPhoneFor('JO', p), p).toBe(false);
    expect(phoneErrorFor('JO')).not.toContain('دولي');
  });
});

describe('the number keeps its own country code', () => {
  it('is one customer however the Turkish line was written', () => {
    expect(canonicalPhone('+90 532 123 45 67')).toBe(canonicalPhone('905321234567'));
    expect(canonicalPhone('00905321234567')).toBe('905321234567');
  });

  it('reads with its own code on the screen, not behind a Syrian zero', () => {
    expect(formatPhoneNumber('905321234567', 'SY')).toBe('+905321234567');
    expect(formatPhoneNumber('966793918', 'SY')).toBe('0966793918');
  });

  it('opens WhatsApp on the Turkish number — not «963905…»', () => {
    expect(waNumber('905321234567', '963')).toBe('905321234567');
    expect(waNumber('00905321234567', '963')).toBe('905321234567');
    expect(waNumber('0966793918', '963')).toBe('963966793918');
    expect(waNumber('966793918', '963')).toBe('963966793918');
  });
});
