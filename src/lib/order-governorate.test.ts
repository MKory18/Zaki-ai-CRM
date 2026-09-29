import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * THE GOVERNORATE ON AN ORDER, AND THE TWO CONTROLS THAT CLAIMED IT.
 *
 * `regionId` is a row in the delivery-fee table. `customer.city` is whatever
 * somebody typed. The order card printed the second under the label of the
 * first — `region?.name ?? customer.city` — so an order with no resolved
 * region showed «دمشق» and read as settled, while the shipment screen would
 * answer «لا يمكن حساب أجرة التوصيل» about the same order.
 *
 * Measured on this database: 2 orders of 171 have no `regionId`, and BOTH
 * have a city written on them — so both of them looked fine and neither was.
 *
 * And `OrderDetailModal` carried a second, complete governorate picker,
 * `OrderRegionField`, which nothing ever rendered. Two answers to one
 * question, one of them unreachable, is how the live one stops being fixed.
 */

describe('the customer card', () => {
  const src = () => repoFile('src/components/orders/CustomerCard.tsx');

  it('never prints the typed city under the label «المحافظة» as if it were one', () => {
    const body = stripComments(src());
    expect(body, 'المدينة النصّيّة تُقدَّم كمحافظة').not.toContain(
      'value={order.region?.name ?? order.customer.city'
    );
  });

  it('says so when no region is resolved, and says what it costs', () => {
    const body = src();
    expect(body).toContain('order.regionId ? (');
    expect(body).toContain('لم تُحدَّد — لا يمكن حساب أجرة التوصيل');
  });

  it('still shows the typed city, named as what it is — it is the clue for fixing it', () => {
    expect(src()).toContain('المكتوب: ');
  });

  it('and the one live editor is still here', () => {
    const body = src();
    expect(body).toMatch(/<select value=\{form\.regionId\}/);
    expect(body).toContain('regionId: form.regionId || null');
    expect(body.length).toBeGreaterThan(2000);
  });
});

describe('the order detail modal', () => {
  const src = () => repoFile('src/components/orders/OrderDetailModal.tsx');

  it('has no second governorate picker sitting unrendered beside the live one', () => {
    expect(stripComments(src()), 'مُنتقي محافظةٍ ثانٍ').not.toContain('function OrderRegionField');
  });

  /**
   * «طلبات سابقة» set `historyOpen`, and the only reader of it lived inside
   * the `if (!order && loading)` early return — the loading skeleton, where
   * `order` is null by definition. So the button did nothing at all on the
   * one path it exists on, and had that branch ever rendered with the flag
   * set, `order.customer` would have thrown.
   */
  it('renders the customer history where the order actually exists', () => {
    const body = stripComments(src());
    const at = body.indexOf('if (!order && loading)');
    const skeletonEnd = body.indexOf('if (loadError)');
    expect(at).toBeGreaterThan(0);
    expect(skeletonEnd).toBeGreaterThan(at);
    const skeleton = body.slice(at, skeletonEnd);
    expect(skeleton, 'سجلُّ العميل داخل هيكل التحميل، حيث الطلب null').not.toContain(
      'CustomerHistoryModal'
    );
    // And it IS rendered, after the early returns, next to the other dialogs.
    expect(body.slice(skeletonEnd)).toContain('<CustomerHistoryModal');
    expect(body.slice(skeletonEnd)).toContain('{historyOpen && order.customer?.id && (');
  });

  it('and the button that opens it is still wired to the same flag', () => {
    expect(src()).toContain('onOpenHistory={() => setHistoryOpen(true)}');
  });

  it('is a whole modal', () => {
    expect(src().length).toBeGreaterThan(2000);
  });
});
