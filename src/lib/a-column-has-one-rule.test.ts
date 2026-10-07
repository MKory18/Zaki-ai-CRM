import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMISSION_RATE_MAX, readCommissionRate } from './user-commission-rate';
import { readBasePrice } from './product-base-price';
import { numeric } from './numeric-input';

/**
 * ONE COLUMN, ONE RULE — AND THE DOORS MAY NOT BRING THEIR OWN.
 *
 * `User.commissionRate` had two doors. `/api/users` validated it and wrote
 * the column's own default; `/api/moderators` validated nothing and wrote
 * `parseFloat(commissionRate) || 5.0`, a number declared in no schema, no
 * migration and no other door. `Product.basePrice` had two doors as well,
 * both writing `parseFloat(basePrice) || 0`, so a typo priced a product at
 * nothing and answered 200.
 *
 * The rules are values now, in one file each. This test checks the reading
 * BEHAVIOUR and then checks that no door has quietly grown a second rule
 * next to the shared one — a fallback re-added at a write site is how the
 * first divergence happened, and it reads as policy while bypassing it.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE NO LONGER GUARDS WITH A LIST OF HOSTILE STRINGS
 *
 * It used to. The price rule was guarded by twelve named strings — `'abc'`,
 * `'3,5'`, `'12abc'`, `''`, `'   '`, `null`, `undefined`, `true`, `{}`,
 * `NaN`, `Infinity`, `-0.01` — and the rate rule by eleven. Both lists were
 * written by someone who had just measured `parseFloat`, so both named the
 * notations `parseFloat` mis-reads and neither named `'0x10'`.
 * `readBasePrice('0x10')` returned **16** for as long as those lists stood,
 * and nothing failed, because a list guards the notations its author
 * happened to think of. That is not a gap in the list. It is what a list is.
 *
 * So the notations are GENERATED here, three ways, and each one states its
 * own limits so that what it does not cover is visible rather than assumed:
 *
 *   1. EXHAUSTIVELY — every string of length 1…4 over a declared alphabet of
 *      the characters that mean something to `Number()`. 4 is the length of
 *      `'0x10'`, which is the point. This is the sweep that finds a notation
 *      nobody named: a prefix, a separator or a sign arrangement that
 *      `Number()` reads and the rule should not, can only hide here by being
 *      longer than four characters or by using a character outside the
 *      alphabet. Both limits are one line of code away from the reader.
 *   2. BY CROSS PRODUCT — sign × base prefix × digit alphabet × shape ×
 *      whitespace wrapper, for the notations too long for the sweep:
 *      `'Infinity'`, `'١٢٣'` (this product is Arabic-facing), `'2,500'`,
 *      `'1e400'`, a no-break space, a byte-order mark. Adding a notation
 *      means adding it to ONE family and getting it crossed with every
 *      other, rather than writing out N strings and forgetting the N+1st.
 *   3. BY VALUE KIND — the non-strings a JSON body can carry, each named for
 *      what `Number()` does with it rather than for what it is.
 *
 * And the law applied to all three is not «these strings are refused». It is
 * the DIFFERENCE between `Number()` and the rule, stated once:
 *
 *      a string is a price if and only if it is written the way a decimal
 *      number is written — and `Number()` agreeing is not enough.
 *
 * «written the way a decimal number is written» is decided by `isDecimal`
 * below, scanned character by character with no regular expression, so it
 * cannot be the same mistake twice as the regular expression in
 * `numeric-input.ts` that the rule actually uses. The two are independent
 * statements of one grammar; the sweep is where they are made to agree.
 */

/* ───────────────────────── the independent oracle ───────────────────────── */

