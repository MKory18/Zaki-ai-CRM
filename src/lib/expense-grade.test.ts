import { describe, expect, it } from 'vitest';
import {
  DIRECTION_TOLERANCE,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_AR,
  MIN_ROWS_FOR_DIRECTION,
  categoryLabel,
  gradeExpenseType,
  gradeExpenseTypes,
  isKnownCategory,
  ledgerTrust,
} from './expense-grade';

/**
 * THE GUARDS.
 *
 * The measured database holds ZERO expense rows — no expense has ever been
 * recorded in this system — so unlike the channel guards these cannot be
 * anchored to real figures. They are anchored to the shape of the refusals
 * instead, which is the part that has to hold when the first row is typed.
 */

const WINDOW = { totalSpend: 1000, deliveredRevenue: 2461.5, priorDeliveredRevenue: 2000 };

describe('the types', () => {
  it('are readable in Arabic — the ledger printed the raw enum', () => {
    for (const c of EXPENSE_CATEGORIES) {
      expect(EXPENSE_CATEGORY_AR[c], `${c} has no Arabic label`).toBeTruthy();
      expect(categoryLabel(c)).not.toBe(c);
      expect(categoryLabel(c)).toMatch(/[؀-ۿ]/);
    }
  });

  it('cover every value the expense form can post', () => {
    // The form's eight options, read off FinanceProfitScreen.
    for (const c of ['MARKETING', 'PACKAGING', 'SHIPPING', 'COMMISSION', 'SALARIES', 'OFFICE', 'MANUFACTURING', 'OTHER']) {
      expect(isKnownCategory(c), `${c} unknown to the label map`).toBe(true);
    }
  });

  it('print an unknown type as it was stored, never folded into «أخرى»', () => {
    expect(categoryLabel('RENT_2026')).toBe('RENT_2026');
    expect(isKnownCategory('RENT_2026')).toBe(false);
    expect(categoryLabel('RENT_2026')).not.toBe(EXPENSE_CATEGORY_AR.OTHER);
  });

  it('and mark it as unknown on the row, so a typo cannot hide', () => {
    const g = gradeExpenseType({ category: 'RENT_2026', rows: 3, amount: 100, priorAmount: 100 }, WINDOW);
    expect(g.known).toBe(false);
    expect(gradeExpenseType({ category: 'OFFICE', rows: 3, amount: 100 }, WINDOW).known).toBe(true);
  });
});

describe('the composition', () => {
  it('says what share of all spending a type took', () => {
    const g = gradeExpenseType({ category: 'MARKETING', rows: 4, amount: 250 }, WINDOW);
    expect(g.shareOfSpend).toBe(25);
  });

  it('and what share of delivered revenue it ate', () => {
    const g = gradeExpenseType({ category: 'MARKETING', rows: 4, amount: 246.15 }, WINDOW);
    expect(g.burden).toBe(10);
  });

  it('refusing a burden rather than dividing by a shop that sold nothing', () => {
    const g = gradeExpenseType({ category: 'MARKETING', rows: 4, amount: 250 }, { totalSpend: 1000, deliveredRevenue: 0 });
    expect(g.burden).toBeNull();
    expect(g.direction).toBe('UNKNOWN');
    expect(g.why).toContain('لا إيراد');
  });

  it('and refusing a share when nothing at all was spent', () => {
    const g = gradeExpenseType({ category: 'MARKETING', rows: 0, amount: 0 }, { totalSpend: 0, deliveredRevenue: 2461.5 });
    expect(g.shareOfSpend).toBeNull();
  });
});

