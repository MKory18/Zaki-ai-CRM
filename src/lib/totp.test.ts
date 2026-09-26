import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  codeForStep,
  currentCode,
  generateSecret,
  otpauthUri,
  stepAt,
  verifyCode,
} from './totp';

/**
 * CHECKED AGAINST THE RFC'S OWN NUMBERS.
 *
 * This algorithm was written by hand rather than installed, so the evidence
 * has to be better than «it seems to work with my phone». RFC 6238 publishes
 * test vectors — a fixed secret, fixed times, and the exact codes a correct
 * implementation must produce. If any line of the HMAC, the counter encoding
 * or the dynamic truncation is wrong, these fail.
 *
 * The RFC's SHA-1 secret is the ASCII string "12345678901234567890".
 */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('RFC 6238 test vectors', () => {
  const VECTORS: [seconds: number, eightDigits: string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  for (const [seconds, expected] of VECTORS) {
    it(`T=${seconds} produces ${expected}`, () => {
      const step = Math.floor(seconds / 30);
      expect(codeForStep(base32Decode(RFC_SECRET), step, 8)).toBe(expected);
      // And the six-digit form this product uses is its last six.
      expect(codeForStep(base32Decode(RFC_SECRET), step, 6)).toBe(expected.slice(-6));
    });
  }
});

describe('base32', () => {
  /** RFC 4648 §10, the vectors everyone checks against. */
  it('matches RFC 4648', () => {
    expect(base32Encode(Buffer.from('f'))).toBe('MY');
    expect(base32Encode(Buffer.from('fo'))).toBe('MZXQ');
    expect(base32Encode(Buffer.from('foo'))).toBe('MZXW6');
    expect(base32Encode(Buffer.from('foob'))).toBe('MZXW6YQ');
    expect(base32Encode(Buffer.from('fooba'))).toBe('MZXW6YTB');
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('round-trips any secret', () => {
    for (let i = 0; i < 20; i++) {
      const s = generateSecret();
      expect(base32Encode(base32Decode(s))).toBe(s);
    }
  });

  it('and a secret is 160 bits, as the RFC recommends', () => {
    expect(base32Decode(generateSecret())).toHaveLength(20);
  });
});

describe('verifying a code', () => {
  const secret = generateSecret();
  const at = 1_700_000_000_000;

  it('accepts the code of the moment', () => {
    expect(verifyCode(secret, currentCode(secret, at), at).ok).toBe(true);
  });

  /** Phone clocks drift, and typing takes seconds. */
  it('accepts one step either side', () => {
    expect(verifyCode(secret, currentCode(secret, at - 30_000), at).ok).toBe(true);
    expect(verifyCode(secret, currentCode(secret, at + 30_000), at).ok).toBe(true);
  });

  it('refuses two steps away', () => {
    expect(verifyCode(secret, currentCode(secret, at - 90_000), at).ok).toBe(false);
    expect(verifyCode(secret, currentCode(secret, at + 90_000), at).ok).toBe(false);
  });

  /**
   * THE SAME CODE NEVER PASSES TWICE.
   *
   * A code read off a shoulder or a shared screen stays valid for the rest of
   * its thirty seconds. A second factor that can be replayed inside its own
   * window is weaker than it looks, so the matched step is returned and the
   * caller refuses anything at or before the last one spent.
   */
  it('refuses a code that was already spent', () => {
    const code = currentCode(secret, at);
    const first = verifyCode(secret, code, at);
    expect(first.ok).toBe(true);
    expect(verifyCode(secret, code, at, { notBeforeStep: first.step }).ok).toBe(false);
  });

  it('and the step it returns is the one it matched', () => {
    expect(verifyCode(secret, currentCode(secret, at), at).step).toBe(stepAt(at));
    expect(verifyCode(secret, currentCode(secret, at - 30_000), at).step).toBe(stepAt(at) - 1);
  });

  it('refuses anything that is not six digits', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56']) {
      expect(verifyCode(secret, bad, at).ok, bad).toBe(false);
    }
  });

  it('refuses a wrong code', () => {
    const right = currentCode(secret, at);
    const wrong = String((Number(right) + 1) % 1_000_000).padStart(6, '0');
    expect(verifyCode(secret, wrong, at).ok).toBe(false);
  });

  it('and a different secret never opens the same code', () => {
    expect(verifyCode(generateSecret(), currentCode(secret, at), at).ok).toBe(false);
  });
});

describe('the URI an authenticator scans', () => {
  it('names the issuer twice — old apps read the label, new ones the parameter', () => {
    const uri = otpauthUri({ secret: 'ABCD', account: 'owner@example.com', issuer: 'Zaki AI OMS' });
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(decodeURIComponent(uri)).toContain('Zaki AI OMS:owner@example.com');
    expect(uri).toContain('issuer=Zaki+AI+OMS');
    expect(uri).toContain('secret=ABCD');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});
