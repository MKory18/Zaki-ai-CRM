import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, adapterFor, logAudit } = vi.hoisted(() => ({
  db: {
    shippingBatch: { findFirst: vi.fn() },
    order: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    orderActivity: { create: vi.fn() },
    deliveryFee: { findMany: vi.fn() },
    /*
     * The claim is one conditional UPDATE … RETURNING, so the double has to
     * speak raw SQL. `$queryRaw` is called as a tagged template: the first
     * argument is the SQL fragments, the rest the values.
     */
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
  adapterFor: vi.fn(),
  logAudit: vi.fn(),
}));
vi.mock('./db', () => ({ db }));
vi.mock('./couriers', () => ({ adapterFor: (...a: unknown[]) => adapterFor(...a) }));
vi.mock('./audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { dispatchBatch } from './courier-dispatch';
import { markOutcomeUnknown } from './couriers/types';

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
    provider: { id: 'p1', code: 'BASHA', apiEnabled: true, companyId: 'c1', storeId: 's1' },
  });
  adapterFor.mockReturnValue({ code: 'LOGESTECHS', automated: true, createShipment });
  createShipment.mockResolvedValue({ trackingNumber: 'BC-777' });
  db.order.update.mockResolvedValue({});
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.deliveryFee.findMany.mockResolvedValue([]);
  // By default the claim is won: the ordinary case is one dispatcher.
  db.$queryRaw.mockImplementation(async (frags: string[]) =>
    frags.join(' ').includes('UPDATE') ? [{ id: 'o1' }] : [{ tracking: null }]
  );
  db.$executeRaw.mockResolvedValue(1);
});

/** The SQL of each raw call, whitespace-flattened, with its values. */
const raw = (fn: { mock: { calls: unknown[][] } }) =>
  fn.mock.calls.map((c) => ({
    sql: (c[0] as string[]).join(' ? ').replace(/\s+/g, ' ').trim(),
    args: c.slice(1),
  }));

