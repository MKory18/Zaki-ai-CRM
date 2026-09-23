import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: { customer: { findFirst: vi.fn(), create: vi.fn() } },
}));
vi.mock('./db', () => ({ db }));

import { findCustomer, findOrCreateCustomer } from './customer-identity';

const seed = {
  companyId: 'c1',
  storeId: 's1',
  phone: '0912345678',
  rawPhone: '+963 912 345 678',
  fullName: 'سارة',
  address: 'دمشق، المزة',
  city: 'دمشق',
};

beforeEach(() => vi.clearAllMocks());

/**
 * The phone is the identity, and it identifies someone WITHIN A STORE.
 * Five doors created customers before this existed; the copy that drifted
 * would either make a duplicate or hang an order on the wrong person.
 */
describe('finding a customer', () => {
  it('looks in one store, never the whole company', async () => {
    db.customer.findFirst.mockResolvedValue(null);
    await findCustomer(db as never, 'c1', 's1', '0912345678');
    expect(db.customer.findFirst).toHaveBeenCalledWith({
      where: { companyId: 'c1', storeId: 's1', phone: '0912345678' },
    });
  });

  it('returns the existing one without creating a second', async () => {
    db.customer.findFirst.mockResolvedValue({ id: 'cu1' });
    expect(await findOrCreateCustomer(db as never, seed)).toEqual({ id: 'cu1' });
    expect(db.customer.create).not.toHaveBeenCalled();
  });

  it('creates one carrying its store', async () => {
    db.customer.findFirst.mockResolvedValue(null);
    db.customer.create.mockResolvedValue({ id: 'cu2' });
    await findOrCreateCustomer(db as never, seed);
    expect(db.customer.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'c1',
      storeId: 's1',
      phone: '0912345678',
    });
  });

  // Two visitors submitting the same number at the same moment is ordinary
  // on a landing page. The loser must read the winner's row, not fail an
  // order the customer already believes they placed.
  it('reads the winner when two creates race', async () => {
    db.customer.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'winner' });
    db.customer.create.mockRejectedValue({ code: 'P2002' });
    expect(await findOrCreateCustomer(db as never, seed)).toEqual({ id: 'winner' });
  });

  it('rethrows a P2002 that was NOT this phone — it is a different clash', async () => {
    db.customer.findFirst.mockResolvedValue(null);
    db.customer.create.mockRejectedValue({ code: 'P2002' });
    await expect(findOrCreateCustomer(db as never, seed)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rethrows anything that is not a uniqueness clash', async () => {
    db.customer.findFirst.mockResolvedValue(null);
    db.customer.create.mockRejectedValue(new Error('connection lost'));
    await expect(findOrCreateCustomer(db as never, seed)).rejects.toThrow('connection lost');
  });

  it('never writes a customer without a store', async () => {
    db.customer.findFirst.mockResolvedValue(null);
    db.customer.create.mockResolvedValue({ id: 'cu3' });
    await findOrCreateCustomer(db as never, seed);
    expect(db.customer.create.mock.calls[0][0].data.storeId).toBeTruthy();
  });
});
