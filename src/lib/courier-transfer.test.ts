import { describe, expect, it } from 'vitest';
import { planTransfer, requiresOpenBatch, TransferRefused } from './courier-transfer';

/**
 * Moving a parcel that is already out of the building.
 *
 * The expensive mistake is treating a company like an agent. The agent is
 * standing at the counter: handing the parcel on IS taking it back. A
 * company has it under their own barcode, in their own system, and it will
 * appear on their statement — so the parcel has to physically come back and
 * a replacement goes out, or we end up with one order and two parcels and
 * no way to say which one the customer paid for.
 */

const agent = { id: 'a1', name: 'أبو علي', kind: 'AGENT' as const };
const basha = { id: 'c1', name: 'باشا', kind: 'COMPANY' as const };
const aramex = { id: 'c2', name: 'أرامكس', kind: 'COMPANY' as const };

describe('away from an agent', () => {
  it('is one move that keeps the order number', () => {
    const plan = planTransfer({ from: agent, to: basha, shippingStatus: 'SHIPPED' });
    expect(plan.mode).toBe('DIRECT');
    expect(plan.closeAs).toBe('RECEIVED_FROM_AGENT');
  });
});

describe('away from a company', () => {
  it('takes the parcel back and raises a replacement', () => {
    const plan = planTransfer({ from: basha, to: aramex, shippingStatus: 'SHIPPED' });
    expect(plan.mode).toBe('REPLACE');
    expect(plan.originalStatus).toBe('RETURN_REQUESTED');
  });

  it('does the same when handing to an agent — the parcel is still theirs', () => {
    expect(planTransfer({ from: basha, to: agent, shippingStatus: 'SHIPPED' }).mode).toBe('REPLACE');
  });
});

describe('what it refuses', () => {
  it('refuses an order that is with nobody', () => {
    expect(() => planTransfer({ from: null, to: basha, shippingStatus: 'SHIPPED' })).toThrow(TransferRefused);
  });

  it('refuses moving it to where it already is', () => {
    expect(() => planTransfer({ from: basha, to: basha, shippingStatus: 'SHIPPED' })).toThrow(TransferRefused);
  });

  it('refuses once the journey is over', () => {
    // Delivered, returned or cancelled: whatever is owed is owed, and
    // moving it now would rewrite a settled fact.
    for (const status of ['DELIVERED', 'RETURNED', 'CANCELLED']) {
      expect(() => planTransfer({ from: basha, to: aramex, shippingStatus: status }), status).toThrow(
        TransferRefused
      );
    }
  });

  it('allows it from a failed delivery — that is exactly when you move it', () => {
    expect(planTransfer({ from: basha, to: aramex, shippingStatus: 'FAILED_DELIVERY' }).mode).toBe('REPLACE');
  });
});

describe('needing a trolley to put it on', () => {
  it('requires an open batch when handing to a company', () => {
    // Otherwise it sits assigned to somebody who has not agreed to carry
    // anything today — invisible on every batch screen and nobody's job.
    expect(requiresOpenBatch(basha)).toBe(true);
  });

  it('does not make an agent wait for one', () => {
    // He takes it by hand, now. Paperwork standing in front of a man at
    // the counter is not a rule worth having.
    expect(requiresOpenBatch(agent)).toBe(false);
  });
});
