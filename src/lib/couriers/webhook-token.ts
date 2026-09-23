import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * THE TOKEN THAT IS THE COURIER'S WEBHOOK URL.
 *
 * A courier's dashboard usually accepts one thing: a URL. It cannot be asked
 * to send a custom header or sign a body. So the secret has to travel in the
 * URL itself — which makes the URL a key, and it is treated like one:
 *
 *   - It is stored as a SHA-256 hash, never in the clear. A stolen database
 *     dump yields no working URL.
 *   - It is shown to the person once, at the moment it is generated. If they
 *     lose it they generate a new one and re-send it; the old one dies.
 *   - It goes in the PATH, not the query string. Query strings end up in
 *     access logs, referrer headers and analytics in a way paths often do
 *     not, and this one is a credential.
 *
 * 32 random bytes, base64url: no padding, no characters a courier's form
 * will mangle, and far past guessing.
 */

export function generateWebhookToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashWebhookToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Compare two hashes without leaking, through timing, how much of one
 * matched. Both are hex of the same length, so a length difference is
 * simply a mismatch.
 */
export function tokenHashEquals(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The full URL to hand the courier. Built where the origin is known. */
export function webhookUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/api/webhooks/couriers/${token}`;
}
