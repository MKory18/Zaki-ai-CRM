import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHETHER AN ORDER'S PRICE ALREADY CONTAINS DELIVERY — ONE RULE, EVERY DOOR.
 *
 * It is the store's pricing policy, set on the store's row in «البلدان
 * والمتاجر»; an offer may turn it on for its own bundle. Only direct orders
 * applied it, so a store advertising delivery-inclusive prices had its
 * landing-page, storefront and Telegram orders collected as price + fee.
 */

const { db } = vi.hoisted(() => ({ db: { store: { findFirst: vi.fn() } } }));
vi.mock('./db', () => ({ db }));

import { priceIncludesDeliveryFor } from './delivery-fees';

beforeEach(() => vi.clearAllMocks());

describe('the rule', () => {
  it('follows the store', async () => {
    db.store.findFirst.mockResolvedValue({ priceIncludesDelivery: true });
    expect(await priceIncludesDeliveryFor('s1')).toBe(true);
    db.store.findFirst.mockResolvedValue({ priceIncludesDelivery: false });
    expect(await priceIncludesDeliveryFor('s1')).toBe(false);
    expect(db.store.findFirst.mock.calls[0][0].where).toEqual({ id: 's1' });
  });

  it('an offer may include delivery in a store that does not', async () => {
    db.store.findFirst.mockResolvedValue({ priceIncludesDelivery: false });
    expect(await priceIncludesDeliveryFor('s1', true)).toBe(true);
    expect(db.store.findFirst).not.toHaveBeenCalled();
  });

  it('an offer never takes it away from a store that includes it', async () => {
    db.store.findFirst.mockResolvedValue({ priceIncludesDelivery: true });
    expect(await priceIncludesDeliveryFor('s1', false)).toBe(true);
    expect(await priceIncludesDeliveryFor('s1', null)).toBe(true);
  });

  it('an unknown store is not delivery-inclusive', async () => {
    db.store.findFirst.mockResolvedValue(null);
    expect(await priceIncludesDeliveryFor('gone')).toBe(false);
  });
});

describe('every door asks it', () => {
  // Each door builds its own order row; each must ask the rule and write
  // the answer. A door that stops doing either is back to price + fee.
  const DOORS = [
    'src/app/api/orders/route.ts', // direct
    'src/lib/public-order.ts', // landing page and storefront
    'src/lib/telegram/order-creation.ts', // Telegram
  ];

  it.each(DOORS)('%s', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    expect(src).toMatch(/priceIncludesDeliveryFor\(/);
    expect(src).toMatch(/^\s*priceIncludesDelivery,?\s*$/m);
  });
});
