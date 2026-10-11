import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './guard-source';
import { SHIPPING_GONE, hasLeftWarehouse, leftWarehouseWhere } from './order-state';
import { refFromNotes } from './settlement';

/**
 * A STATEMENT LINE IS A PARCEL THAT LEFT.
 *
 * A line in a courier's statement says «this parcel was delivered and we
 * collected X». The matcher attached that money to an order by one of two
 * keys, and the second had NO state filter at all — so a reference that
 * happened to equal a real order number could attach a courier's money to a
 * parcel still sitting in the warehouse.
 *
 * ── AND IT IS NOT A LATENT PATH ──
 *
 * MEASURED on the live database: all twelve MATCHED orders have
 * `trackingNumber IS NULL`. The barcode branch requires
 * `trackingNumber: line.barcode`, so it matched NOTHING — and the
 * unfiltered fallback did every single match in this deployment. It is the
 * only path that functions here.
 *
 * ── WHERE THE REFERENCE COMES FROM, WHICH MAKES IT SHARPER ──
 *
 * `merchantRef` on a line is the courier's own column when they echo ours
 * back. When they do not, `refFromNotes` reads the FIRST TOKEN of a
 * free-text notes column — «15132 - العميل طلب التأجيل» gives `15132`.
 * That heuristic is right often and cannot be right always.
 *
 * What it is NOT, measured below: a way to match Arabic prose (the pattern
 * needs an ASCII alphanumeric first character, so a note in Arabic answers
 * null), and not a way to match two orders at once
 * (`@@unique([companyId, merchantRef])` means a hit names exactly one).
 *
 * So what was missing was never a tighter pattern. It was the filter.
 *
 * ── AND THE FILTER IS THE OWNER'S OWN RULING, NOT A NEW ONE ──
 *
 * Asked where goods stop being ours, the owner answered «لحظةَ طباعة
 * البوليصة». `hasLeftWarehouse` is that line and it already existed. The
 * only new thing is a rendering of it as a query, because a predicate
 * cannot FIND rows.
 */

const root = process.cwd();
const read = (f: string) => readFileSync(join(root, f), 'utf8');

/* ── the two renderings, compared over every combination ── */

type Row = {
  shippedAt: Date | null;
  shippingStatus: string;
  labelPrintedAt: Date | null;
};

/**
 * EVALUATE THE `where` THE WAY POSTGRES WOULD, for the four conditions this
 * one uses. Not a general Prisma interpreter — just enough to answer
 * «would this row come back», so the two renderings can be compared on the
 * same input rather than read side by side by a person.
 */
function whereMatches(row: Row): boolean {
  const w = leftWarehouseWhere();
  /*
   * EVERY KEY IN A CLAUSE, AND WITH `AND` SEMANTICS — which is what Prisma
   * does and what my first version of this got wrong.
   *
   * It read `if ('shippedAt' in clause) return …` and so answered on the
   * FIRST key it recognised. A mutation that merged two conditions into one
   * clause object — turning an OR into an AND, the single most consequential
   * way this rule can break — passed, because the interpreter never looked
   * at the second key.
   *
   * An interpreter that is more permissive than the thing it models cannot
   * prove the two renderings agree: it was agreeing with itself.
   */
  return w.OR.some((clause) => {
    const keys = Object.keys(clause) as (keyof typeof clause)[];
    if (keys.length === 0) return false;
    return keys.every((key) => {
      if (key === 'shippedAt') return row.shippedAt !== null;
      if (key === 'labelPrintedAt') return row.labelPrintedAt !== null;
      if (key === 'shippingStatus') {
        const want = (clause as { shippingStatus: string | { in: string[] } }).shippingStatus;
        return typeof want === 'string'
          ? row.shippingStatus === want
          : want.in.includes(row.shippingStatus);
      }
      // A condition this interpreter does not model. Refusing rather than
      // ignoring: a clause it cannot read must not be read as «matches».
      throw new Error(`شرطٌ لا يَفهمُه المُفسِّر: ${String(key)}`);
    });
  });
}

