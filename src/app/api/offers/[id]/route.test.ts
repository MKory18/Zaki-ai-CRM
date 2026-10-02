import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AN EDIT WRITES WHAT THE EDITOR SENT, AND NOT ONE COLUMN MORE.
 *
 * This door used to destroy configuration on the most ordinary action there
 * is. Zod keeps a field's `.default()` through `.partial()`, so every
 * defaulted field came back from the schema PRESENT carrying its default
 * instead of the stored value, and this route's merge — `input.x !==
 * undefined ? { x } : {}` — wrote all of them.
 *
 * MEASURED on the golden-path offer «قطعتان بحسم ٣» (quantity 2, discount
 * 3, the preselected bundle): dragging it one place up the list sent
 * `PATCH { sortOrder: 1 }` and the row that landed was one piece, no
 * discount, no longer the default, forced back to ACTIVE. No error, nothing
 * in the request asking for it, and nothing in the screen showing it had
 * happened.
 *
 * The schema fix is pinned in `src/lib/offers.test.ts`. What is pinned HERE
 * is the thing the admin actually does: the data block that reaches the
 * database. A schema that stops inventing values is only half the
 * guarantee if the route goes on writing them.
 */

const { db, logAudit } = vi.hoisted(() => ({
  db: {
    offer: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    order: { count: vi.fn() },
    $transaction: vi.fn(),
  },
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit }));
vi.mock('@/lib/geo-context', () => ({
  requireContext: async () => ({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' }),
}));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));

import { PATCH } from './route';

/** «قطعتان بحسم ٣», exactly as the golden path stores it. */
const STORED = {
  id: 'of1',
  companyId: 'c1',
  productId: 'p1',
  name: 'قطعتان بحسم ٣',
  quantity: 2,
  freeQuantity: 0,
  sellingPrice: 25,
  compareAtPrice: 30,
  endsAt: null,
  discount: 3,
  deliveryIncluded: true,
  isDefault: true,
  sortOrder: 5,
  status: 'ACTIVE',
};

const patch = (body: unknown) =>
  PATCH(
    new Request('http://localhost/api/offers/of1', { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'of1' }) }
  );

/** The `data` block the route handed Prisma — the row as it was written. */
const written = () => db.offer.update.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  db.offer.findFirst.mockResolvedValue(STORED);
  db.offer.update.mockImplementation(async ({ data }: { data: object }) => ({ ...STORED, ...data }));
  db.offer.updateMany.mockResolvedValue({ count: 0 });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});

describe('dragging an offer up the list', () => {
  it('writes the new position and leaves every other column alone', async () => {
    const res = await patch({ sortOrder: 1 });
    expect(res.status).toBe(200);
    expect(db.offer.update).toHaveBeenCalledTimes(1);
    expect(written()).toEqual({ sortOrder: 1 });
  });

  it('and specifically does not write back the defaults it used to', async () => {
    await patch({ sortOrder: 1 });
    const data = written();
    // Each of these was written on every reorder, with the value in brackets.
    expect('quantity' in data).toBe(false); // was 1, over a stored 2
    expect('discount' in data).toBe(false); // was 0, over a stored 3
    expect('isDefault' in data).toBe(false); // was false, over a stored true
    expect('status' in data).toBe(false); // was 'ACTIVE', whatever was stored
    expect('freeQuantity' in data).toBe(false);
    expect('deliveryIncluded' in data).toBe(false);
    expect('name' in data).toBe(false);
    expect('sellingPrice' in data).toBe(false);
    expect('compareAtPrice' in data).toBe(false);
    expect('endsAt' in data).toBe(false);
  });

  it('and the row that comes back still describes the same bundle', async () => {
    const res = await patch({ sortOrder: 1 });
    const body = await res.json();
    expect(body.offer).toMatchObject({
      name: 'قطعتان بحسم ٣',
      quantity: 2,
      discount: 3,
      isDefault: true,
      sortOrder: 1,
    });
  });
});

describe('the other edits the offers screen sends on their own', () => {
  it('retiring a bundle touches only its status', async () => {
    await patch({ status: 'INACTIVE' });
    expect(written()).toEqual({ status: 'INACTIVE' });
  });

  it('choosing the default touches only the flag — and clears the others', async () => {
    await patch({ isDefault: true });
    expect(written()).toEqual({ isDefault: true });
    // Exactly one default per product is still enforced inside the same
    // transaction; the narrower merge must not have cost that.
    expect(db.offer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: 'p1', isDefault: true }),
        data: { isDefault: false },
      })
    );
  });

  it('renaming writes a trimmed name and nothing else', async () => {
    await patch({ name: '  قطعتان بحسم ٤  ' });
    expect(written()).toEqual({ name: 'قطعتان بحسم ٤' });
  });

  it('clearing the struck-through price writes null, because null was sent', async () => {
    await patch({ compareAtPrice: null });
    expect(written()).toEqual({ compareAtPrice: null });
  });
});

describe('and the money rule still shuts this door', () => {
  it('refuses a discount that reaches the stored price, writing nothing', async () => {
    const res = await patch({ discount: 30 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('25') });
    expect(db.offer.update).not.toHaveBeenCalled();
  });

  it('refuses a price dropped under the discount the row already has', async () => {
    const res = await patch({ sellingPrice: 2 });
    expect(res.status).toBe(400);
    expect(db.offer.update).not.toHaveBeenCalled();
  });

  it('accepts the two changed together when they agree', async () => {
    await patch({ sellingPrice: 40, discount: 30 });
    expect(written()).toEqual({ sellingPrice: 40, discount: 30 });
  });
});

describe('what the audit log would let somebody find out', () => {
  it('keeps the whole row before and after, so an overwrite is recoverable', async () => {
    await patch({ sortOrder: 1 });
    expect(logAudit).toHaveBeenCalledTimes(1);
    const entry = logAudit.mock.calls[0][0];
    expect(entry.action).toBe('OFFER_UPDATED');
    expect(entry.entityId).toBe('of1');
    // No field-level diff is recorded — but both snapshots are, so the
    // difference between them is the diff. Had the wipe happened, the log
    // would show quantity 2 → 1 and discount 3 → 0 to anybody who compared.
    expect(entry.previousData).toMatchObject({ quantity: 2, discount: 3, isDefault: true });
    expect(entry.newData).toMatchObject({ quantity: 2, discount: 3, isDefault: true, sortOrder: 1 });
  });
});
