import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, adapterFor, logAudit } = vi.hoisted(() => ({
  db: {
    shippingBatch: { findFirst: vi.fn() },
    order: { findMany: vi.fn(), update: vi.fn() },
    orderActivity: { create: vi.fn() },
    deliveryFee: { findMany: vi.fn() },
  },
  adapterFor: vi.fn(),
  logAudit: vi.fn(),
}));
vi.mock('./db', () => ({ db }));
vi.mock('./couriers', () => ({ adapterFor: (...a: unknown[]) => adapterFor(...a) }));
vi.mock('./audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { dispatchBatch } from './courier-dispatch';

/**
 * Handing orders to the courier and taking back the barcode.
 *
 * The expensive mistakes here are physical: a second create is a second
 * parcel, billed and collected twice, with a customer opening the door to a
 * duplicate. And an all-or-nothing dispatch holds seventeen good parcels
 * hostage to one bad phone number.
 */

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1', orderNumber: 'SY-2026-0001', merchantRef: 'SY-2026-0001',
  trackingNumber: null, totalAmount: 60, currency: 'USD',
  quantity: 2, freeQuantity: 1, customerNotes: null, deliveryProviderId: 'p1',
  customer: { fullName: 'زبون', rawPhone: '0999111222', phone: '999111222', address: 'شارع' },
  region: { name: 'دمشق' },
  ...over,
});

const createShipment = vi.fn();
const input = { batchId: 'b1', companyId: 'c1', storeId: 's1', userId: 'u1' };

beforeEach(() => {
  vi.clearAllMocks();
  db.shippingBatch.findFirst.mockResolvedValue({
    id: 'b1', batchNumber: 'BATCH-2026-0001',
    provider: { id: 'p1', code: 'BASHA', apiEnabled: true, companyId: 'c1', storeId: null },
  });
  adapterFor.mockReturnValue({ code: 'LOGESTECHS', automated: true, createShipment });
  createShipment.mockResolvedValue({ trackingNumber: 'BC-777' });
  db.order.update.mockResolvedValue({});
  db.deliveryFee.findMany.mockResolvedValue([]);
});

describe('dispatching a batch', () => {
  it('stores the courier barcode as the tracking number', async () => {
    db.order.findMany.mockResolvedValue([order()]);
    const res = await dispatchBatch(input);
    expect(res.sent).toBe(1);
    expect(db.order.update.mock.calls[0][0].data.trackingNumber).toBe('BC-777');
  });

  it('sends OUR order number as the merchant reference', async () => {
    // That is the key their statement line is matched back on.
    db.order.findMany.mockResolvedValue([order()]);
    await dispatchBatch(input);
    expect(createShipment.mock.calls[0][0].merchantRef).toBe('SY-2026-0001');
  });

  it('counts gift units as pieces — they are parcels too', async () => {
    db.order.findMany.mockResolvedValue([order()]);
    await dispatchBatch(input);
    expect(createShipment.mock.calls[0][0].pieces).toBe(3);
  });

  it('sends the phone as the customer typed it', async () => {
    // Couriers dial it, and the normalized form can lose the leading zero
    // their system expects.
    db.order.findMany.mockResolvedValue([order()]);
    await dispatchBatch(input);
    expect(createShipment.mock.calls[0][0].customer.phone).toBe('0999111222');
  });

  it('never creates a second parcel for an order that already has one', async () => {
    // The whole reason this is not a blind retry: a duplicate is a real
    // parcel, billed and collected twice.
    db.order.findMany.mockResolvedValue([order({ trackingNumber: 'BC-OLD' })]);
    const res = await dispatchBatch(input);
    expect(createShipment).not.toHaveBeenCalled();
    expect(res.outcomes[0].skipped).toBe('ALREADY_SENT');
    expect(res.sent).toBe(0);
  });

  it('ships the good ones when one fails', async () => {
    db.order.findMany.mockResolvedValue([
      order({ id: 'o1', orderNumber: 'SY-1' }),
      order({ id: 'o2', orderNumber: 'SY-2' }),
      order({ id: 'o3', orderNumber: 'SY-3' }),
    ]);
    createShipment
      .mockResolvedValueOnce({ trackingNumber: 'BC-1' })
      .mockRejectedValueOnce(new Error('LOGESTECHS_CITY_UNKNOWN: لم يُعرف رمز المدينة'))
      .mockResolvedValueOnce({ trackingNumber: 'BC-3' });

    const res = await dispatchBatch(input);
    expect(res.sent).toBe(2);
    expect(res.failed).toBe(1);
    expect(db.order.update).toHaveBeenCalledTimes(2);
  });

  it("keeps the courier's own words about why", async () => {
    // "city unknown" and "invalid phone" are different problems; a generic
    // failure teaches nobody anything.
    db.order.findMany.mockResolvedValue([order()]);
    createShipment.mockRejectedValue(new Error('LOGESTECHS_CITY_UNKNOWN: لم يُعرف رمز المدينة'));
    const res = await dispatchBatch(input);
    expect(res.outcomes[0].error).toContain('CITY_UNKNOWN');
  });

  it('does not call a manual courier that has no API', async () => {
    adapterFor.mockReturnValue({ code: 'MANUAL', automated: false, createShipment });
    db.order.findMany.mockResolvedValue([order()]);
    const res = await dispatchBatch(input);
    expect(createShipment).not.toHaveBeenCalled();
    expect(res.outcomes[0].skipped).toBe('NOT_AUTOMATED');
  });

  it('skips an order with no courier assigned', async () => {
    db.order.findMany.mockResolvedValue([order({ deliveryProviderId: null })]);
    const res = await dispatchBatch(input);
    expect(res.outcomes[0].skipped).toBe('NO_PROVIDER');
  });

  it('refuses a batch of another company', async () => {
    db.shippingBatch.findFirst.mockResolvedValue(null);
    await expect(dispatchBatch(input)).rejects.toThrow('BATCH_NOT_FOUND');
  });

  it('can be narrowed to a retry of named orders', async () => {
    db.order.findMany.mockResolvedValue([order()]);
    await dispatchBatch({ ...input, orderIds: ['o1'] });
    expect(db.order.findMany.mock.calls[0][0].where.id).toEqual({ in: ['o1'] });
  });
});


