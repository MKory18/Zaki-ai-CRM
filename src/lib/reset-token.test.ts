import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newResetToken, sameToken, storedForm } from './reset-token';

/**
 * A RESET LINK IS A PASSWORD FOR AN HOUR.
 *
 * Kept in the clear, `users.resetToken` hands account takeover to anybody
 * who can read a row or a backup — the exact person this system is audited
 * against. These tests hold the two halves in step: what is mailed is not
 * what is stored, and both routes agree on which is which.
 */

const routeSource = (path: string) => readFileSync(join(process.cwd(), 'src', 'app', 'api', 'auth', path), 'utf8');

describe('the token that is sent and the value that is kept', () => {
  it('are not the same string', () => {
    const { token, stored } = newResetToken();
    expect(stored).not.toBe(token);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  it('and the stored one cannot be turned back into a link', () => {
    const { token, stored } = newResetToken();
    // The only relationship is one-way: hashing the link reproduces the
    // row, and nothing reproduces the link from the row.
    expect(storedForm(token)).toBe(stored);
    expect(stored).not.toContain(token.slice(0, 16));
  });

  it('is unguessable: 32 bytes from the system random source', () => {
    const seen = new Set(Array.from({ length: 50 }, () => newResetToken().token));
    expect(seen.size).toBe(50);
    expect([...seen][0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('compares without leaking the answer by the clock', () => {
    const { token, stored } = newResetToken();
    expect(sameToken(storedForm(token), stored)).toBe(true);
    expect(sameToken(storedForm('something else'), stored)).toBe(false);
    // Different lengths must answer false rather than throw: timingSafeEqual
    // refuses unequal buffers, and a 500 here is an oracle of its own.
    expect(sameToken('short', stored)).toBe(false);
  });
});

/**
 * THE TWO ROUTES ARE ONE MECHANISM, WRITTEN IN TWO FILES.
 *
 * If either side stops hashing, every reset link silently stops working —
 * or worse, starts being stored in the clear again while the tests above
 * still pass, because they never touch a route.
 */
describe('the routes that mint and spend it', () => {
  it('stores the hash, never the token that was sent', () => {
    const src = routeSource('forgot-password/route.ts');
    expect(src).toContain('newResetToken()');
    expect(src, 'كتب الرمزَ نفسَه في العمود').toMatch(/resetToken:\s*stored/);
    expect(src).not.toMatch(/resetToken:\s*token\b/);
  });

  it('looks the link up by its hash', () => {
    const src = routeSource('reset-password/route.ts');
    expect(src).toMatch(/resetToken:\s*storedForm\(token\)/);
    expect(src, 'بحث بالرمز المكشوف').not.toMatch(/resetToken:\s*token,/);
  });

  it('and still spends it once, with an expiry', () => {
    const src = routeSource('reset-password/route.ts');
    expect(src).toMatch(/resetTokenExpires:\s*\{\s*gt:\s*new Date\(\)\s*\}/);
    expect(src).toMatch(/resetToken:\s*null/);
    expect(src, 'لم تُبطَل الجلسات القائمة').toMatch(/tokenVersion:\s*\{\s*increment:\s*1\s*\}/);
  });

  it('and never writes it to a log in production', () => {
    const src = routeSource('forgot-password/route.ts');
    // The dev hint is allowed; what is not is a console line that runs
    // whatever NODE_ENV says.
    const logs = [...src.matchAll(/console\.log\([^)]*token[^)]*\)/gi)];
    for (const log of logs) {
      const before = src.slice(0, log.index);
      expect(before, 'سطرُ سجلٍّ يطبع الرمز بلا حارس').toMatch(/NODE_ENV !== 'production'[\s\S]*$/);
    }
  });
});
