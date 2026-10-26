import { describe, expect, it, vi } from 'vitest';
import { canonicalPhone, phoneKeys, phoneKeysAnyStore } from './phone-rules';
import { formatPhoneNumber, normalizePhoneNumber } from './phone';
import { waNumber } from './message-templates';
import { findCustomer } from './customer-identity';
import { activeBlock, blockPhone } from './blacklist';

/**
 * RV136 — «احفظو بالرمز… بدايتو 00 او +». A Jordanian line ordering from a Syrian store was stored `791234567`, shown
 * «0791234567» and messaged «963791…» — a number that is nobody. Given the store's country, a foreign number written
 * with + or 00 keeps its own code; the store's own code is still dropped; and the older code-less form still finds
 * the same customer and the same block.
 */

describe('storing', () => {
  it('a foreign number written with + or 00 keeps its code in a store of another country', () => {
    expect(canonicalPhone('+962 79 123 4567', 'SY')).toBe('962791234567');
    expect(canonicalPhone('00962791234567', 'SY')).toBe('962791234567');
    expect(normalizePhoneNumber('+966 51 234 5678', 'SY')).toBe('966512345678');
  });

  it('the store’s own code is still dropped, and a local number only loses its trunk zero', () => {
    expect(canonicalPhone('+963 966 793918', 'SY')).toBe('966793918');
    expect(canonicalPhone('0966793918', 'SY')).toBe('966793918');
    expect(canonicalPhone('+962791234567', 'JO')).toBe('791234567');
  });

  it('NEGATIVE: without a country (a search) the old reading stands — nothing that searched breaks', () => {
    expect(canonicalPhone('+962791234567')).toBe('791234567');
  });

  it('NEGATIVE: a local Syrian 0966… is never read as Saudi, with or without the country', () => {
    expect(canonicalPhone('0966793918', 'SY')).toBe('966793918');
    expect(phoneKeys('966793918')).toEqual(['966793918']);
  });
});

describe('showing and messaging', () => {
  it('reads back with its own code, and WhatsApp gets the number itself — not «963791…»', () => {
    expect(formatPhoneNumber('962791234567', 'SY')).toBe('+962791234567');
    expect(waNumber('962791234567', '963')).toBe('962791234567');
  });
});

describe('matching the older form', () => {
  it('a number stored with its code also answers to the form it had before', () => {
    expect(phoneKeys('962791234567')).toEqual(['962791234567', '791234567']);
    expect(phoneKeys('905321234567')).toEqual(['905321234567']); // a Turkish line had its code all along
    expect(phoneKeysAnyStore('+962791234567')).toEqual(['962791234567', '791234567']);
  });

  it('the customer who ordered as 791234567 is the same customer ordering as 962791234567', async () => {
    const findFirst = vi.fn(async ({ where }: { where: { phone: unknown } }) =>
      typeof where.phone === 'object' ? { id: 'old', phone: '791234567' } : null
    );
    const found = await findCustomer({ customer: { findFirst } } as never, 'co', 'st', '962791234567');
    expect(found).toMatchObject({ id: 'old' });
    expect(findFirst.mock.calls[1][0].where).toMatchObject({ companyId: 'co', storeId: 'st', phone: { in: ['791234567'] } });
  });

  it('NEGATIVE: the exact form wins, and a national number asks nothing more', async () => {
    const findFirst = vi.fn(async () => ({ id: 'exact' }));
    expect(await findCustomer({ customer: { findFirst } } as never, 'co', 'st', '962791234567')).toMatchObject({ id: 'exact' });
    expect(findFirst).toHaveBeenCalledTimes(1);
    const none = vi.fn(async () => null);
    expect(await findCustomer({ customer: { findFirst: none } } as never, 'co', 'st', '966793918')).toBeNull();
    expect(none).toHaveBeenCalledTimes(1);
  });

  it('a block holds whichever form it was written in and whichever store the order comes from', async () => {
    const findFirst = vi.fn(async () => null);
    await activeBlock({ customerBlock: { findFirst } } as never, 'co', '+962791234567', 'SY');
    expect((findFirst.mock.calls[0] as never[])[0]).toMatchObject({ where: { phone: { in: expect.arrayContaining(['791234567', '962791234567']) } } });
    await activeBlock({ customerBlock: { findFirst } } as never, 'co', '962791234567');
    expect((findFirst.mock.calls[1] as never[])[0]).toMatchObject({ where: { phone: { in: expect.arrayContaining(['791234567', '962791234567']) } } });
  });

  it('a new block is written in the code-less form every reading shares', async () => {
    const create = vi.fn(async (a: unknown) => a);
    const tx = { customerBlock: { findFirst: vi.fn(async () => null), create } };
    await blockPhone(tx as never, { companyId: 'co', phone: '962791234567', reason: 'رفض الاستلام', blockedById: 'u' });
    expect(create.mock.calls[0][0]).toMatchObject({ data: { phone: '791234567' } });
  });
});
