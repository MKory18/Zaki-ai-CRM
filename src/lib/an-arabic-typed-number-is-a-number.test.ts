import { describe, expect, it, vi } from 'vitest';

/**
 * `\D` IS `[^0-9]`, SO A NUMBER TYPED IN ARABIC WAS DELETED, NOT MANGLED.
 *
 * The sweep that `97530a6` started measured two more sites and did not fix
 * them. This is the guard on both.
 *
 * ONE — `phone-rules.ts`. Every strip in that file was `/\D/g`, and `\D` in
 * JavaScript means «not an ASCII digit». No flag changes it: `/\D/u` and
 * `/\D/v` behave identically, so this is not a missing `u`, it is the
 * semantics of `\d` in this language. Measured:
 *
 *     '٠٩٩١٢٣٤٥٦٧'.replace(/\D/g, '')     →  ''
 *     '+٩٦٣ ٩٦٦ 793918'.replace(/\D/g,'')  →  '793918'
 *
 * The second line is the worse one: a number half-typed in each script came
 * out as a different, plausible, six-digit number. And the empty string from
 * the first went three places at once — a stored customer with no phone on a
 * cash-on-delivery system, a storefront telling a real visitor their real
 * number does not fit, and `activeBlock`'s `if (!phone) return null`, WHICH
 * SKIPPED THE BLACKLIST. `phone-rules.ts` says in its own words that «a
 * block that can be walked around by writing the number differently is not
 * a block»; writing it on an Arabic keypad walked around it.
 *
 * TWO — `order-parser.ts`. `parseInt(value, 10) || 1` and
 * `parseFloat(…) || null`, on a capture that CANNOT fail, so the only input
 * either fallback ever fired on was zero: «الكمية: 0» became an order for
 * one, and «السعر: 0» became no price at all.
 */

import { toLatinDigits } from './latin-digits';
import { canonicalPhone, isValidPhoneFor, nationalDigits } from './phone-rules';
import { parseOrderText } from './order-parser';

/* ───────────────────────────── the phone number ─────────────────────────── */

describe('a phone number typed on an Arabic keypad', () => {
  it('is a number, and the strip that stood here made it the empty string', () => {
    // The measurement, first, so the figures are facts and not a memory.
    expect('٠٩٩١٢٣٤٥٦٧'.replace(/\D/g, ''), 'الحشوُ القديم').toBe('');
    expect('٠٩٩١٢٣٤٥٦٧'.replace(/\D/gu, ''), 'والرايةُ u لا تُغيِّرُ شيئاً').toBe('');
    // And now.
    expect(canonicalPhone('٠٩٩١٢٣٤٥٦٧')).toBe('991234567');
  });

  it('and a number half-typed in each script is not a different number', () => {
    // '793918' — six digits of a real ten-digit number, and nothing said so.
    expect('+٩٦٣ ٩٦٦ 793918'.replace(/\D/g, ''), 'الحشوُ القديم').toBe('793918');
    expect(canonicalPhone('+٩٦٣ ٩٦٦ 793918')).toBe('966793918');
  });

  it('and the same person written either way is the same person', () => {
    // This is the whole purpose of a canonical form, and it was failing for
    // every customer who typed in the script this storefront is written for.
    expect(canonicalPhone('٠٩٦٦٧٩٣٩١٨')).toBe(canonicalPhone('0966793918'));
    expect(canonicalPhone('+٩٦٣٩٦٦٧٩٣٩١٨')).toBe(canonicalPhone('+963966793918'));
    expect(canonicalPhone('٠٠٩٦٣٩٦٦٧٩٣٩١٨')).toBe(canonicalPhone('00963966793918'));
    // And the figure itself, not just the agreement between two of them.
    expect(canonicalPhone('٠٩٦٦٧٩٣٩١٨')).toBe('966793918');
  });

  it('and the national form it reduces to is the one the rule matches', () => {
    expect(nationalDigits('٠٩٦٦٧٩٣٩١٨', '963')).toBe('966793918');
    expect(nationalDigits('٠٠٩٦٣٩٦٦٧٩٣٩١٨', '963')).toBe('966793918');
  });

  it('and the storefront accepts it instead of refusing a real customer', () => {
    expect(isValidPhoneFor('SY', '٠٩٦٦٧٩٣٩١٨'), 'رقمٌ سوريٌّ بأرقامٍ عربيّة').toBe(true);
    expect(isValidPhoneFor('JO', '٠٧٩٠١٢٣٤٥٦'), 'رقمٌ أردنيٌّ بأرقامٍ عربيّة').toBe(true);
    // And a wrong number is still wrong — the conversion is a change of
    // script, not a loosening of the rule.
    expect(isValidPhoneFor('SY', '٠٧٩٠١٢٣٤٥٦'), 'رقمٌ أردنيٌّ لمتجرٍ سوري').toBe(false);
    expect(isValidPhoneFor('SY', '٠٩٦٦٧٩٣٩'), 'أقصرُ من أن يكون رقماً').toBe(false);
    expect(isValidPhoneFor('SY', 'تسعمئة وستة'), 'كلامٌ لا رقم').toBe(false);
  });

  it('and it is converted through the ONE named place, not a class of its own', () => {
    // `toLatinDigits` maps a digit to a digit and touches nothing else, which
    // is why a phone number may pass through it: there is no notation to
    // guess at, unlike the comma in a money cell.
    expect(toLatinDigits('٠٩٦٦٧٩٣٩١٨')).toBe('0966793918');
    expect(toLatinDigits('SY-2026-0148')).toBe('SY-2026-0148');
  });
});

