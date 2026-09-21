import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  encryptSecret, decryptSecret, encryptJson, decryptJson,
  encryptionAvailable, secretHint,
} from './secrets';

/**
 * A courier password cannot be hashed — we have to send it to them on every
 * call — so it is encrypted instead, and the key lives only in the
 * environment. That buys one specific thing: a stolen database dump is not a
 * stolen account.
 *
 * The ways that promise breaks are all here. Storing plaintext because no key
 * was configured. Returning a readable value from a blob. Taking the whole
 * screen down when a key is rotated without re-encrypting.
 */

const KEY = 'a'.repeat(64);
const original = process.env.APP_ENCRYPTION_KEY;

beforeEach(() => { process.env.APP_ENCRYPTION_KEY = KEY; });
afterEach(() => {
  if (original === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = original;
});

describe('encrypting a secret', () => {
  it('comes back exactly as it went in', () => {
    const secret = 'p@ssw0rd-مع-عربي';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('never leaves the plaintext visible in the blob', () => {
    const blob = encryptSecret('H1234567');
    expect(blob).not.toContain('H1234567');
    expect(Buffer.from(blob).toString('base64')).not.toContain('H1234567');
  });

  it('produces a different blob every time, so two equal passwords do not look equal', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('refuses a blob that was tampered with, rather than returning garbage', () => {
    const blob = encryptSecret('secret');
    const parts = blob.split(':');
    parts[3] = parts[3].replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('refuses a blob from another key', () => {
    const blob = encryptSecret('secret');
    process.env.APP_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(() => decryptSecret(blob)).toThrow();
  });
});

describe('with no key configured', () => {
  beforeEach(() => { delete process.env.APP_ENCRYPTION_KEY; delete process.env.WHATSAPP_ENCRYPTION_KEY; });

  it('throws instead of storing plaintext', () => {
    // A visible failure beats an invisible one: a secret written in the
    // clear is worse than a save that refused.
    expect(() => encryptSecret('secret')).toThrow('ENCRYPTION_KEY_MISSING');
  });

  it('says so, so a screen can warn before the save fails', () => {
    expect(encryptionAvailable()).toBe(false);
  });

  it('refuses a short key too — 16 characters is not a key', () => {
    process.env.APP_ENCRYPTION_KEY = 'short';
    expect(encryptionAvailable()).toBe(false);
  });
});

describe('a bag of credentials', () => {
  const account = { email: 'a@b.co', password: 'p', companyId: 744, originCityId: 12 };

  it('round-trips as one value, so a half-saved account cannot exist', () => {
    expect(decryptJson(encryptJson(account))).toEqual(account);
  });

  it('returns null rather than throwing when the blob will not open', () => {
    // A rotated key must leave the courier manual, not take the shipping
    // screen down with it.
    expect(decryptJson('v1:00:00:00')).toBeNull();
    expect(decryptJson('not-a-blob')).toBeNull();
    expect(decryptJson(null)).toBeNull();
  });
});

describe('what a screen may see', () => {
  it('shows only the tail, enough to tell two accounts apart', () => {
    expect(secretHint('user@company.com')).toBe('••••com');
    expect(secretHint('H1234567')).toBe('••••567');
  });

  it('hides a short value completely rather than mostly', () => {
    expect(secretHint('abcd')).toBe('••••');
  });

  it('is nothing when there is nothing', () => {
    expect(secretHint(null)).toBeNull();
    expect(secretHint('')).toBeNull();
  });
});
