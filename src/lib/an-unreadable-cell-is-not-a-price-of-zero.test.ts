import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { count, money, readTypedFigure } from './numeric-input';
import { isImportable, parseOrderSheet, type ParsedRow } from './order-import';

/**
 * A CELL NOBODY CAN READ IS NOT A PRICE OF ZERO.
 *
 * The order importer read a price as
 *
 *     Number(String(rawPrice).replace(/[^\d.-]/g, ''))
 *
 * and the STRIP is the defect, not the `Number`. A character class of the
 * things it recognises, with every other character deleted, does not refuse
 * a cell — it produces a different number from the one in the sheet, and
 * whatever is left of the string then passes the finiteness check beneath
 * it. Measured against the file at `1774a43`, verbatim:
 *
 *     '١٢'     -> price 0         qty NaN
 *     '٣٥٠٠'   -> price 0         qty NaN
 *     '3,5'    -> price 35        qty NaN
 *     '1e400'  -> price 1400      qty Infinity
 *     '0x10'   -> price 10        qty 16
 *     '12abc'  -> price 12        qty NaN
 *     '25.5'   -> price 25.5      qty 25.5
 *
 * «٣٥٠٠» is three thousand five hundred typed on an Arabic keypad, in a
 * product whose operators type Arabic and whose screens are Arabic, and it
 * imported as a FREE ORDER. «3,5» imported at ten times the price. «0x10»
 * imported as sixteen units and was not even reported.
 *
 * AND THE STRICT CREATE DOOR CANNOT SEE ANY OF IT. `ImportOrdersDialog`
 * posts the figures THIS FILE produced to `POST /api/orders`, so by the
 * time the door's reader runs the number is clean and well-formed and there
 * is nothing left to refuse. The mis-reading happens before the request
 * exists. `an-import-row-reaches-the-door.test.ts` drives that whole path
 * and asserts the row Prisma is handed.
 */

/**
 * A CSV, with a cell carrying a comma quoted the way Excel writes it.
 *
 * The first draft of this file joined cells with a bare comma, so «3,5» —
 * the very cell this whole test is about — arrived at the parser as TWO
 * cells and the price read as 3. The test passed its own assertion for the
 * wrong reason. A decimal comma only ever reaches a parser quoted, and that
 * is how it is written here.
 */
const sheet = (rows: string[][]) =>
  rows.map((r) => r.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',')).join('\n');
const HEAD = ['الاسم', 'الهاتف', 'العنوان', 'المنتج', 'الكمية', 'السعر'];

const row = (qty: string, price: string): ParsedRow => {
  const out = parseOrderSheet(sheet([HEAD, ['أحمد', '0999123456', 'حمص', 'كريم', qty, price]]));
  expect(out.rows, 'الصفّ لم يُقرأ أصلاً').toHaveLength(1);
  return out.rows[0];
};
const kinds = (r: ParsedRow) => r.problems.map((x) => x.kind);
const said = (r: ParsedRow, field: string) => r.problems.find((x) => x.field === field)?.ar ?? '';

/* ───────────── the reader that was there, so the figures stay real ─────── */

/**
 * THE DELETED READER, IN ONE FIXTURE.
 *
 * Without this the table above is a recollection; with it, every figure in
 * it is computed here from the code that produced it, so a reader can check
 * the claim rather than believe it. And the PAIR of assertions on each line
 * — what the old reader did, what the new one does — is what keeps these
 * tests from passing on a file where nothing was ever wrong.
 */
const asItWas = {
  price: (raw: string) => {
    const p = raw ? Number(String(raw).replace(/[^\d.-]/g, '')) : null;
    return p !== null && Number.isFinite(p) && p >= 0 ? p : 'REFUSED';
  },
  qty: (raw: string) => {
    const q = raw ? Number(raw) : 1;
    return Number.isInteger(q) && q >= 1 ? q : 'REFUSED';
  },
};