/**
 * AND THE BLACKLIST CANNOT BE WALKED AROUND BY CHANGING SCRIPT.
 *
 * `activeBlock` canonicalises and then does `if (!phone) return null`, so
 * the empty string was an early return — no query, no block, order accepted.
 * Asserted on the QUERY the blacklist actually sends, because asserting on
 * «a block was found» against a mock that answers everything proves nothing.
 */
describe('the blacklist, reached with an Arabic-typed number', () => {
  it('asks the database for the canonical number instead of returning early', async () => {
    const { activeBlock } = await import('./blacklist');
    const findFirst = vi.fn(async (args: { where: { phone: string } }) =>
      args.where.phone === '966793918'
        ? { id: 'b1', phone: '966793918', name: null, reason: 'ر', createdAt: new Date(), blockedById: 'u1' }
        : null
    );
    const tx = { customerBlock: { findFirst } };

    const hit = await activeBlock(tx as never, 'c1', '٠٩٦٦٧٩٣٩١٨');

    // THE QUERY FIRST: it was sent at all, and it carries the Latin form.
    expect(findFirst, 'لم يُسأَلِ السجلُّ أصلاً — الرجوعُ المبكِّرُ هو الثقب').toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ phone: '966793918', releasedAt: null });
    // And only then: the block is found, which it was not before.
    expect(hit?.phone).toBe('966793918');
  });
});

/* ──────────────────────── the pasted order message ──────────────────────── */

describe('a pasted order that says zero says zero', () => {
  const message = (q: string, p: string) =>
    ['الاسم: محمد', 'الرقم: 0966793918', 'المحافظة: دمشق', 'العنوان: المزة',
     'المنتج: كريم', `الكمية: ${q}`, `السعر: ${p}`].join('\n');

  it('a quantity of zero is zero, not the one the fallback invented', () => {
    // `|| 1` could only ever fire on zero: the capture is `/([0-9]+)/`, so
    // `parseInt` always returned a finite non-negative integer.
    expect(parseInt('0', 10) || 1, 'الاحتياطيُّ القديم').toBe(1);
    expect(parseOrderText(message('0', '20')).quantity, 'والآن').toBe(0);
    // And a real quantity is untouched.
    expect(parseOrderText(message('3', '20')).quantity).toBe(3);
  });

  it('and a price of zero is zero, not «no price was stated»', () => {
    expect(parseFloat('0') || null, 'الاحتياطيُّ القديم').toBeNull();
    expect(parseOrderText(message('1', '0')).price, 'والآن').toBe(0);
    expect(parseOrderText(message('1', '20')).price).toBe(20);
  });

  it('and a message that states neither still carries the declared defaults', () => {
    // Deleting the fallback did not delete the shape of an absent field: the
    // pattern simply does not match, and the initialiser stands.
    const parsed = parseOrderText('الاسم: محمد\nالرقم: 0966793918');
    expect(parsed.quantity).toBe(1);
    expect(parsed.price).toBeNull();
  });
});