describe('the direction, which is the only graded part', () => {
  it('compares burdens and not amounts — a bigger shop is not a leak', () => {
    // Spend doubled, and so did revenue. The bite is identical.
    const g = gradeExpenseType(
      { category: 'PACKAGING', rows: 6, amount: 200, priorAmount: 100 },
      { totalSpend: 1000, deliveredRevenue: 2000, priorDeliveredRevenue: 1000 }
    );
    expect(g.burden).toBe(10);
    expect(g.priorBurden).toBe(10);
    expect(g.direction).toBe('STEADY');
  });

  it('calls a type whose bite grew GROWING, and shows both figures', () => {
    const g = gradeExpenseType(
      { category: 'PACKAGING', rows: 6, amount: 180, priorAmount: 80 },
      { totalSpend: 1000, deliveredRevenue: 2000, priorDeliveredRevenue: 2000 }
    );
    expect(g.priorBurden).toBe(4);
    expect(g.burden).toBe(9);
    expect(g.direction).toBe('GROWING');
    expect(g.why).toContain('4%');
    expect(g.why).toContain('9%');
  });

  it('and SHRINKING when it gave ground', () => {
    const g = gradeExpenseType(
      { category: 'PACKAGING', rows: 6, amount: 80, priorAmount: 180 },
      { totalSpend: 1000, deliveredRevenue: 2000, priorDeliveredRevenue: 2000 }
    );
    expect(g.direction).toBe('SHRINKING');
  });

  it('ignoring a wobble smaller than the tolerance', () => {
    // 10% → 11% is a tenth of a move; spending is lumpier than that.
    const g = gradeExpenseType(
      { category: 'OFFICE', rows: 8, amount: 220, priorAmount: 200 },
      { totalSpend: 1000, deliveredRevenue: 2000, priorDeliveredRevenue: 2000 }
    );
    expect(g.direction).toBe('STEADY');
    expect(DIRECTION_TOLERANCE).toBeGreaterThanOrEqual(0.2);
  });

  it('calling a type that did not exist before NEW, not GROWING', () => {
    const g = gradeExpenseType(
      { category: 'MARKETING', rows: 3, amount: 200, priorAmount: 0 },
      { totalSpend: 1000, deliveredRevenue: 2000, priorDeliveredRevenue: 2000 }
    );
    expect(g.direction).toBe('NEW');
    expect(g.why).toContain('لم يُصرف');
  });

  it('does not call a long-standing type NEW because last month sold nothing', () => {
    /**
     * The bug the dry run against the real database caught. Last month's
     * delivered revenue is 0 on this shop, so every prior burden comes back
     * null — and «رواتب 600 ثم 600» was being labelled «بند جديد».
     */
    const g = gradeExpenseType(
      { category: 'SALARIES', rows: 2, amount: 600, priorAmount: 600 },
      { totalSpend: 1050, deliveredRevenue: 2461.5, priorDeliveredRevenue: 0 }
    );
    expect(g.direction).not.toBe('NEW');
    expect(g.direction).toBe('UNKNOWN');
    expect(g.why).toContain('بلا إيراد');
  });

  it('and NEW is decided on the prior amount, never on the prior burden', () => {
    const fresh = gradeExpenseType(
      { category: 'MARKETING', rows: 3, amount: 240, priorAmount: 0 },
      { totalSpend: 1050, deliveredRevenue: 2461.5, priorDeliveredRevenue: 0 }
    );
    expect(fresh.direction).toBe('NEW');
  });

  it('refusing a direction on a single invoice', () => {
    const g = gradeExpenseType({ category: 'OFFICE', rows: 1, amount: 900, priorAmount: 100 }, WINDOW);
    expect(g.direction).toBe('UNKNOWN');
    expect(g.why).toContain(String(MIN_ROWS_FOR_DIRECTION));
  });

  it('and refusing one when there is no previous window to compare with', () => {
    const g = gradeExpenseType({ category: 'OFFICE', rows: 5, amount: 100 }, { totalSpend: 1000, deliveredRevenue: 2000 });
    expect(g.direction).toBe('UNKNOWN');
    expect(g.why).toContain('لا مدة سابقة');
  });

  it('naming the figures it read in every sentence it produces', () => {
    const cases = [
      { rows: 1, amount: 100, priorAmount: 100 },
      { rows: 5, amount: 100, priorAmount: null },
      { rows: 5, amount: 100, priorAmount: 0 },
      { rows: 5, amount: 300, priorAmount: 100 },
      { rows: 5, amount: 100, priorAmount: 300 },
      { rows: 5, amount: 100, priorAmount: 100 },
    ];
    for (const c of cases) {
      const g = gradeExpenseType({ category: 'OFFICE', ...c }, WINDOW);
      expect(g.why.length, JSON.stringify(c)).toBeGreaterThan(10);
      // Western digits everywhere — the same rule the whole product follows.
      expect(g.why).not.toMatch(/[٠-٩۰-۹]/);
    }
  });
});

describe('the ledger ranking', () => {
  it('puts the heaviest spend first, whatever its direction', () => {
    const rows = gradeExpenseTypes(
      [
        { category: 'OFFICE', rows: 2, amount: 50, priorAmount: 10 },
        { category: 'SALARIES', rows: 4, amount: 600, priorAmount: 600 },
        { category: 'PACKAGING', rows: 3, amount: 200, priorAmount: 100 },
      ],
      WINDOW
    );
    expect(rows.map((r) => r.category)).toEqual(['SALARIES', 'PACKAGING', 'OFFICE']);
  });

  it('and reads as nothing at all on a ledger with no rows', () => {
    // The measured state of this database: zero expenses, ever.
    expect(gradeExpenseTypes([], { totalSpend: 0, deliveredRevenue: 2461.5 })).toEqual([]);
  });
});

describe('whether the ledger is worth reading', () => {
  it('is withheld when no expense names the wallet it left', () => {
    const t = ledgerTrust(0, 12);
    expect(t.level).toBe('WITHHELD');
    expect(t.ar).toContain('المحفظة');
  });

  it('and stated once nearly all of them do', () => {
    expect(ledgerTrust(12, 12).level).toBe('STATED');
  });

  it('saying there is nothing to judge on an empty ledger', () => {
    const t = ledgerTrust(0, 0);
    expect(t.level).toBe('WITHHELD');
    expect(t.share).toBeNull();
  });

  it('and saying it about EXPENSES, not about orders', () => {
    // `trustOf` speaks of orders when it has nothing to measure, because
    // every caller it was built for counts them. On the finance screen that
    // sentence would answer a question nobody asked.
    const t = ledgerTrust(0, 0);
    expect(t.ar).toContain('مصروف');
    expect(t.ar).not.toContain('طلبات');
  });
});

describe('broken numbers', () => {
  it('cannot become a share or a burden', () => {
    const g = gradeExpenseType(
      { category: 'OFFICE', rows: Number.NaN, amount: Number.NaN, priorAmount: Number.NaN },
      { totalSpend: Number.NaN, deliveredRevenue: Number.NaN }
    );
    expect(g.rows).toBe(0);
    expect(g.amount).toBe(0);
    expect(g.shareOfSpend).toBeNull();
    expect(g.burden).toBeNull();
    expect(g.direction).toBe('UNKNOWN');
  });

  it('and a negative amount is treated as nothing spent', () => {
    const g = gradeExpenseType({ category: 'OFFICE', rows: 5, amount: -300 }, WINDOW);
    expect(g.amount).toBe(0);
    expect(g.burden).toBe(0);
  });
});
