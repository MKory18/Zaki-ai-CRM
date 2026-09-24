import { describe, expect, it } from 'vitest';
import { openRefusal, openWarnings, type StorefrontFacts } from './storefront-rules';

/**
 * WHEN A STOREFRONT MAY OPEN.
 *
 * One rule behind every switch. A refusal is a page a visitor would find
 * broken; anything short of that is a warning.
 */

const facts = (over: Partial<StorefrontFacts>): StorefrontFacts => ({
  type: 'MULTI_PRODUCT',
  status: 'ACTIVE',
  sellableProducts: 3,
  frontPage: null,
  ...over,
});

describe('a store with many products', () => {
  it('opens with something to sell', () => {
    expect(openRefusal(facts({}))).toBeNull();
  });

  it('refuses empty shelves', () => {
    expect(openRefusal(facts({ sellableProducts: 0 }))).toContain('رفوفاً فارغة');
  });
});

describe('a Single Product store', () => {
  const single = (over: Partial<StorefrontFacts>) => facts({ type: 'SINGLE_PRODUCT', ...over });

  it('opens on a published front page that sells', () => {
    expect(openRefusal(single({ frontPage: { isPublished: true, productActive: true }, sellableProducts: 5 }))).toBeNull();
  });

  it('refuses an unpublished front page, and one whose product is off', () => {
    expect(openRefusal(single({ frontPage: { isPublished: false, productActive: true } }))).toContain('غير منشورة');
    expect(openRefusal(single({ frontPage: { isPublished: true, productActive: false } }))).toContain('غير فعّال');
  });

  it('without a front page, opens only as its one product\'s page', () => {
    expect(openRefusal(single({ sellableProducts: 1 }))).toBeNull();
    expect(openRefusal(single({ sellableProducts: 0 }))).toContain('اختر صفحة هبوط');
    expect(openRefusal(single({ sellableProducts: 2 }))).toContain('اختر صفحة هبوط');
  });
});

describe('any store', () => {
  it('a paused store never opens', () => {
    expect(openRefusal(facts({ status: 'PAUSED' }))).toContain('موقوف');
  });

  it('a missing support phone is a warning, not a refusal', () => {
    expect(openWarnings({ supportPhone: null })).toEqual(['لا رقم دعم للزبون']);
    expect(openWarnings({ supportPhone: '0790000000' })).toEqual([]);
  });
});
