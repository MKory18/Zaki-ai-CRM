import { describe, expect, it } from 'vitest';
import {
  CORE_STATES,
  FILTERABLE_STATES,
  STATE_LABEL_AR,
  deriveCoreState,
  whereForState,
  type CoreState,
} from './order-state';

/**
 * The filter and the badge have to mean the same thing.
 *
 * The orders list labelled every row with the DERIVED state and filtered on
 * the stored legacy `status` column — two different vocabularies on one
 * screen. Picking "مؤكد" returned orders the same table was calling "مشحون",
 * and missed ones it was calling "مؤكد".
 *
 * So the filter is now the derivation read backwards, and this test is what
 * keeps them honest: it walks every stored combination the system can
 * produce and checks the two agree on all of them. Add a shipping or
 * confirmation status to one map without the other and this fails.
 */

const SHIPPING_VALUES = [
  'NOT_READY', 'PACKING', 'READY_FOR_SHIPPING', 'READY_FOR_PICKUP', 'SHIPPED',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED_DELIVERY',
  'RETURN_REQUESTED', 'RETURNED', 'CANCELLED',
];

const CONFIRMATION_VALUES = [
  'NEW', 'IN_PROGRESS', 'NO_ANSWER', 'FOLLOW_UP_REQUIRED', 'POSTPONED',
  'CONFIRMED', 'REJECTED', 'CANCELLED',
];

interface Row {
  shippingStatus: string;
  confirmationStatus: string;
  claimedById: string | null;
}

/** Every combination an order row can hold, claimed and unclaimed. */
const ALL_ROWS: Row[] = SHIPPING_VALUES.flatMap((shippingStatus) =>
  CONFIRMATION_VALUES.flatMap((confirmationStatus) =>
    [null, 'u1'].map((claimedById) => ({ shippingStatus, confirmationStatus, claimedById }))
  )
);

/** A small evaluator for the subset of Prisma clauses whereForState emits. */
function matches(row: Row, clause: Record<string, any>): boolean {
  // Every key is an AND, including OR itself — returning early on OR would
  // ignore the sibling conditions that keep a branch scoped.
  for (const [field, condition] of Object.entries(clause)) {
    if (field === 'OR') {
      if (!(condition as Record<string, any>[]).some((c) => matches(row, c))) return false;
      continue;
    }
    const value = (row as any)[field];
    if (condition === null) {
      if (value !== null) return false;
    } else if (typeof condition === 'object') {
      if ('in' in condition && !condition.in.includes(value)) return false;
      if ('notIn' in condition && condition.notIn.includes(value)) return false;
      if ('not' in condition) {
        if (condition.not === null ? value === null : value === condition.not) return false;
      }
    } else if (value !== condition) {
      return false;
    }
  }
  return true;
}

describe('filtering by state returns exactly what the badge says', () => {
  for (const state of CORE_STATES) {
    const clause = whereForState(state);
    if (!clause) continue;

    it(`${state}: matches every row of that state and nothing else`, () => {
      const wrong: string[] = [];
      const missed: string[] = [];

      for (const row of ALL_ROWS) {
        const derived = deriveCoreState(row);
        const matched = matches(row, clause);
        const label = `${row.shippingStatus}/${row.confirmationStatus}/${row.claimedById ?? '-'}`;
        if (matched && derived !== state) wrong.push(`${label} → ${derived}`);
        if (!matched && derived === state) missed.push(label);
      }

      expect(wrong, `تُطابق صفوفاً ليست من هذه الحالة: ${wrong.join(', ')}`).toEqual([]);
      expect(missed, `تفوّت صفوفاً من هذه الحالة: ${missed.join(', ')}`).toEqual([]);
    });
  }

  it('covers every row — no combination filters to nothing', () => {
    for (const row of ALL_ROWS) {
      const state = deriveCoreState(row);
      const clause = whereForState(state);
      expect(clause, `${row.shippingStatus}/${row.confirmationStatus} → ${state}`).not.toBeNull();
      expect(matches(row, clause!), `${row.shippingStatus}/${row.confirmationStatus}`).toBe(true);
    }
  });

  it('keeps an unknown confirmation value visible as NEW, not invisible', () => {
    // The derivation falls back to NEW; the filter has to agree or those
    // orders exist in the table and match no filter at all.
    const row = { shippingStatus: 'NOT_READY', confirmationStatus: 'SOMETHING_NEW', claimedById: null };
    expect(deriveCoreState(row)).toBe('NEW');
    expect(matches(row, whereForState('NEW')!)).toBe(true);
  });

  it('reads a partly-delivered order as closed, not as waiting in the warehouse', () => {
    // recordPartialDelivery writes this status; before it was mapped the
    // order derived to CONFIRMED and reappeared in the packing queue.
    const row = { shippingStatus: 'PARTIALLY_DELIVERED', confirmationStatus: 'CONFIRMED', claimedById: 'u1' };
    expect(deriveCoreState(row)).toBe('PARTIALLY_DELIVERED');
  });

  it('offers only states an order can actually be in', () => {
    expect(FILTERABLE_STATES.length).toBeGreaterThan(0);
    for (const state of FILTERABLE_STATES) {
      expect(whereForState(state)).not.toBeNull();
    }
    // A state nothing derives to would be a filter that always comes back empty.
    const dead = CORE_STATES.filter((s) => !FILTERABLE_STATES.includes(s));
    expect(dead.every((s) => whereForState(s) === null)).toBe(true);
  });

  it('names every state in Arabic — the screen shows no raw enum', () => {
    for (const state of CORE_STATES) {
      expect(STATE_LABEL_AR[state as CoreState]?.trim(), state).toBeTruthy();
    }
  });
});
