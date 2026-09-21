import { describe, expect, it } from 'vitest';
import { orderSeal, sealedFieldsIn, sealMessage, SEALED_BATCH_STATUSES } from './order-seal';

/**
 * The line between "fix it" and "ask for it to be fixed".
 *
 * Get this wrong in one direction and the warehouse cannot correct a typo
 * in an address that is still sitting on a shelf. Get it wrong in the other
 * and somebody edits an order whose parcel is already on a van, and the
 * driver arrives at an address nobody told him about.
 */

const open = { shippingBatch: { status: 'READY', batchNumber: 'BATCH-2026-0007' } };
const handedOver = { shippingBatch: { status: 'SHIPPED', batchNumber: 'BATCH-2026-0007' } };
const settled = { shippingBatch: { status: 'CLOSED', batchNumber: 'BATCH-2026-0007' } };

describe('when an order is sealed', () => {
  it('is not sealed while the batch is still being filled', async () => {
    expect(orderSeal(open).sealed).toBe(false);
  });

  it('is sealed once the courier has taken the batch', () => {
    const seal = orderSeal(handedOver);
    expect(seal.sealed).toBe(true);
    expect(seal.batchNumber).toBe('BATCH-2026-0007');
  });

  it('stays sealed after settlement', () => {
    expect(orderSeal(settled).sealed).toBe(true);
  });

  it('is not sealed when it is in no batch at all', () => {
    // An order still being confirmed has no batch. It must stay editable —
    // that is the whole point of the confirmation call.
    expect(orderSeal({}).sealed).toBe(false);
    expect(orderSeal({ shippingBatch: null }).sealed).toBe(false);
  });

  it('treats an unknown batch status as open, not as sealed', () => {
    // Failing closed here would freeze orders on any new status somebody
    // adds later, silently, with no way to tell why.
    expect(orderSeal({ shippingBatch: { status: 'WHATEVER', batchNumber: 'B' } }).sealed).toBe(false);
  });
});

describe('what the seal covers', () => {
  it('refuses the things the courier is already acting on', () => {
    expect(sealedFieldsIn({ customerAddress: 'شارع آخر' })).toEqual(['customerAddress']);
    expect(sealedFieldsIn({ items: [] })).toEqual(['items']);
    expect(sealedFieldsIn({ shippingCost: 5 })).toEqual(['shippingCost']);
  });

  it('leaves alone the things that change nothing for the driver', () => {
    // Correcting a note does not send anybody to the wrong street.
    expect(
      sealedFieldsIn({
        internalNotes: 'اتصلت',
        customerNotes: 'يفضّل المساء',
        confirmationStatus: 'CONFIRMED',
        shippingStatus: 'DELIVERED',
        trackingCode: 'BC-9',
        channelId: 'ch',
        postponedUntil: null,
      })
    ).toEqual([]);
  });

  it('names every field it is refusing, not just the first', () => {
    // "Something in there is not allowed" leaves somebody guessing.
    const asked = sealedFieldsIn({ customerName: 'محمد', customerAddress: 'شارع', internalNotes: 'x' });
    expect(asked).toEqual(['customerName', 'customerAddress']);
  });

  it('ignores a field that was not sent at all', () => {
    expect(sealedFieldsIn({ customerName: undefined })).toEqual([]);
  });
});

describe('the refusal message', () => {
  it('says which batch, in Arabic, and what to do next', () => {
    const msg = sealMessage('BATCH-2026-0007', ['customerAddress', 'items']);
    expect(msg).toContain('BATCH-2026-0007');
    expect(msg).toContain('العنوان');
    expect(msg).toContain('أصناف الطلب');
    expect(msg).toContain('طلب تعديل');
  });

  it('still reads correctly with no batch number', () => {
    expect(sealMessage(undefined, ['customerName'])).toContain('اسم العميل');
  });
});

describe('the sealed statuses', () => {
  it('are exactly the two in which the goods have left', () => {
    expect([...SEALED_BATCH_STATUSES]).toEqual(['SHIPPED', 'CLOSED']);
  });
});
