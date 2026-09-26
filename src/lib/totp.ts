import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TIME-BASED ONE-TIME PASSWORDS — RFC 6238, BY HAND.
 *
 * Written rather than installed, for the same reason the courier statement
 * reader was: this is fifty lines of a frozen, published algorithm on a
 * security path, and the test below checks it against the RFC's OWN
 * published vectors. A dependency here would be fifty lines plus a supply
 * chain, and it could not be verified any more convincingly than this.
 *
 * SHA-1 is not a mistake. RFC 6238 allows SHA-256, and every authenticator
 * people actually have — Google Authenticator, Authy, 1Password — reads the
 * `algorithm` parameter unreliably or ignores it. A second factor nobody can
 * enrol is not a second factor. The security of TOTP does not rest on SHA-1's
 * collision resistance: it is an HMAC over a counter with a 30-second life
 * and a six-digit output, and the brute-force surface is handled by rate
 * limiting, not by the hash.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, no padding — the alphabet every authenticator expects. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, in the form an authenticator is given it. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Which 30-second step a moment falls in. */
export function stepAt(atMs: number): number {
  return Math.floor(atMs / 1000 / STEP_SECONDS);
}

/** The code for one step. Exported so the tests can use the RFC's vectors. */
export function codeForStep(secret: Buffer, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  // 8-byte big-endian. Written as two 32-bit halves because a JS number
  // cannot hold 64 bits — at 30-second steps the high half stays zero until
  // long after anything here matters, but writing it correctly costs a line.
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function currentCode(secretBase32: string, atMs: number): string {
  return codeForStep(base32Decode(secretBase32), stepAt(atMs));
}

/**
 * Check a code, and say WHICH step matched.
 *
 * The step is returned so the caller can refuse to accept the same one
 * twice. Without that, a code shoulder-surfed or read off a shared screen
 * stays usable for the rest of its thirty seconds — and a second factor that
 * can be replayed inside its own window is a weaker factor than it looks.
 *
 * One step either side: phone clocks drift, and a person who starts typing at
 * second 29 should not be told they are wrong.
 */
export function verifyCode(
  secretBase32: string,
  code: string,
  atMs: number,
  opts: { window?: number; notBeforeStep?: number | null } = {}
): { ok: boolean; step: number | null } {
  // Digits only, so a code pasted as «123 456» still works. There is no
  // length check here on purpose: the comparison below already requires the
  // two buffers to be the same size, so a separate one guards nothing — a
  // mutation run proved it by deleting it and changing no behaviour at all.
  const cleaned = code.replace(/\D/g, '');
  const secret = base32Decode(secretBase32);
  if (secret.length === 0) return { ok: false, step: null };

  const window = opts.window ?? 1;
  const now = stepAt(atMs);
  const given = Buffer.from(cleaned);

  for (let offset = -window; offset <= window; offset++) {
    const step = now + offset;
    // Already spent. Not a silent skip — a replayed code must not pass.
    if (opts.notBeforeStep != null && step <= opts.notBeforeStep) continue;
    const expected = Buffer.from(codeForStep(secret, step));
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return { ok: true, step };
    }
  }
  return { ok: false, step: null };
}

/**
 * The URI an authenticator scans.
 *
 * The issuer appears twice on purpose — once as a label prefix and once as a
 * parameter. Old apps read the prefix, current ones read the parameter, and
 * an entry that says only an email address is one nobody can tell apart from
 * their other six.
 */
export function otpauthUri(opts: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
