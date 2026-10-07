import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A SORT POSITION IS CHEAP. THE HABIT IS NOT.
 *
 * Both channel doors declared `sortOrder: z.coerce.number().int().min(0).max(999)`,
 * and `z.coerce.number()` IS `Number()`: `'0x10'` → 16, `'0b11'` → 3,
 * `'0o17'` → 15, `''`/`null`/`[]` → 0, `true` → 1, `['5']` → 5.
 *
 * On THIS column every one of those is harmless. It moves a name up or down
 * a list, nothing is counted from it, and the figure lands inside the 0…999
 * window anyway. The audit's own reason for doing it in this pass is not the
 * harm: it is that `z.coerce.number()` is what the next developer copies out
 * of this file, and the same keystrokes on a price (82ecac3) and on a base
 * price (9f15044) are the defects somebody had to go and find afterwards.
 *
 * So these tests are deliberately about NOTATION and not about range: the
 * window is unchanged, and a test that claimed otherwise would be describing
 * a fix nobody made. Each case asserts the ROW HANDED TO PRISMA first, so a
 * failure prints the position that would have been stored.
 */

const { db, logAudit } = vi.hoisted(() => ({
  db: {
    orderChannel: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    order: { count: vi.fn() },
  },
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/auth', () => ({
  requireCompanyTenant: async () => ({ user: { id: 'admin', name: 'مدير' }, companyId: 'c1' }),
}));
vi.mock('@/lib/authorization', () => ({
  requirePermission: async () => undefined,
  can: () => true,
}));

import { POST } from './route';
import { PATCH } from './[id]/route';

const post = (body: unknown) =>
  POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }));

const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'ch1' }),
  });

const SOUND = { name: 'تيك توك' };

/** The position exactly as it reached the database. */
const created = () => db.orderChannel.create.mock.calls.map((c) => c[0].data.sortOrder);
const updated = () => db.orderChannel.update.mock.calls.map((c) => c[0].data.sortOrder);

beforeEach(() => {
  vi.clearAllMocks();
  db.orderChannel.findFirst.mockResolvedValue(null);
  db.orderChannel.create.mockResolvedValue({ id: 'ch-new', name: SOUND.name, kind: 'OTHER' });
  db.orderChannel.update.mockResolvedValue({ id: 'ch1', name: 'تيك توك', kind: 'TIKTOK', isActive: true });
  db.order.count.mockResolvedValue(0);
});

const PREFIXED = [
  ['0x10', 16],
  ['0X10', 16],
  ['0b11', 3],
  ['0B11', 3],
  ['0o17', 15],
  ['0O17', 15],
] as const;

describe('creating a channel: a position written in another notation is refused', () => {
  it.each(PREFIXED)('refuses «%s», which Number() reads as %i', async (typed, wouldStore) => {
    expect(Number(typed), 'the hazard is measured at the door, not remembered').toBe(wouldStore);
    const res = await post({ ...SOUND, sortOrder: typed });
    expect(
      created(),
      `«${typed}» was handed to Prisma as a position; Number() reads it as ${wouldStore}`
    ).toEqual([]);
    expect(res.status).toBe(400);
  });

  it("refuses the empty box, though Number('') is 0", async () => {
    expect(Number('')).toBe(0);
    const res = await post({ ...SOUND, sortOrder: '' });
    expect(created()).toEqual([]);
    expect(res.status).toBe(400);
  });

  it('refuses null, though Number(null) is 0', async () => {
    expect(Number(null)).toBe(0);
    const res = await post({ ...SOUND, sortOrder: null });
    expect(created()).toEqual([]);
    expect(res.status).toBe(400);
  });

  it("refuses a one-element array, though Number(['5']) is 5", async () => {
    expect(Number(['5'])).toBe(5);
    const res = await post({ ...SOUND, sortOrder: ['5'] });
    expect(created()).toEqual([]);
    expect(res.status).toBe(400);
  });

  it('refuses true, though Number(true) is 1', async () => {
    expect(Number(true)).toBe(1);
    const res = await post({ ...SOUND, sortOrder: true });
    expect(created()).toEqual([]);
    expect(res.status).toBe(400);
  });

  it('stores the position that was typed, and a numeric string from a form', async () => {
    expect((await post({ ...SOUND, sortOrder: 7 })).status).toBe(201);
    expect(created()).toEqual([7]);
    vi.clearAllMocks();
    db.orderChannel.findFirst.mockResolvedValue(null);
    db.orderChannel.create.mockResolvedValue({ id: 'ch-new', name: SOUND.name, kind: 'OTHER' });
    expect((await post({ ...SOUND, sortOrder: '7' })).status).toBe(201);
    expect(created()).toEqual([7]);
  });

  it('keeps the default of zero when no position was sent at all', async () => {
    const res = await post(SOUND);
    expect(res.status).toBe(201);
    expect(created()).toEqual([0]);
  });

  it('keeps the window it always had: 999 stores, 1000 does not', async () => {
    expect((await post({ ...SOUND, sortOrder: 999 })).status).toBe(201);
    expect(created()).toEqual([999]);
    vi.clearAllMocks();
    db.orderChannel.findFirst.mockResolvedValue(null);
    expect((await post({ ...SOUND, sortOrder: 1000 })).status).toBe(400);
    expect(created()).toEqual([]);
  });

  it('keeps refusing a fraction, because a position is a whole number', async () => {
    const res = await post({ ...SOUND, sortOrder: 2.5 });
    expect(created()).toEqual([]);
    expect(res.status).toBe(400);
  });
});

describe('editing a channel: the stored position survives a bad one', () => {
  beforeEach(() => {
    db.orderChannel.findFirst.mockResolvedValue({
      id: 'ch1',
      companyId: 'c1',
      name: 'تيك توك',
      kind: 'TIKTOK',
      isActive: true,
      sortOrder: 5,
    });
  });

  it.each(PREFIXED)('refuses «%s» rather than overwriting 5 with %i', async (typed, wouldStore) => {
    expect(Number(typed)).toBe(wouldStore);
    const res = await patch({ sortOrder: typed });
    expect(
      updated(),
      `the stored 5 would have been overwritten; Number() reads «${typed}» as ${wouldStore}`
    ).toEqual([]);
    expect(res.status).toBe(400);
  });

  it('writes the position that was typed', async () => {
    const res = await patch({ sortOrder: 3 });
    expect(res.status).toBe(200);
    expect(updated()).toEqual([3]);
  });

  it('does not touch the position when the request never mentions it — `.partial()` means absent', async () => {
    const res = await patch({ isActive: false });
    expect(res.status).toBe(200);
    expect(db.orderChannel.update.mock.calls[0][0].data).not.toHaveProperty('sortOrder');
  });

  it('a refused notation never reaches the database or the audit trail', async () => {
    const res = await patch({ sortOrder: '0x10' });
    expect(res.status).toBe(400);
    expect(db.orderChannel.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