/** Every shipping status the product has, plus the ones before the line. */
const ALL_STATUSES = [
  'NOT_READY', 'READY_FOR_PICKUP', ...SHIPPING_GONE,
  // A value nothing writes, to prove neither rendering says yes by default.
  'SOMETHING_NOBODY_WRITES',
];

describe('Ⅰ · the predicate and the query are one rule', () => {
  it('agree on EVERY combination of the three facts', () => {
    /*
     * GENERATED, NOT SAMPLED. Two renderings of one rule is the defect this
     * repository keeps finding — `SHIPPING_GONE`'s own comment says a second
     * copy of that list is what caused the original drift. They are
     * acceptable here only because this proves them equal on all 32 inputs
     * rather than on the three somebody thought of.
     */
    const disagreements: string[] = [];
    let checked = 0;
    for (const shippingStatus of ALL_STATUSES) {
      for (const shippedAt of [null, new Date('2026-10-01')]) {
        for (const labelPrintedAt of [null, new Date('2026-10-01')]) {
          const row: Row = { shippedAt, shippingStatus, labelPrintedAt };
          checked++;
          const predicate = hasLeftWarehouse(row as never);
          const query = whereMatches(row);
          if (predicate !== query) {
            disagreements.push(
              `${shippingStatus} shipped=${!!shippedAt} labelled=${!!labelPrintedAt}: دالّة ${predicate} / استعلام ${query}`
            );
          }
        }
      }
    }
    expect(checked, 'التوليفاتُ أقلُّ من أن تُثبِتَ شيئاً').toBeGreaterThanOrEqual(32);
    expect(
      disagreements,
      `الدالّةُ والاستعلامُ يَختلفانِ — نسختانِ لحُكمٍ واحد:\n${disagreements.join('\n')}`
    ).toEqual([]);
  });

  it('and both refuse an order that has not been labelled or shipped', () => {
    const inWarehouse: Row = { shippedAt: null, shippingStatus: 'NOT_READY', labelPrintedAt: null };
    expect(hasLeftWarehouse(inWarehouse as never)).toBe(false);
    expect(whereMatches(inWarehouse)).toBe(false);
  });

  it('and both accept a labelled parcel on the out-tray — «لحظةَ طباعة البوليصة»', () => {
    const labelled: Row = { shippedAt: null, shippingStatus: 'NOT_READY', labelPrintedAt: new Date() };
    expect(hasLeftWarehouse(labelled as never)).toBe(true);
    expect(whereMatches(labelled)).toBe(true);
  });

  it('and the query builds a FRESH object each call', () => {
    /*
     * A module-level constant spread into a query is shared mutable state:
     * one caller pushing onto that `OR` changes the rule for every other
     * caller, silently, for the life of the process.
     */
    const a = leftWarehouseWhere();
    const b = leftWarehouseWhere();
    expect(a).not.toBe(b);
    expect(a.OR).not.toBe(b.OR);
    a.OR.push({ shippingStatus: 'NOT_READY' });
    expect(leftWarehouseWhere().OR, 'الكائنُ مشترَكٌ — عُدِّلَ من بعيد').toHaveLength(b.OR.length);
  });

  it('and it reads the ONE list, not a copy of it', () => {
    const src = stripComments(read('src/lib/order-state.ts'));
    /*
     * SLICED TO THE NEXT `export`, not matched to the first `\n}`.
     *
     * The non-greedy form stopped at the closing brace of the RETURN TYPE
     * annotation and captured only the signature — so the assertion below
     * was reading a string that could not contain the list either way. A
     * green tick over nothing, caught by the assertion failing rather than
     * by reading it.
     */
    const from = src.indexOf('export function leftWarehouseWhere');
    expect(from, 'الدالّةُ غيرُ موجودة').toBeGreaterThan(-1);
    const next = src.indexOf('\nexport ', from + 1);
    const fn = src.slice(from, next === -1 ? undefined : next);
    expect(fn, 'الجسمُ لم يُقتَطَع').toContain('return {');
    expect(fn, 'قائمةٌ رابعةٌ مكتوبةٌ بيد').toMatch(/\.\.\.SHIPPING_GONE/);
    expect(fn, 'حالةٌ مكتوبةٌ حرفيّاً من القائمة').not.toMatch(/'SHIPPED'|'DELIVERED'/);
  });
});