describe('the strip did not refuse — it rewrote, and the rewrite was imported', () => {
  it('an Arabic-Indic price was a price of zero, and is now the figure it says', () => {
    expect(asItWas.price('٣٥٠٠'), 'الحشوُ لم يَكُن صفراً').toBe(0);
    expect(row('1', '٣٥٠٠').sellingPrice).toBe(3500);
    expect(kinds(row('1', '٣٥٠٠'))).toEqual([]);
  });

  it('and a two-digit Arabic price was zero as well', () => {
    expect(asItWas.price('١٢')).toBe(0);
    expect(row('1', '١٢').sellingPrice).toBe(12);
  });

  it('a decimal comma was ten times the price, and is now refused by name', () => {
    expect(asItWas.price('3,5')).toBe(35);
    const r = row('1', '3,5');
    expect(r.sellingPrice).toBeNull();
    expect(kinds(r)).toContain('BAD_PRICE');
    expect(said(r, 'sellingPrice'), 'الخليّةُ لم تُقتبَس في السبب').toContain('3,5');
  });

  /**
   * REFUSED RATHER THAN READ AS 3.5 — and the reason is in the cell, not in
   * the reader. «3,500» is three thousand five hundred to one half of the
   * world and three and a half to the other, written identically. A parser
   * that picks one is right half the time and silent both times.
   */
  it('and a thousands separator is refused for the same reason, not guessed', () => {
    expect(asItWas.price('3,500'), 'الحشوُ قرأها ثلاثةَ آلافٍ وخمسَ مئة').toBe(3500);
    expect(row('1', '3,500').sellingPrice).toBeNull();
    expect(kinds(row('1', '3,500'))).toContain('BAD_PRICE');
  });

  it('scientific notation became 1400, and is now refused', () => {
    expect(asItWas.price('1e400')).toBe(1400);
    expect(row('1', '1e400').sellingPrice).toBeNull();
    expect(kinds(row('1', '1e400'))).toContain('BAD_PRICE');
  });

  it('a hex price became 10, and is now refused', () => {
    expect(asItWas.price('0x10')).toBe(10);
    expect(row('1', '0x10').sellingPrice).toBeNull();
  });

  it('a price with letters stuck to it became 12, and is now refused', () => {
    expect(asItWas.price('12abc')).toBe(12);
    expect(row('1', '12abc').sellingPrice).toBeNull();
  });

  it('and a price that was always right is still right', () => {
    expect(asItWas.price('25.5')).toBe(25.5);
    expect(row('1', '25.5').sellingPrice).toBe(25.5);
    expect(kinds(row('1', '25.5'))).toEqual([]);
  });

  it('a hex quantity was sixteen units, and is now refused', () => {
    expect(asItWas.qty('0x10')).toBe(16);
    const r = row('0x10', '');
    expect(r.quantity).toBeNull();
    expect(kinds(r)).toContain('BAD_QUANTITY');
    expect(said(r, 'quantity')).toContain('0x10');
  });

  it('and the other two bases with it', () => {
    expect(asItWas.qty('0b11')).toBe(3);
    expect(asItWas.qty('0o17')).toBe(15);
    expect(row('0b11', '').quantity).toBeNull();
    expect(row('0o17', '').quantity).toBeNull();
  });

  /**
   * AND THE OTHER DIRECTION, which is the half of this that is not a
   * refusal: a quantity typed on an Arabic keypad used to be thrown out,
   * because `Number('٣')` is `NaN`. It is read now.
   */
  it('and an Arabic quantity, which was refused outright, is now read', () => {
    expect(asItWas.qty('٣')).toBe('REFUSED');
    expect(row('٣', '').quantity).toBe(3);
    expect(kinds(row('٣', ''))).toEqual([]);
  });
});

/* ───────────────────── the ruling on the unreadable cell ───────────────── */

describe('an unreadable cell refuses its ROW — not the file, and never silently', () => {
  it('the row cannot be imported, and the rest of the file still can', () => {
    const out = parseOrderSheet(
      sheet([
        HEAD,
        ['أحمد', '0999123456', 'حمص', 'كريم', '1', '3,5'],
        ['سمير', '0999123457', 'حمص', 'كريم', '2', '٣٥٠٠'],
        ['هند', '0999123458', 'حمص', 'كريم', '1', '12'],
      ])
    );
    expect(out.error, 'الملفُّ كلُّه رُفِضَ بسبب خليّةٍ واحدة').toBeUndefined();
    expect(out.rows).toHaveLength(3);
    expect(out.rows.map(isImportable)).toEqual([false, true, true]);
    expect(out.rows[1].sellingPrice).toBe(3500);
    expect(out.rows[2].sellingPrice).toBe(12);
  });

  /**
   * THE DISTINCTION THE WHOLE RULING RESTS ON. An empty price cell is a real
   * instruction — «charge the product's own price» — and it also produces
   * `sellingPrice: null`. If an unreadable cell produced that same `null`
   * and nothing else, the importer would still be guessing, one step later.
   */
  it('and an unreadable price is never mistaken for an empty one', () => {
    const empty = row('1', '');
    const unreadable = row('1', '12abc');
    expect(empty.sellingPrice).toBeNull();
    expect(unreadable.sellingPrice).toBeNull();
    // The same null, so the difference has to be carried somewhere else.
    expect(empty.problems, 'خليّةٌ فارغةٌ صارت مشكلة').toEqual([]);
    expect(isImportable(empty)).toBe(true);
    expect(kinds(unreadable)).toEqual(['BAD_PRICE']);
    expect(isImportable(unreadable)).toBe(false);
  });

  it('and an unreadable quantity is never mistaken for an empty one either', () => {
    const empty = row('', '12');
    const unreadable = row('ثلاثة', '12');
    expect(empty.quantity, 'الكميّةُ الفارغةُ واحدٌ — هذا هو العقد').toBe(1);
    expect(empty.problems).toEqual([]);
    expect(unreadable.quantity, 'كميّةٌ غيرُ مقروءةٍ صارت واحداً').toBeNull();
    expect(kinds(unreadable)).toEqual(['BAD_QUANTITY']);
  });

  it('a negative price is refused, and called negative rather than unreadable', () => {
    const r = row('1', '-5');
    expect(r.sellingPrice).toBeNull();
    expect(kinds(r)).toContain('BAD_PRICE');
    expect(said(r, 'sellingPrice')).toContain('سالب');
  });

  /** A zero IS readable; it is simply not a quantity. The two words differ. */
  it('and a readable figure out of range says so in different words', () => {
    expect(said(row('0', ''), 'quantity')).toContain('ليست عدداً صحيحاً');
    expect(said(row('2.5', ''), 'quantity')).toContain('ليست عدداً صحيحاً');
    expect(said(row('ثلاثة', ''), 'quantity')).toContain('غير مقروءة');
  });

  /** Every refusal names the cell, so the operator can find it in Excel. */
  it('and every refusal quotes the cell and the line it sits on', () => {
    const out = parseOrderSheet(sheet([HEAD, ['أحمد', '0999123456', 'حمص', 'كريم', '1', '0x10']]));
    expect(out.rows[0].line, 'رقمُ السطرِ كما يراه في الجدول').toBe(2);
    expect(said(out.rows[0], 'sellingPrice')).toContain('0x10');
    expect(said(out.rows[0], 'sellingPrice')).toContain('غير مقروء');
  });

  /**
   * AND THE SCREEN SHOWS THE CELL, NOT A ONE. It printed «× {r.quantity}»
   * over a quantity the parser had replaced with 1 — the same thing it
   * prints for an empty cell — so the operator read «one unit» off a cell
   * that said «0x10».
   */
  it('and the screen prints the cell it could not read, never a figure of its own', () => {
    const src = stripComments(repoFile('src/components/orders/ImportOrdersDialog.tsx'));
    expect(src, 'الشاشةُ تَطبَعُ كميّةً قد تكون مُلفَّقة').not.toMatch(/× \{r\.quantity\}/);
    expect(src).toContain('r.quantity ?? `«${r.values.quantity}»`');
  });
});