/**
 * Written the way a decimal number is written: an optional sign, digits with
 * an optional decimal point, an optional decimal exponent, and nothing else.
 *
 * Hand-scanned on purpose. `numeric-input.ts` decides this with a regular
 * expression; if this function were a regular expression too, a mistake in
 * the character class would be made twice and the sweep would agree with
 * itself. `s[i] >= '0' && s[i] <= '9'` is ASCII by construction, which is
 * why `'١٢٣'` fails it — U+0660 is past U+0039.
 */
function isDecimal(s: string): boolean {
  let i = 0;
  if (s[i] === '+' || s[i] === '-') i++;
  let digits = 0;
  while (i < s.length && s[i]! >= '0' && s[i]! <= '9') {
    i++;
    digits++;
  }
  if (s[i] === '.') {
    i++;
    while (i < s.length && s[i]! >= '0' && s[i]! <= '9') {
      i++;
      digits++;
    }
  }
  if (digits === 0) return false;
  if (s[i] === 'e' || s[i] === 'E') {
    i++;
    if (s[i] === '+' || s[i] === '-') i++;
    let exponent = 0;
    while (i < s.length && s[i]! >= '0' && s[i]! <= '9') {
      i++;
      exponent++;
    }
    if (exponent === 0) return false;
  }
  return i === s.length;
}

/**
 * What `readBasePrice` must answer for a given input, derived from the rule
 * in words rather than from the implementation:
 *
 *   · a number is taken as it is, if it is finite and not negative;
 *   · a string is trimmed, must be written the way a decimal number is
 *     written, must not overflow to Infinity, and must not be negative;
 *   · everything else is a refusal.
 *
 * Zero is a price (`82ecac3`: a sample or a gift, and the column's own
 * default is `0.0`). A negative number is a typo with a minus in front.
 */