/**
 * The courier's own id for the destination.
 *
 * Their API will not take a shipment without it. Before this, the adapter
 * searched their system by the region's Arabic name on every single parcel
 * — a round trip needing their password, and a match that takes the first
 * of several hits when a governorate and a district share a name.
 */
describe("addressing a parcel with the courier's own city id", () => {
  it('sends the id agreed for that region', async () => {
    db.deliveryFee.findMany.mockResolvedValue([{ regionId: 'r1', courierCityId: 566090 }]);
    db.order.findMany.mockResolvedValue([order({ regionId: 'r1' })]);
    await dispatchBatch(input);
    expect(createShipment.mock.calls[0][0].cityId).toBe(566090);
  });

  it('leaves the adapter to ask when we hold no id for that region', async () => {
    db.deliveryFee.findMany.mockResolvedValue([{ regionId: 'elsewhere', courierCityId: 566090 }]);
    db.order.findMany.mockResolvedValue([order({ regionId: 'r1' })]);
    await dispatchBatch(input);
    // undefined, not someone else's city: a parcel sent to the wrong
    // governorate is only discovered when the driver calls.
    expect(createShipment.mock.calls[0][0].cityId).toBeUndefined();
  });

  it('reads the ids once for the batch, not once per parcel', async () => {
    db.deliveryFee.findMany.mockResolvedValue([{ regionId: 'r1', courierCityId: 566090 }]);
    db.order.findMany.mockResolvedValue([
      order({ id: 'o1', regionId: 'r1' }),
      order({ id: 'o2', regionId: 'r1' }),
      order({ id: 'o3', regionId: 'r1' }),
    ]);
    await dispatchBatch(input);
    expect(db.deliveryFee.findMany).toHaveBeenCalledOnce();
  });
});


/**
 * Each store holds its OWN account with the same courier. Creating a parcel
 * under another store's row means their login, their statement and their
 * money — discovered when the collection lands in the wrong books.
 *
 * The pickers only offer the right couriers. These are the calls that go
 * round the pickers.
 */
describe("a courier that is not this store's", () => {
  it('refuses a courier owned by another store', async () => {
    db.shippingBatch.findFirst.mockResolvedValue({
      id: 'b1', batchNumber: 'BATCH-2026-0001',
      provider: { id: 'p1', code: 'BASHA', apiEnabled: true, companyId: 'c1', storeId: 'OTHER-STORE' },
    });
    await expect(dispatchBatch(input)).rejects.toThrow('COURIER_NOT_IN_STORE');
    expect(createShipment).not.toHaveBeenCalled();
  });

  it('allows one shared across every store', async () => {
    db.order.findMany.mockResolvedValue([order()]);
    await dispatchBatch(input);
    expect(createShipment).toHaveBeenCalledOnce();
  });

  it("allows the store's own", async () => {
    db.shippingBatch.findFirst.mockResolvedValue({
      id: 'b1', batchNumber: 'BATCH-2026-0001',
      provider: { id: 'p1', code: 'BASHA', apiEnabled: true, companyId: 'c1', storeId: 's1' },
    });
    db.order.findMany.mockResolvedValue([order()]);
    await dispatchBatch(input);
    expect(createShipment).toHaveBeenCalledOnce();
  });
});
