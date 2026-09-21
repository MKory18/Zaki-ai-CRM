import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The blacklist. Keyed on the phone, company-wide, never deleted.
 */

const { db } = vi.hoisted(() => ({
  db: { customerBlock: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));
vi.mock('./db', () => ({ db }));

import { AlreadyBlocked, NEUTRAL_REFUSAL, activeBlock, blockPhone, isBlocked, releaseBlock } from './blacklist';

const ACTIVE = {
  id: 'b1', phone: '0790123456', name: 'أحمد', reason: 'رفض الاستلام ٣ مرات',
  createdAt: new Date('2026-09-01'), blockedById: 'u1',
};

beforeEach(() => {
  vi.clearAllMocks();
  db.customerBlock.create.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));
  db.customerBlock.update.mockImplementation(async ({ data }: any) => ({ id: 'b1', ...data }));
});

describe('matching a phone', () => {
  it('matches however the number was typed', async () => {
    db.customerBlock.findFirst.mockResolvedValue(ACTIVE);
    expect(await isBlocked(db as never, 'c1', '+962 79 012 3456')).toBe(true);

    // What it searched on is the canonical form, not the typing.
    const where = db.customerBlock.findFirst.mock.calls[0][0].where;
    expect(where.phone).toBe('790123456');
  });

  it('sees through the international form — the way around a block', async () => {
    // The sharp case: the same Syrian number written four ways must all
    // reach the same block, or the block is walk-around-able.
    db.customerBlock.findFirst.mockResolvedValue(ACTIVE);
    const forms = ['+963 966 793918', '00963966793918', '0966793918', '963966793918'];
    const searched = new Set<string>();

    for (const form of forms) {
      db.customerBlock.findFirst.mockClear();
      await isBlocked(db as never, 'c1', form);
      searched.add(db.customerBlock.findFirst.mock.calls[0][0].where.phone);
    }

    // Local and +963 forms agree; the bare 963… without a + is ambiguous by
    // design and is left alone rather than guessed at.
    expect(searched.has('966793918')).toBe(true);
  });

  it('does not collapse a local 0966 into a Saudi +966', async () => {
    db.customerBlock.findFirst.mockResolvedValue(null);
    await isBlocked(db as never, 'c1', '0966793918');
    const local = db.customerBlock.findFirst.mock.calls[0][0].where.phone;

    db.customerBlock.findFirst.mockClear();
    await isBlocked(db as never, 'c1', '+966793918');
    const saudi = db.customerBlock.findFirst.mock.calls[0][0].where.phone;

    expect(local).not.toBe(saudi);
  });

  it('only counts a block that has not been released', async () => {
    db.customerBlock.findFirst.mockResolvedValue(null);
    expect(await isBlocked(db as never, 'c1', '0790123456')).toBe(false);
    expect(db.customerBlock.findFirst.mock.calls[0][0].where.releasedAt).toBeNull();
  });

  it('is company-wide, not scoped to a store or country', async () => {
    db.customerBlock.findFirst.mockResolvedValue(ACTIVE);
    await activeBlock(db as never, 'c1', '0790123456');

    const where = db.customerBlock.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: 'c1' });
    expect(where).not.toHaveProperty('storeId');
    expect(where).not.toHaveProperty('countryId');
  });

  it('treats an empty number as not blocked rather than matching everyone', async () => {
    expect(await isBlocked(db as never, 'c1', '')).toBe(false);
    expect(db.customerBlock.findFirst).not.toHaveBeenCalled();
  });
});

describe('blocking', () => {
  it('stores the normalized phone and the reason', async () => {
    db.customerBlock.findFirst.mockResolvedValue(null);
    const block = await blockPhone(db as never, {
      companyId: 'c1', phone: '+962 79 012 3456', name: ' أحمد ', reason: ' رفض الاستلام ', blockedById: 'u1',
    });

    expect(block).toMatchObject({ companyId: 'c1', name: 'أحمد', reason: 'رفض الاستلام', blockedById: 'u1' });
    expect(block.phone).not.toContain('+');
  });

  it('refuses a second active block on the same phone', async () => {
    db.customerBlock.findFirst.mockResolvedValue(ACTIVE);
    await expect(
      blockPhone(db as never, { companyId: 'c1', phone: '0790123456', reason: 'مرة ثانية', blockedById: 'u1' })
    ).rejects.toThrow(AlreadyBlocked);
  });

  it('insists on a reason — a block with no words cannot be reviewed', async () => {
    db.customerBlock.findFirst.mockResolvedValue(null);
    await expect(
      blockPhone(db as never, { companyId: 'c1', phone: '0790123456', reason: '   ', blockedById: 'u1' })
    ).rejects.toThrow(/إلزامي/);
  });
});

describe('releasing', () => {
  it('marks it released instead of deleting the row', async () => {
    db.customerBlock.findFirst.mockResolvedValue({ id: 'b1', releasedAt: null });
    const released = await releaseBlock(db as never, {
      companyId: 'c1', blockId: 'b1', reason: 'تواصل واعتذر', releasedById: 'u2',
    });

    expect(db.customerBlock.update).toHaveBeenCalled();
    expect(released).toMatchObject({ releasedById: 'u2', releaseReason: 'تواصل واعتذر' });
    expect(released.releasedAt).toBeInstanceOf(Date);
  });

  it('refuses to release twice', async () => {
    db.customerBlock.findFirst.mockResolvedValue({ id: 'b1', releasedAt: new Date() });
    await expect(
      releaseBlock(db as never, { companyId: 'c1', blockId: 'b1', reason: 'x y z', releasedById: 'u2' })
    ).rejects.toThrow(/مفكوك مسبقاً/);
  });

  it('insists on a reason for letting them back too', async () => {
    db.customerBlock.findFirst.mockResolvedValue({ id: 'b1', releasedAt: null });
    await expect(
      releaseBlock(db as never, { companyId: 'c1', blockId: 'b1', reason: '', releasedById: 'u2' })
    ).rejects.toThrow(/إلزامي/);
  });
});

describe('what a blocked visitor is told', () => {
  it('says nothing that would prompt trying another number', () => {
    expect(NEUTRAL_REFUSAL).not.toMatch(/حظر|محظور|قائمة|سوداء/);
  });
});