describe('dispatching a batch', () => {
  it('stores the courier barcode as the tracking number', async () => {
    db.order.findMany.mockResolvedValue([order()]);
    const res = await dispatchBatch(input);
    expect(res.sent).toBe(1);
    expect(db.order.updateMany.mock.calls[0][0].data.trackingNumber).toBe('BC-777');
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
    expect(db.order.updateMany).toHaveBeenCalledTimes(2);
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

  // Not placed in a store is usable by NOBODY. A row nobody owns being
  // usable by everybody is the leak this exists to close.
  it('refuses one that was never placed in a store', async () => {
    db.shippingBatch.findFirst.mockResolvedValue({
      id: 'b1', batchNumber: 'BATCH-2026-0001',
      provider: { id: 'p1', code: 'BASHA', apiEnabled: true, companyId: 'c1', storeId: null },
    });
    await expect(dispatchBatch(input)).rejects.toThrow('COURIER_NOT_IN_STORE');
    expect(createShipment).not.toHaveBeenCalled();
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

/**
 * TWO PEOPLE PRESSING «DISPATCH» ON ONE BATCH.
 *
 * The old guard read `trackingNumber` once, before the loop, and trusted it
 * for the whole run. Two runs overlapping therefore both saw null, both
 * created a parcel at the courier, and the second barcode overwrote the
 * first — leaving a real parcel, billed and out for delivery, that nothing
 * in this system could name. The row is claimed now, and the database, not
 * the snapshot, decides who won.
 */
describe('one parcel per order, decided by the row and not by the snapshot', () => {
  beforeEach(() => {
    db.order.findMany.mockResolvedValue([order()]);
  });

  it('claims the order before a word is said to the courier', async () => {
    await dispatchBatch(input);
    const claim = raw(db.$queryRaw)[0];
    expect(claim.sql).toMatch(/UPDATE "orders"[\s\S]*courier_send_started_at/);
    // Both conditions, or the claim is not a claim: an order already sent
    // and an order already claimed must BOTH fail to be taken.
    expect(claim.sql).toContain('"trackingNumber" IS NULL');
    expect(claim.sql).toContain('"courier_send_started_at" IS NULL');
    expect(claim.args).toEqual(['o1']);
    expect(
      db.$queryRaw.mock.invocationCallOrder[0],
      'كُلِّمت الشركةُ قبل حجز الطلب'
    ).toBeLessThan(createShipment.mock.invocationCallOrder[0]);
  });

  it('leaves the parcel alone when another run already holds it', async () => {
    db.$queryRaw.mockImplementation(async (frags: string[]) =>
      frags.join(' ').includes('UPDATE') ? [] : [{ tracking: null }]
    );
    const res = await dispatchBatch(input);
    expect(createShipment, 'أرسلت طرداً ثانياً لطلبٍ قيد الإرسال').not.toHaveBeenCalled();
    expect(res.outcomes[0].skipped).toBe('SEND_IN_FLIGHT');
    expect(res.skipped).toBe(1);
  });

  it('calls it already sent when the row turns out to carry a barcode', async () => {
    db.$queryRaw.mockImplementation(async (frags: string[]) =>
      frags.join(' ').includes('UPDATE') ? [] : [{ tracking: 'BC-EARLIER' }]
    );
    const res = await dispatchBatch(input);
    expect(createShipment).not.toHaveBeenCalled();
    expect(res.outcomes[0].skipped).toBe('ALREADY_SENT');
  });

  it('never overwrites a barcode that arrived while the courier was answering', async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });
    const res = await dispatchBatch(input);
    // Two parcels exist now. Saying so is the only honest outcome —
    // overwriting would erase the first one's number for good.
    expect(res.sent).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.outcomes[0].error).toContain('BC-777');
  });

  it('records the barcode only while the order still has none', async () => {
    await dispatchBatch(input);
    expect(db.order.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'o1', trackingNumber: null });
  });
});

/**
 * A REFUSAL AND A SILENCE ARE DIFFERENT NEWS.
 *
 * «Unknown city» means nothing was created: fix the field, send again. A
 * request that timed out may have created the parcel and simply not said
 * so — pressing retry on THAT is how one order becomes two waybills.
 */
describe('what happens to the claim when the call fails', () => {
  beforeEach(() => {
    db.order.findMany.mockResolvedValue([order()]);
  });

  it('gives the order back after a refusal, so the correction can be sent', async () => {
    createShipment.mockRejectedValue(new Error('LOGESTECHS_CITY_UNKNOWN: لم يُعرف رمز المدينة'));
    const res = await dispatchBatch(input);
    expect(raw(db.$executeRaw)[0]?.sql, 'لم يُفكّ الحجز بعد رفضٍ صريح').toMatch(
      /UPDATE "orders"[\s\S]*courier_send_started_at" = NULL/
    );
    expect(res.outcomes[0].outcomeUnknown).toBeUndefined();
  });

  it('keeps the claim when the courier never answered, and says why', async () => {
    const timedOut = markOutcomeUnknown(new Error('LOGESTECHS_TIMEOUT: لم تردّ شركةُ الشحن'));
    createShipment.mockRejectedValue(timedOut);
    const res = await dispatchBatch(input);
    expect(db.$executeRaw, 'فكَّ الحجزَ بعد صمتٍ — الضغطةُ التالية تصنع طرداً ثانياً').not.toHaveBeenCalled();
    expect(res.outcomes[0].outcomeUnknown).toBe(true);
    expect(res.outcomes[0].error).toContain('اسأل الشركة');
  });

  it('counts an unknown outcome as a failure, not as a quiet skip', async () => {
    createShipment.mockRejectedValue(markOutcomeUnknown(new Error('LOGESTECHS_TIMEOUT')));
    const res = await dispatchBatch(input);
    // It must appear in the failed count: a number the operator reads as
    // «nothing to do here» would bury the one parcel that needs a call.
    expect(res.failed).toBe(1);
    expect(res.skipped).toBe(0);
  });
});
