import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * THE RESET LINK IS A PASSWORD FOR ONE HOUR. IT IS NOT STORED.
 *
 * The threat this system is audited against is not an anonymous outsider —
 * it is somebody with a valid session, a copy of a backup, or an hour on a
 * departing employee's last day. A reset token kept in the clear in
 * `users.resetToken` hands every one of them account takeover for every
 * account with a pending reset: read the column, open the link, be that
 * person. No password needed and nothing in the audit trail but a normal
 * successful reset.
 *
 * So the row keeps a SHA-256 of the token and never the token. What is
 * mailed exists in exactly one place — the person's inbox — and the column
 * becomes useless to read.
 *
 * SHA-256 and not bcrypt, deliberately: bcrypt's work factor exists to
 * slow a search of the small space humans choose passwords from. This is
 * 32 bytes from the system's own random source, and there is nothing to
 * search. A fast hash is the right instrument, and it keeps the lookup a
 * single indexed comparison instead of one bcrypt per candidate row.
 */

/** The 32 random bytes that go in the link, and what the row stores. */
export function newResetToken(): { token: string; stored: string } {
  const token = randomBytes(32).toString('hex');
  return { token, stored: storedForm(token) };
}

/** What `users.resetToken` holds for a given link. */
export function storedForm(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Compare in constant time.
 *
 * Not because a timing attack on a 256-bit random value is realistic — it
 * is not — but because the next person to reach for this helper may hold
 * something guessable, and a comparison that leaks its answer by the
 * clock is a trap laid for them.
 */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
