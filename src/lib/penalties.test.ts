import { describe, expect, it } from 'vitest';
import { chargeFor, mayMove, PENALTY_KEYS, ruleFor, type RuleRow } from './penalties';

/**
 * THE ARITHMETIC OF TAKING SOMEBODY'S MONEY.
 *
 * Every case below exists because getting it wrong takes money from a real
 * person who then has to argue their way back. The one that matters most is
 * `estimated`: an arrival time inferred from the first order somebody
 * touched is an UPPER BOUND — they were at their desk before that, and
 * nobody knows how long before. Charging it is not strictness, it is
 * charging for a measurement we openly admit we do not have.
 */

const RULE = { perUnit: 2, grace: 10, periodCap: 100 };

describe('what is charged', () => {
  it('only the units past the grace', () => {
    // 40 minutes late, 10 forgiven, 30 × 2.
    expect(chargeFor(RULE, { units: 40 })).toMatchObject({ chargedUnits: 30, amount: 60, refused: null });
  });

  it('nothing at all inside the grace — traffic is not misconduct', () => {
    expect(chargeFor(RULE, { units: 10 })).toMatchObject({ amount: 0, refused: 'WITHIN_GRACE' });
    expect(chargeFor(RULE, { units: 3 })).toMatchObject({ amount: 0, refused: 'WITHIN_GRACE' });
  });

  it('nothing when nothing was measured', () => {
    expect(chargeFor(RULE, { units: 0 }).refused).toBe('NOTHING_MEASURED');
    expect(chargeFor(RULE, { units: -5 }).refused).toBe('NOTHING_MEASURED');
  });

  it('and rounds to the currency, never to a global rule', () => {
    const c = chargeFor({ perUnit: 0.333, grace: 0, periodCap: null }, { units: 10, minorUnit: 3 });
    expect(c.amount).toBe(3.33);
    const jod = chargeFor({ perUnit: 0.3335, grace: 0, periodCap: null }, { units: 1, minorUnit: 3 });
    expect(jod.amount).toBe(0.334);
  });
});

describe('the cap', () => {
  it('caps the PERIOD, not the day', () => {
    // 90 already taken this month, so only 10 of room is left.
    const c = chargeFor(RULE, { units: 60, alreadyCharged: 90 });
    expect(c.amount).toBe(10);
  });

  it('and once it is spent nothing more is proposed at all', () => {
    // Not a zero row in front of a manager: a decision that costs them time
    // and the person nothing.
    expect(chargeFor(RULE, { units: 60, alreadyCharged: 100 }).amount).toBe(0);
    expect(chargeFor(RULE, { units: 60, alreadyCharged: 999 }).refused).toBe('WITHIN_GRACE');
  });

  it('a rule with no cap charges the whole measurement', () => {
    expect(chargeFor({ perUnit: 2, grace: 0, periodCap: null }, { units: 500 }).amount).toBe(1000);
  });
});

describe('a measurement we do not actually have', () => {
  it('is never charged, however large it looks', () => {
    // The arrival was taken from their first order. They were at the desk
    // before that, and nobody knows how long before.
    const c = chargeFor(RULE, { units: 240, estimated: true });
    expect(c.amount).toBe(0);
    expect(c.refused).toBe('ESTIMATED');
  });

  it('and the refusal outranks the grace, so the reason is the true one', () => {
    expect(chargeFor(RULE, { units: 200, estimated: true }).refused).toBe('ESTIMATED');
  });
});

describe('the life of a deduction', () => {
  it('proposed may be applied or waived', () => {
    expect(mayMove('PROPOSED', 'APPLIED')).toBe(true);
    expect(mayMove('PROPOSED', 'WAIVED')).toBe(true);
  });

  it('applied money is undone by a reversal, never by being un-applied', () => {
    expect(mayMove('APPLIED', 'REVERSED')).toBe(true);
    expect(mayMove('APPLIED', 'WAIVED')).toBe(false);
    expect(mayMove('APPLIED', 'PROPOSED')).toBe(false);
  });

  it('and a decided one stays decided', () => {
    expect(mayMove('WAIVED', 'APPLIED')).toBe(false);
    expect(mayMove('REVERSED', 'APPLIED')).toBe(false);
    expect(mayMove('REVERSED', 'PROPOSED')).toBe(false);
  });
});

describe('which rule applies', () => {
  const base = {
    perUnit: 1,
    grace: 0,
    periodCap: null,
    kind: 'LATE',
    currencyCode: 'SYP',
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    isActive: true,
    createdAt: new Date('2026-01-01'),
  };
  const row = (over: Partial<RuleRow>): RuleRow => ({ id: 'r', storeId: null, role: null, ...base, ...over } as RuleRow);
  const on = new Date('2026-09-25');
  const target = { kind: 'LATE', storeId: 's1', role: 'CONFIRMATION_AGENT', on };

  it('the most specific wins — role over everyone, store over everywhere', () => {
    const rules = [
      row({ id: 'all' }),
      row({ id: 'role', role: 'CONFIRMATION_AGENT' }),
      row({ id: 'store', storeId: 's1' }),
      row({ id: 'both', storeId: 's1', role: 'CONFIRMATION_AGENT' }),
    ];
    expect(ruleFor(rules, target)!.id).toBe('both');
    expect(ruleFor([rules[0], rules[1], rules[2]], target)!.id).toBe('store');
    expect(ruleFor([rules[0], rules[1]], target)!.id).toBe('role');
  });

  it('two of equal specificity: the newer one, so a fix is a new rule', () => {
    const older = row({ id: 'older', createdAt: new Date('2026-01-01') });
    const newer = row({ id: 'newer', createdAt: new Date('2026-06-01') });
    expect(ruleFor([older, newer], target)!.id).toBe('newer');
  });

  it('nothing for another store, another role, or another kind', () => {
    expect(ruleFor([row({ storeId: 's2' })], target)).toBeNull();
    expect(ruleFor([row({ role: 'MODERATOR' })], target)).toBeNull();
    expect(ruleFor([row({ kind: 'ABSENT' })], target)).toBeNull();
  });

  it('nothing for a rule switched off, or not yet in force, or expired', () => {
    expect(ruleFor([row({ isActive: false })], target)).toBeNull();
    expect(ruleFor([row({ effectiveFrom: new Date('2026-12-01') })], target)).toBeNull();
    expect(ruleFor([row({ effectiveTo: new Date('2026-06-01') })], target)).toBeNull();
  });

  it('and no rule means no deduction — silence is never a charge', () => {
    expect(ruleFor([], target)).toBeNull();
  });
});

describe('the kinds', () => {
  it('are the ones the day can actually be measured by', () => {
    expect(PENALTY_KEYS).toEqual(['LATE', 'ABSENT', 'EARLY_LEAVE', 'NO_ACTION']);
  });
});