/* ──────────────── the reader, and the one place the script changes ─────── */

describe('the shared reader accepts an Arabic keypad and nothing loose', () => {
  it('reads Arabic-Indic and Persian digits as the figures they are', () => {
    expect(readTypedFigure('٣٥٠٠')).toBe(3500);
    expect(readTypedFigure('١٢')).toBe(12);
    expect(readTypedFigure('۲۵')).toBe(25);
    expect(readTypedFigure('٢٥.٥')).toBe(25.5);
  });

  it('and refuses every notation the doors refuse', () => {
    for (const bad of [
      '0x10', '0b11', '0o17', '3,5', '3,500', '12abc', 'abc', '', '   ',
      'Infinity', '1e400', '-', '.', '١٢٣abc', '٢٥٫٥',
    ]) {
      expect(readTypedFigure(bad), 'قُبِلَت «' + bad + '»').toBeNull();
    }
  });

  it('and refuses everything that is neither a number nor a string', () => {
    for (const bad of [null, undefined, [], ['5'], {}, true, new Date(0), NaN, Infinity]) {
      expect(readTypedFigure(bad), 'قُبِلَت ' + String(bad)).toBeNull();
    }
  });

  it('and a plain number passes through while a non-finite one does not', () => {
    expect(readTypedFigure(25.5)).toBe(25.5);
    expect(readTypedFigure(0)).toBe(0);
    expect(readTypedFigure(Number.POSITIVE_INFINITY)).toBeNull();
  });

  /**
   * AND THE DOORS DID NOT INHERIT THE CONVERSION. A JSON body from our own
   * screens carries Latin digits by law (`western-digits.test.ts`), so an
   * Arabic numeral arriving at an API is an anomaly rather than a person
   * typing — and broadening nine doors to accept one spreadsheet is a change
   * nobody measured.
   */
  it('while money() and count() still refuse an Arabic-Indic digit', () => {
    expect(money(100000).safeParse('٣٥٠٠').success).toBe(false);
    expect(count(999, 1).safeParse('٣').success).toBe(false);
  });

  it('and the conversion lives in one named place, not in a character class', () => {
    /**
     * NOT «no `.replace(` in the file»: `norm` strips the trailing `*` off a
     * header label, which is a header and not a figure. What may not exist
     * is a rewrite on the way INTO a number — and the sweep that states that
     * as a law over the whole tree, rather than over this one file, is
     * `a-column-has-one-rule.test.ts`.
     */
    const src = stripComments(repoFile('src/lib/order-import.ts'));
    expect(src, 'الحشوُ عاد: السعرُ يُقرأُ من نصٍّ أُعيدَ كتابتُه').not.toMatch(/Number\(String\(/);
    expect(src, 'صنفُ المحارفِ الذي حَذَفَ الأرقامَ العربيّة').not.toContain('[^\\d.-]');
    expect(src).toContain('readTypedFigure(');
    expect(src, 'قارئٌ ثالثَ عشرَ داخلَ المستورد').not.toMatch(/Number\(\s*raw/);
    const reader = stripComments(repoFile('src/lib/numeric-input.ts'));
    expect(reader).toContain('toLatinDigits(raw)');
    expect(reader, 'التحويلُ صار نمطاً لا دالّةً مسمّاة').toMatch(/import \{ toLatinDigits \}/);
  });
});