function priceShouldBe(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!isDecimal(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/* ───────────────── 1. the exhaustive sweep, length 1 … 4 ───────────────── */

/**
 * The characters that mean something to `Number()`: the digits that bound a
 * run, the two radix points a person might type, the exponent letters, the
 * three base-prefix letters in both cases, the signs, the two thousands
 * separators, a space, and one Arabic-Indic digit to carry the non-ASCII
 * case into the sweep. Sixteen characters, strings up to four long: every
 * notation expressible that way is tested, `'0x10'` among them.
 */
const SWEEP_ALPHABET = ['0', '1', '9', '.', ',', 'e', 'E', 'x', 'b', 'o', 'X', '+', '-', '_', ' ', '٠'];
const SWEEP_MAX_LENGTH = 4;

function sweep(): string[] {
  let level = [''];
  const all: string[] = [];
  for (let length = 1; length <= SWEEP_MAX_LENGTH; length++) {
    const next: string[] = [];
    for (const prefix of level) for (const ch of SWEEP_ALPHABET) next.push(prefix + ch);
    all.push(...next);
    level = next;
  }
  return all;
}

const SWEPT = sweep();

/* ──────────────── 2. the cross product, for the long forms ─────────────── */

/** A sign, or none. */
const SIGNS = { unsigned: '', plus: '+', minus: '-' };

/** The base prefixes `Number()` honours — and the absence of one. */
const BASES = {
  decimal: '',
  'hex lower': '0x',
  'hex upper': '0X',
  'binary lower': '0b',
  'binary upper': '0B',
  'octal lower': '0o',
  'octal upper': '0O',
};

/**
 * The digit alphabets a keyboard in this product's market can produce. The
 * Arabic-Indic set is the one that matters: this is an Arabic-facing system
 * and `١٢٣` is what an Arabic keypad in some layouts actually emits.
 */
const ALPHABETS = {
  ascii: '0123456789',
  'arabic-indic': '٠١٢٣٤٥٦٧٨٩',
  'extended arabic-indic': '۰۱۲۳۴۵۶۷۸۹',
  devanagari: '०१२३४५६७८९',
  fullwidth: '０１２３４５６７８９',
};

/** How the digits are arranged, written in ASCII and then transliterated. */
const SHAPES = {
  whole: '17',
  zero: '0',
  'leading zeros': '017',
  fraction: '12.5',
  'leading point': '.5',
  'trailing point': '5.',
  exponent: '1e3',
  'exponent upper': '1E3',
  'exponent signed': '1e+3',
  'exponent negative': '1e-3',
  'exponent overflowing to Infinity': '1e400',
  'exponent large but finite': '1e308',
  'thousands comma': '2,500',
  'thousands space': '2 500',
  'numeric separator': '1_000',
  'two decimal points': '1.2.3',
  'trailing letters': '12abc',
  percent: '15%',
  currency: '12$',
  'the word Infinity': 'Infinity',
  'the word infinity lowercased': 'infinity',
  'the word NaN': 'NaN',
  'nothing at all': '',
};

/**
 * Whitespace forms. `String.prototype.trim` strips every one of these — the
 * no-break space and the byte-order mark included — so they are expected to
 * be harmless, and that expectation is measured below rather than assumed.
 */
const WRAPPERS = {
  bare: (t: string) => t,
  'ascii spaces': (t: string) => ` ${t} `,
  'tab, newline, carriage return': (t: string) => `\t\n ${t} \r\n`,
  'no-break space': (t: string) => ` ${t} `,
  'ideographic space': (t: string) => `　${t}`,
  'byte-order mark': (t: string) => `﻿${t}`,
};

const ASCII_DIGITS = ALPHABETS.ascii;

/** The shape, written in another alphabet's digits. */
function transliterate(shape: string, alphabet: string): string {
  let out = '';
  for (const ch of shape) {
    const d = ASCII_DIGITS.indexOf(ch);
    out += d === -1 ? ch : alphabet[d];
  }
  return out;
}

type Notation = { readonly name: string; readonly value: string };

function crossProduct(): Notation[] {
  const out: Notation[] = [];
  for (const [signName, sign] of Object.entries(SIGNS))
    for (const [baseName, base] of Object.entries(BASES))
      for (const [alphabetName, alphabet] of Object.entries(ALPHABETS))
        for (const [shapeName, shape] of Object.entries(SHAPES))
          for (const [wrapperName, wrap] of Object.entries(WRAPPERS))
            out.push({
              name: `${signName} / ${baseName} / ${alphabetName} / ${shapeName} / ${wrapperName}`,
              value: wrap(sign + base + transliterate(shape, alphabet)),
            });
  return out;
}

const CROSSED = crossProduct();

/* ───────────────────── 3. the value kinds a body carries ──────────────── */

const VALUE_KINDS: ReadonlyArray<readonly [string, unknown]> = [
  ['absent', undefined],
  ['null — Number() reads it as 0', null],
  ['true — Number() reads it as 1', true],
  ['false — Number() reads it as 0', false],
  ['empty array — Number() reads it as 0', []],
  ["array of one numeric string — Number(['5']) is 5", ['5']],
  ['array of one number', [5]],
  ['array of two numbers', [1, 2]],
  ['plain object', {}],
  ['object with a valueOf — Number() calls it', { valueOf: () => 7 }],
  ['object whose toString is a hex literal', { toString: () => '0x10' }],
  ['a Date — Number() reads its epoch milliseconds', new Date(0)],
  ['a bigint — Number() converts it', BigInt(7)],
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
  ['a negative price', -0.01],
  ['a typed zero', 0],
  ['a typed price', 12.5],
  ['the largest finite double', Number.MAX_VALUE],
];

/* ──────────────────────────── the laws ─────────────────────────────────── */

describe('the price a person types is the price that is read', () => {
  it('reads a typed zero as zero — a sample has a real price', () => {
    expect(readBasePrice(0)).toBe(0);
    expect(readBasePrice('0')).toBe(0);
  });

  it('reads the number that was typed, from a number or from a form string', () => {
    expect(readBasePrice(12.5)).toBe(12.5);
    expect(readBasePrice(' 12.5 ')).toBe(12.5);
  });

  /**
   * THE DEFECT THIS FILE WAS REWRITTEN FOR, named once so the number is on
   * the record: these are the values `Number()` really answers, measured —
   * not remembered. If a JavaScript engine ever stops reading base prefixes
   * this test says so, and the reasoning in `product-base-price.ts` can be
   * revisited instead of being inherited.
   */
  it('Number() reads base prefixes as figures — and the price rule must not', () => {
    expect(Number('0x10')).toBe(16);
    expect(Number('0b11')).toBe(3);
    expect(Number('0o17')).toBe(15);
    expect(Number('0X10')).toBe(16);

    expect(readBasePrice('0x10'), '0x10 would be stored as 16').toBeNull();
    expect(readBasePrice('0b11'), '0b11 would be stored as 3').toBeNull();
    expect(readBasePrice('0o17'), '0o17 would be stored as 15').toBeNull();
    expect(readBasePrice('0X10'), '0X10 would be stored as 16').toBeNull();
  });

  /**
   * THE LAW, over every string of length 1…4 over the declared alphabet.
   * Not «these are refused»: the reader and an independently written grammar
   * must answer the same thing for all of them.
   */
  it(`agrees with the grammar for all ${SWEPT.length} strings of length 1…${SWEEP_MAX_LENGTH}`, () => {
    const wrong: string[] = [];
    for (const value of SWEPT) {
      const got = readBasePrice(value);
      const want = priceShouldBe(value);
      if (!Object.is(got, want)) {
        wrong.push(`${JSON.stringify(value)} → ${String(got)}, should be ${String(want)}`);
      }
    }
    expect(wrong.slice(0, 20), `${wrong.length} of ${SWEPT.length} swept strings read wrongly`).toEqual([]);
  });

  it(`agrees with the grammar for all ${CROSSED.length} notations in the cross product`, () => {
    const wrong: string[] = [];
    for (const { name, value } of CROSSED) {
      const got = readBasePrice(value);
      const want = priceShouldBe(value);
      if (!Object.is(got, want)) {
        wrong.push(`${name}: ${JSON.stringify(value)} → ${String(got)}, should be ${String(want)}`);
      }
    }
    expect(wrong.slice(0, 20), `${wrong.length} of ${CROSSED.length} notations read wrongly`).toEqual([]);
  });

  it('agrees with the grammar for every value kind a JSON body can carry', () => {
    for (const [name, value] of VALUE_KINDS) {
      expect(readBasePrice(value), `${name}: ${String(Number(value as never))} from Number()`).toBe(
        priceShouldBe(value)
      );
    }
  });

  /**
   * BOTH GENERATORS MUST BITE — SEPARATELY.
   *
   * A generator that happens to produce nothing dangerous is a vacuous guard
   * with more lines, and an aggregate count hides one generator going quiet
   * behind the other still working. So the hazard is counted per generator:
   * the strings `Number()` turns into a figure while the grammar refuses
   * them — the `'0x10'` → 16 class.
   *
   * MEASURED when this was written: 128 from the sweep and 144 from the
   * cross product, 272 in all. The floors are set at 50 each, low enough
   * that a harmless change to an alphabet does not fail and high enough that
   * gutting either generator does. Both were measured by gutting them.
   */
  const misreadBy = (values: readonly string[]) =>
    values.filter((value) => {
      const trimmed = value.trim();
      return trimmed !== '' && !isDecimal(trimmed) && Number.isFinite(Number(trimmed));
    });

  it('both generators really do contain the hazard, and name it', () => {
    const fromSweep = misreadBy(SWEPT);
    const fromCross = misreadBy(CROSSED.map((n) => n.value));

    expect(fromSweep.length, 'the exhaustive sweep produced nothing Number() mis-reads').toBeGreaterThan(50);
    expect(fromCross.length, 'the cross product produced nothing Number() mis-reads').toBeGreaterThan(50);

    // Named witnesses, each one checked against the generator that can
    // actually produce it: `'0o17'` needs a 7, which the sweep alphabet does
    // not carry, and `'0x10'` is four characters, which is the sweep's limit.
    for (const witness of ['0x10', '0b11', '0o11']) {
      expect(fromSweep, `${witness} is not in the swept corpus`).toContain(witness);
    }
    for (const witness of ['0x17', '0X17', '0o17', '0O17']) {
      expect(fromCross, `${witness} is not in the cross product`).toContain(witness);
    }

    // And not one of them may be read as a price.
    const accepted = [...fromSweep, ...fromCross].filter((value) => readBasePrice(value) !== null);
    expect(accepted.slice(0, 20), `${accepted.length} mis-readable notations were accepted`).toEqual([]);
  });

  /**
   * WHAT THIS GUARD DOES NOT COVER, stated rather than left to be found:
   *
   *   · strings longer than four characters that are not in a cross-product
   *     family — a notation needs a family here to be swept;
   *   · characters outside `SWEEP_ALPHABET` and the five digit alphabets;
   *   · THE ABSENCE OF A CEILING. `'1e308'` is a plain decimal, is finite,
   *     is not negative, and is therefore STORED — a product priced at
   *     1e308. `Product.basePrice` declares no maximum, and the two money
   *     doors in this repository that do (`finance`, `campaigns`) declare
   *     one in the door rather than in the column. That is a policy decision
   *     and not this file's to make, so it is asserted as the CURRENT
   *     behaviour, not as the right one: when a ceiling is chosen, this test
   *     fails and says where to put it.
   */
  it('has no ceiling — the current behaviour, recorded so that changing it is deliberate', () => {
    expect(readBasePrice('1e308')).toBe(1e308);
    expect(readBasePrice(Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
    // The overflow above it is refused, which is the only bound there is.
    expect(readBasePrice('1e400')).toBeNull();
  });

  /**
   * THE DEPENDENCY, PINNED. `readBasePrice` no longer checks finiteness
   * itself: `numeric()` does it, through zod 4's `z.number()`, which is
   * finite. A re-added `Number.isFinite` there would be a guard that cannot
   * fire — and ten of those have been caught in this audit. This is the
   * assertion that takes its place.
   */
  it('the shared strict reader refuses what overflows, which the price rule relies on', () => {
    const strict = numeric();
    expect(strict.safeParse('1e400').success, "numeric() accepted '1e400'").toBe(false);
    expect(strict.safeParse(Infinity).success, 'numeric() accepted Infinity').toBe(false);
    expect(strict.safeParse(-Infinity).success, 'numeric() accepted -Infinity').toBe(false);
    expect(strict.safeParse(NaN).success, 'numeric() accepted NaN').toBe(false);
    expect(strict.safeParse('0x10').success, "numeric() accepted '0x10'").toBe(false);
  });

  /** Whitespace is trimmed, and which whitespace is measured, not assumed. */
  it('trims every whitespace form a form or a paste can carry', () => {
    expect(readBasePrice(' 250.5 ')).toBe(250.5);
    expect(readBasePrice('\t\n 7 \r\n')).toBe(7);
    expect(readBasePrice(' 7 ')).toBe(7);
    expect(readBasePrice('　7')).toBe(7);
    expect(readBasePrice('﻿7')).toBe(7);
    // …and whitespace alone is not a zero, which is what `Number('  ')` is.
    expect(Number('  ')).toBe(0);
    expect(readBasePrice('  ')).toBeNull();
    expect(readBasePrice('')).toBeNull();
  });
});

describe('the rate a person types is the rate that is read', () => {
  it('reads a typed zero as zero, not as nothing', () => {
    expect(readCommissionRate(0)).toBe(0);
  });

  it('reads an absent rate as the column default', () => {
    expect(readCommissionRate(undefined)).toBe(0);
  });

  it('reads the number that was typed', () => {
    expect(readCommissionRate(7.5)).toBe(7.5);
    expect(readCommissionRate(COMMISSION_RATE_MAX)).toBe(COMMISSION_RATE_MAX);
  });

  /**
   * The rate rule takes NO string — `commissionRateField` is `z.number()`
   * with no coercion, deliberately (`82ecac3`: a door that accepts `"5"`
   * also accepts `"5%"` and `"٥"` and has to guess). So the whole generated
   * corpus is one assertion here, and `'0x10'` cannot reach this column by
   * any notation. Swept rather than listed for the same reason as above: the
   * eleven-string list this replaced did not name `'0x10'` either.
   */
  it('refuses every string notation, whatever it is written in', () => {
    const accepted = [...SWEPT, ...CROSSED.map((n) => n.value)].filter(
      (value) => readCommissionRate(value) !== null
    );
    expect(accepted.slice(0, 20), `${accepted.length} string notations were read as a rate`).toEqual([]);
  });

  it('refuses a number outside the declared range, and every non-number', () => {
    for (const [name, value] of VALUE_KINDS) {
      const want =
        value === undefined
          ? 0
          : typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= COMMISSION_RATE_MAX
            ? value
            : null;
      expect(readCommissionRate(value), `rate from ${name}`).toBe(want);
    }
    expect(readCommissionRate(COMMISSION_RATE_MAX + 1)).toBeNull();
    expect(readCommissionRate(-1)).toBeNull();
  });
});

/**
 * COMMENTS BLANKED, so a docblock NAMING the old defect is not read as the
 * defect. Both doors explain what they used to write, in the words the
 * sweep below looks for.
 */
const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const RATE_DOORS = ['src/app/api/users/route.ts', 'src/app/api/moderators/route.ts'];
const PRICE_DOORS = ['src/app/api/products/route.ts', 'src/app/api/products/[id]/route.ts'];

describe('no door carries a second rule for a column it shares', () => {
  it('neither rate door declares a rate of its own', () => {
    for (const door of RATE_DOORS) {
      const src = read(door);
      expect(src, `${door}: لا يستورد قاعدة النسبة المشتركة`).toContain('@/lib/user-commission-rate');
      // The 5.0 nobody declared, and the `||` that let a typed zero become it.
      expect(src, `${door}: نسبة مكتوبة في الباب`).not.toMatch(/commissionRate[^\n]*\|\|/);
      expect(src.match(/commissionRate:\s*parseFloat/), `${door}: parseFloat على النسبة`).toBeNull();
    }
  });

  it('neither price door declares a price rule of its own', () => {
    for (const door of PRICE_DOORS) {
      const src = read(door);
      expect(src, `${door}: لا يستورد قارئ السعر المشترك`).toContain('@/lib/product-base-price');
      expect(src.match(/parseFloat\(basePrice\)/), `${door}: parseFloat على السعر`).toBeNull();
      expect(src, `${door}: سعر بـfallback`).not.toMatch(/basePrice[^\n]*\|\|\s*0/);
    }
  });

  /**
   * And the shared reader may not grow a notation of its own either: the
   * whole point of the rewrite is that `product-base-price.ts` decides the
   * BOUND and `numeric-input.ts` decides the NOTATION. A `Number(` or a
   * `parseFloat(` reappearing in the reader is the twelfth variant starting.
   */
  it('the price reader borrows the notation instead of deciding one', () => {
    const src = read('src/lib/product-base-price.ts');
    expect(src, 'product-base-price.ts: لا يستورد القارئ الصارم').toContain('./numeric-input');
    expect(src.match(/parseFloat\(/), 'product-base-price.ts: parseFloat').toBeNull();
    expect(src.match(/\bNumber\(/), 'product-base-price.ts: Number() بيدها').toBeNull();
  });
});
