import { describe, expect, it } from 'vitest';
import {
  assertCancellable,
  assertReadyToShip,
  assertVoidable,
  deriveCoreState,
  getZone,
  hasEverShipped,
  stateAgeMinutes,
} from './order-state';

const order = (over: Partial<Record<string, unknown>> = {}) =>
  ({ confirmationStatus: 'NEW', shippingStatus: 'NOT_READY', claimedById: null, shippedAt: null, ...over }) as any;

describe('core state derivation', () => {
  it('NEW until someone claims it', () => {
    expect(deriveCoreState(order())).toBe('NEW');
    expect(deriveCoreState(order({ claimedById: 'u1' }))).toBe('CLAIMED');
  });

  it('shipping wins once it starts', () => {
    expect(deriveCoreState(order({ confirmationStatus: 'CONFIRMED', shippingStatus: 'PACKING' }))).toBe('PREPARING');
    expect(deriveCoreState(order({ confirmationStatus: 'CONFIRMED', shippingStatus: 'READY_FOR_SHIPPING' }))).toBe('READY_TO_SHIP');
    expect(deriveCoreState(order({ confirmationStatus: 'CONFIRMED', shippingStatus: 'OUT_FOR_DELIVERY' }))).toBe('SHIPPED');
    expect(deriveCoreState(order({ confirmationStatus: 'CONFIRMED', shippingStatus: 'DELIVERED' }))).toBe('DELIVERED');
  });

  it('maps the confirmation outcomes', () => {
    expect(deriveCoreState(order({ confirmationStatus: 'NO_ANSWER' }))).toBe('NO_ANSWER');
    expect(deriveCoreState(order({ confirmationStatus: 'POSTPONED' }))).toBe('POSTPONED');
    expect(deriveCoreState(order({ confirmationStatus: 'REJECTED' }))).toBe('CANCELLED');
  });
});

describe('zone is derived, never stored', () => {
  it('maps every state to a zone', () => {
    expect(getZone('NEW')).toBe('INTAKE');
    expect(getZone('CLAIMED')).toBe('CONFIRMATION');
    expect(getZone('READY_TO_SHIP')).toBe('WAREHOUSE');
    expect(getZone('SHIPPED')).toBe('TRANSIT');
    expect(getZone('RETURNED')).toBe('CLOSED');
  });

  it('is a pure function of the state — same state, same zone', () => {
    expect(getZone(deriveCoreState(order({ confirmationStatus: 'CONFIRMED', shippingStatus: 'SHIPPED' })))).toBe('TRANSIT');
  });
});

describe('cancellation and void guards', () => {
  const shipped = order({ confirmationStatus: 'CONFIRMED', shippingStatus: 'SHIPPED', shippedAt: new Date() });

  it('refuses cancelling a shipped order', () => {
    const r = assertCancellable(shipped);
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('CANCEL_AFTER_SHIPPED');
  });

  it('allows cancelling before shipping', () => {
    expect(assertCancellable(order({ confirmationStatus: 'CONFIRMED' })).allowed).toBe(true);
  });

  it('refuses VOID for an order that ever reached shipping, even after return', () => {
    expect(assertVoidable(shipped).allowed).toBe(false);
    const returned = order({ shippingStatus: 'RETURNED', shippedAt: new Date('2026-01-01') });
    expect(assertVoidable(returned).allowed).toBe(false);
    expect(hasEverShipped(returned)).toBe(true);
  });

  it('allows VOID for an order still in intake', () => {
    expect(assertVoidable(order()).allowed).toBe(true);
  });
});

describe('READY_TO_SHIP requires every line reserved', () => {
  const confirmed = order({ confirmationStatus: 'CONFIRMED' });

  it('refuses when one line of two is short', () => {
    const r = assertReadyToShip(confirmed, [
      { quantity: 2, reservedQty: 2 },
      { quantity: 1, reservedQty: 0 },
    ]);
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('UNRESERVED_LINES');
  });

  it('counts gift units as stock that must be reserved', () => {
    expect(assertReadyToShip(confirmed, [{ quantity: 2, freeQuantity: 1, reservedQty: 2 }]).allowed).toBe(false);
    expect(assertReadyToShip(confirmed, [{ quantity: 2, freeQuantity: 1, reservedQty: 3 }]).allowed).toBe(true);
  });

  it('refuses an order with no lines at all', () => {
    expect(assertReadyToShip(confirmed, []).allowed).toBe(false);
  });

  it('refuses an unconfirmed order whatever the reservation says', () => {
    const r = assertReadyToShip(order(), [{ quantity: 1, reservedQty: 1 }]);
    expect(r.code).toBe('NOT_CONFIRMED');
  });
});

describe('order age', () => {
  it('measures time in the current state', () => {
    const entered = new Date('2026-09-20T10:00:00Z');
    expect(stateAgeMinutes(entered, new Date('2026-09-20T11:30:00Z'))).toBe(90);
    expect(stateAgeMinutes(null)).toBeNull();
  });
});
