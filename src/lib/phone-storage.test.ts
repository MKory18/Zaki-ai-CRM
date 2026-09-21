import { describe, expect, it } from 'vitest';
import { normalizePhoneNumber, formatPhoneNumber } from './phone';
import { canonicalPhone } from './phone-rules';

/**
 * One number, one stored form.
 *
 * Customers were stored by an Egypt-specific normaliser that knew +20 and
 * the 010/011/012/015 mobile heads and nothing else, while the blacklist
 * matched on canonicalPhone, which knows Syria, Jordan, Saudi Arabia, the
 * Emirates and Iraq. Two functions, two answers, one number.
 *
 * The live data carried the proof: the same man existed twice, once as
 * 0966793918 and once as 963966793918. And a blocked number was looked for
 * in a shape the customer table never wrote, so it could walk through.
 */

describe('the system stores a phone number one way', () => {
  it('writes the same customer the same way however they typed it', () => {
    // The real duplicate that this fixed.
    expect(normalizePhoneNumber('+963966793918')).toBe(normalizePhoneNumber('0966793918'));
  });

  it('agrees with the blacklist, always', () => {
    for (const raw of [
      '+963932374769', '0932374769', '00963932374769',
      '+962790123456', '0790123456',
      '+966501234567', '0501234567',
      '  0944 555 666 ', '+9 6 3 9 4 4 5 5 5 6 6 6',
    ]) {
      expect(normalizePhoneNumber(raw), raw).toBe(canonicalPhone(raw));
    }
  });

  it('keeps a local number local rather than reading a country into it', () => {
    // A Syrian 0966… is not a Saudi +966…: only an explicit + or 00 licenses
    // the dial code to be stripped.
    expect(normalizePhoneNumber('0966793918')).toBe('966793918');
    expect(normalizePhoneNumber('+966793918123')).not.toBe('966793918123');
  });

  it('is stable — normalising twice changes nothing', () => {
    for (const raw of ['+963932374769', '0790123456', '00963944555666']) {
      const once = normalizePhoneNumber(raw);
      expect(normalizePhoneNumber(once)).toBe(once);
    }
  });

  it('gives nothing back for nothing', () => {
    expect(normalizePhoneNumber('')).toBe('');
    expect(normalizePhoneNumber('   ')).toBe('');
    expect(normalizePhoneNumber('لا رقم')).toBe('');
  });

  it('shows a number back the way a person writes it', () => {
    expect(formatPhoneNumber('+963932374769', 'SY')).toBe('0932374769');
    expect(formatPhoneNumber('0932374769', 'SY')).toBe('0932374769');
  });

  it('leaves a number alone when it does not know the country', () => {
    // Dressing it in a trunk zero that may not belong to it would be a guess
    // presented as a fact.
    expect(formatPhoneNumber('+963932374769', null)).toBe('+963932374769');
    expect(formatPhoneNumber('12345', 'ZZ')).toBe('12345');
  });
});