describe('Ⅱ · the matcher asks it', () => {
  const src = stripComments(read('src/lib/settlement.ts'));

  it('the reference fallback filters on the commitment line', () => {
    expect(src).toMatch(/merchantRef: line\.merchantRef,[\s\S]{0,120}\.\.\.leftWarehouseWhere\(\)/);
  });

  it('and the old unfiltered form is gone', () => {
    expect(
      src,
      'الفرعُ ما زال يُطابِقُ طلباً لم يُشحَنْ قطّ'
    ).not.toMatch(/where: \{ companyId, storeId, merchantRef: line\.merchantRef \}/);
  });

  it('and the company-wide scope STAYS, deliberately', () => {
    /*
     * The reference is OURS and unique per company, so it names one order
     * whoever carried the parcel. Scoping it to the statement's courier
     * would break an order that changed couriers after we sent it — the
     * barcode branch is the one that must be courier-scoped, and is.
     */
    expect(src, 'الفرعُ صارَ مُقيَّداً بالمندوب').not.toMatch(
      /merchantRef: line\.merchantRef,[\s\S]{0,160}deliveryProviderId: statement\.deliveryProviderId/
    );
    // And the barcode branch still is.
    expect(src).toMatch(/trackingNumber: line\.barcode[\s\S]{0,200}/);
    expect(src).toMatch(/deliveryProviderId: statement\.deliveryProviderId,[\s\S]{0,80}trackingNumber: line\.barcode/);
  });
});

describe('Ⅲ · what the notes reader can and cannot do', () => {
  it('reads an order number written at the start of a note', () => {
    expect(refFromNotes('15132 - العميل طلب التأجيل')).toBe('15132');
    expect(refFromNotes('  ORD-2026-0007 ملاحظة')).toBe('ORD-2026-0007');
  });

  it('and answers null to Arabic prose, which is most notes', () => {
    /*
     * The pattern needs an ASCII alphanumeric FIRST character, so a note
     * that opens in Arabic cannot produce a reference at all. This is why
     * the heuristic is survivable — and it is measured rather than assumed,
     * because it is the reason a tighter pattern was not the fix.
     */
    for (const note of ['تم الرفض قبل الوصول', 'العميل لم يجب', 'أجّل للغد', '', '   ', null, undefined]) {
      expect(refFromNotes(note), String(note)).toBeNull();
    }
  });

  it('and takes only the FIRST token, which is the whole risk', () => {
    // Said out loud: a note opening with any token that equals an order
    // number finds that order. The state filter is what makes that safe.
    expect(refFromNotes('2026 تم التسليم')).toBe('2026');
    expect(refFromNotes('AB-9 شيء آخر تماماً')).toBe('AB-9');
  });

  it('and a token shorter than three characters is not a reference', () => {
    expect(refFromNotes('ab ملاحظة')).toBeNull();
    expect(refFromNotes('7 دينار')).toBeNull();
  });

  it('and nothing in it can reach beyond a reference — no path, no wildcard', () => {
    /*
     * The token goes into a `where` as an exact string, so SQL is not the
     * risk. What would be a risk is a character that makes it match MORE
     * than one order, and the pattern's own character class is the answer:
     * letters, digits, underscore, slash and hyphen.
     */
    expect(refFromNotes('%% انتبه')).toBeNull();
    expect(refFromNotes("ORD'; drop table orders; --")).toBe('ORD');
  });
});
