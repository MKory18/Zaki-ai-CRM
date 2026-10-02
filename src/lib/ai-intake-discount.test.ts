import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE REVIEWER IS SHOWN WHAT THE OFFER PROMISES — OR THEY CONFIRM A CHARGE
 * NOBODY INTENDED.
 *
 * `POST /api/orders/ai-intake` has two modes. The preview parses a pasted
 * message and SUGGESTS a price; the confirm mode raises the order from the
 * number the reviewer accepted. `AiOrderModal` copies `suggestedPrice`
 * straight into `finalPrice`, and `finalPrice` becomes `sellingPrice` and
 * the order's `totalAmount`. So the suggestion is a money write with one
 * human keystroke in the middle of it.
 *
 * THE DEFECT. The suggestion was `qtyOffer.price`, and `qtyOffer` comes from
 * `activeOffersFor`, whose `OfferView` has no `discount` field and whose
 * query does not select that column. An offer of `sellingPrice: 25` with
 * `discount: 3`:
 *
 *   the reviewer was shown   25
 *   every other door charges 22   (createPublicOrder, the cart quote, POST /orders)
 *   so the customer paid     25
 *
 * It was argued that a human confirming the figure makes this not a money
 * write. It is the opposite: the confirmation is what turns the wrong number
 * into a charge, and a reviewer cannot catch an error they are never shown.
 *
 * WHY THE DISCOUNT IS READ WITH A SECOND QUERY. `OfferView` is the shape
 * four PUBLIC surfaces hand to browsers; `offers.ts:25` keeps the marketing
 * number (`compareAtPrice`) and the money number (`discount`) apart on
 * purpose, and widening the view would leak the money figure to shoppers. So
 * the column is read server-side, keyed on the offer id already chosen, the
 * way `resolvePublicLines` reads it for a basket.
 *
 * WHAT THESE TESTS ARE WORTH. They drive the real route with the real
 * `money.ts` — `computeCod`, `allocateDiscount` and `roundMinor` are NOT
 * mocked, so the clamp and the currency's rounding are the shipped ones. The
 * mocked `activeOffersFor` returns a frozen view with NO `discount` property,
 * so a route that tried to read the figure off the view would get `undefined`
 * and land back on 25 — which these tests fail on, by the number.
 */

const {
  db,
  requireContext,
  requirePermission,
  logAudit,
  notify,
  findOrCreateCustomer,
  productCost,
  resolveRegionId,
  orderRefFields,
  activeBlock,
  activeOffersFor,
  parseOrderText,
  matchProduct,
} = vi.hoisted(() => ({
  db: {
    product: { findFirst: vi.fn(), findMany: vi.fn() },
    offer: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    order: { create: vi.fn() },
    orderItem: { create: vi.fn() },
    customer: { update: vi.fn(), findFirst: vi.fn() },
    orderActivity: { create: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
  notify: vi.fn(),
  findOrCreateCustomer: vi.fn(),
  productCost: vi.fn(),
  resolveRegionId: vi.fn(),
  orderRefFields: vi.fn(),
  activeBlock: vi.fn(),
  activeOffersFor: vi.fn(),
  parseOrderText: vi.fn(),
  matchProduct: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock('@/lib/customer-identity', () => ({
  findOrCreateCustomer: (...a: unknown[]) => findOrCreateCustomer(...a),
}));
vi.mock('@/lib/product-cost', () => ({ productCost: (...a: unknown[]) => productCost(...a) }));
vi.mock('@/lib/regions', () => ({ resolveRegionId: (...a: unknown[]) => resolveRegionId(...a) }));
vi.mock('@/lib/order-ref', () => ({ orderRefFields: (...a: unknown[]) => orderRefFields(...a) }));
vi.mock('@/lib/blacklist', () => ({ activeBlock: (...a: unknown[]) => activeBlock(...a) }));
vi.mock('@/lib/offers', () => ({ activeOffersFor: (...a: unknown[]) => activeOffersFor(...a) }));
// The parse is not the subject: the price is. Everything else in the parser
// module stays real so a rename there is still a compile error here.
vi.mock('@/lib/order-parser', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  parseOrderText: (...a: unknown[]) => parseOrderText(...a),
  matchProduct: (...a: unknown[]) => matchProduct(...a),
}));

import { repoFile, stripComments } from '@/lib/guard-source';

const { POST } = await import('@/app/api/orders/ai-intake/route');

/** JOD: three decimals. The rounding rule is the currency's, never a global one. */
const JOD = { orderPrefix: 'JO', minorUnit: 3, currencyCode: 'JOD', allowNegativeStock: false };
/** SYP: whole units — the same inputs must round differently here. */
const SYP = { orderPrefix: 'SY', minorUnit: 0, currencyCode: 'SYP', allowNegativeStock: false };

/**
 * THE VIEW A BROWSER IS HANDED — and it has no `discount` property, because
 * `activeOffersFor` does not select that column. Frozen so that a route
 * reaching for the money figure here cannot be quietly fed one.
 */
const OFFER_VIEW = Object.freeze({
  id: 'off-25',
  name: 'قطعتان',
  /** PIECES PER PICK. 25 is the bundle's total, never a unit price. */
  quantity: 2,
  freeQuantity: 0,
  price: 25,
  compareAtPrice: null,
  isDefault: true,
  deliveryIncluded: false,
  endsAt: null,
});

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/orders/ai-intake', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );

/** The preview mode, answered as JSON. */
async function preview(text = 'اسمي سامر ورقمي 0999111222 وبدي قطعتين من منتج أ') {
  const res = await post({ text });
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  return json as { suggestedPrice: number | null; suggestedOfferName: string | null };
}

/** What the offer table answers when asked for the money column. */
function discountIs(discount: number) {
  db.offer.findFirst.mockImplementation(async ({ where, select }: any) => {
    // The second read is NARROW and SCOPED: this column only, this offer,
    // this company. A mock that answered anything to anything would hide a
    // missing tenant filter.
    expect(select).toEqual({ discount: true });
    expect(where).toEqual({ id: OFFER_VIEW.id, companyId: 'c1' });
    return { discount };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // No key: the model path is skipped and the deterministic parser is used.
  delete process.env.OPENROUTER_API_KEY;

  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'موظف', role: 'ADMIN' },
    companyId: 'c1',
    storeId: 's1',
    countryId: 'jo',
    country: JOD,
  });
  requirePermission.mockResolvedValue(undefined);
  activeBlock.mockResolvedValue(null);
  parseOrderText.mockImplementation(() => ({
    customerName: 'سامر الأحمد',
    phone: '0999111222',
    governorate: 'عمّان',
    address: 'شارع',
    productQuery: 'منتج أ',
    quantity: 2,
    price: null,
    notes: '',
    source: '',
  }));
  matchProduct.mockReturnValue({ id: 'p-a', name: 'منتج أ', sku: 'SKU-A', score: 40 });
  db.product.findMany.mockResolvedValue([{ id: 'p-a', name: 'منتج أ', sku: 'SKU-A' }]);
  db.customer.findFirst.mockResolvedValue(null);
  activeOffersFor.mockResolvedValue([OFFER_VIEW]);
  discountIs(3);

  // The write path's cast, used only by the confirm tests.
  db.product.findFirst.mockResolvedValue({
    id: 'p-a',
    companyId: 'c1',
    name: 'منتج أ',
    basePrice: 99,
    image: null,
    batches: [],
  });
  findOrCreateCustomer.mockResolvedValue({ id: 'cust1', city: 'عمّان', firstOrderDate: null });
  productCost.mockResolvedValue({ average: 7 });
  orderRefFields.mockResolvedValue({ merchantReference: 'JO-1' });
  resolveRegionId.mockResolvedValue('r1');
  db.order.create.mockResolvedValue({ id: 'o1', orderNumber: 1, source: 'AI Intake' });
  db.orderItem.create.mockResolvedValue({});
  db.customer.update.mockResolvedValue({});
  db.orderActivity.create.mockResolvedValue({});
  logAudit.mockResolvedValue(undefined);
  notify.mockReturnValue(undefined);
});

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
});

describe('المقترَح للمراجع هو ما يَعِدُ به العرضُ فعلاً', () => {
  it('عرضٌ ٢٥ بخصمٍ ٣: يُقترَح ٢٢، لا ٢٥', async () => {
    const json = await preview();
    expect(
      json.suggestedPrice,
      'المراجع يرى السعرَ المعلَن ٢٥ والعرضُ يَقبِض ٢٢ — فيُؤكّد رقماً لا يُطابق أيَّ بابٍ آخر'
    ).toBe(22);
    expect(json.suggestedPrice).not.toBe(25);
    // The offer is still named, so the reviewer knows which bundle this is.
    expect(json.suggestedOfferName).toBe('قطعتان');
  });

  it('والخصمُ يُقرأ باستعلامٍ ثانٍ ضيّقٍ، لا من العرضِ المُسلَّمِ للمتصفّح', async () => {
    await preview();
    // The catalogue read still happens — the positive control. Without it a
    // «no second read» assertion would pass on a route that reads nothing.
    expect(activeOffersFor).toHaveBeenCalledTimes(1);
    expect(db.offer.findFirst).toHaveBeenCalledTimes(1);
    // The shape of that read is asserted inside `discountIs`: `{ discount:
    // true }` only, this offer, this company.
    expect(db.offer.findFirst.mock.calls[0][0]).toEqual({
      where: { id: 'off-25', companyId: 'c1' },
      select: { discount: true },
    });
    // And the view it was NOT taken from carries no such field at all.
    expect(Object.keys(OFFER_VIEW)).not.toContain('discount');
  });

  it('خصمٌ أكبرُ من السعرِ يَقِفُ عند صفر ولا يَنقلب', async () => {
    discountIs(30);
    const json = await preview();
    expect(json.suggestedPrice).toBe(0);
    expect(json.suggestedPrice).toBeGreaterThanOrEqual(0);
  });

  it('والتدويرُ تدويرُ عملةِ الطلبِ وحدَها — ٢٢٫٦ بالدينار و٢٣ بالليرة', async () => {
    discountIs(2.4);
    // JOD, three decimals: nothing to round away.
    expect((await preview()).suggestedPrice).toBe(22.6);

    // The same offer, the same discount, a whole-unit currency: the
    // reduction rounds to 2 and the suggestion is 23. A file doing its own
    // `25 - 2.4` would answer 22.6 here too.
    requireContext.mockResolvedValue({
      user: { id: 'u1', name: 'موظف', role: 'ADMIN' },
      companyId: 'c1',
      storeId: 's1',
      countryId: 'sy',
      country: SYP,
    });
    expect((await preview()).suggestedPrice).toBe(23);
  });

  it('وخصمُ صفرٍ يُبقي السعرَ المعلَنَ كما هو', async () => {
    discountIs(0);
    expect((await preview()).suggestedPrice).toBe(25);
  });

  it('وسعرٌ ذكرَه الزبونُ في رسالتِه يَسبِقُ العرضَ، فلا يُقرأ الخصمُ أصلاً', async () => {
    parseOrderText.mockImplementation(() => ({
      customerName: 'سامر الأحمد',
      phone: '0999111222',
      governorate: 'عمّان',
      address: 'شارع',
      productQuery: 'منتج أ',
      quantity: 2,
      price: 19,
      notes: '',
      source: '',
    }));
    const json = await preview();
    expect(json.suggestedPrice).toBe(19);
    expect(json.suggestedOfferName).toBe('قطعتان');
    expect(db.offer.findFirst).not.toHaveBeenCalled();
  });

  it('وبلا عرضٍ حيٍّ لا يُقترَح شيءٌ ولا يُستعلَم عن خصم', async () => {
    activeOffersFor.mockResolvedValue([]);
    const json = await preview();
    expect(json.suggestedPrice).toBeNull();
    expect(json.suggestedOfferName).toBeNull();
    expect(db.offer.findFirst).not.toHaveBeenCalled();
  });
});

/**
 * THE WRITE PATH, RE-JUDGED.
 *
 * It binds no offer — the confirm payload has no `offerId` — so it passes no
 * `discount`, and its `NO_OFFER_BOUND` entry stands. These two tests pin the
 * reason, because the obvious «fix» to that entry is the dangerous one: now
 * that the preview hands over the NET figure, passing the discount here too
 * would charge 19 for an offer that promises 22.
 */
describe('وبابُ الكتابةِ يقبض ما أكّدَه المراجعُ، لا أقلَّ منه', () => {
  const confirm = (finalPrice: number) =>
    post({
      confirm: true,
      parsed: {
        customerName: 'سامر الأحمد',
        phone: '0999111222',
        address: 'شارع',
        governorate: 'عمّان',
        productId: 'p-axxxxxxxxxx',
        quantity: 2,
        finalPrice,
      },
    });

  it('٢٢ مؤكَّدةً تُكتَب ٢٢ — لا ١٩، فالخصمُ لا يُحسَب مرّتَين', async () => {
    const res = await confirm(22);
    expect(res.status).toBe(200);
    const data = db.order.create.mock.calls[0][0].data;
    expect(data.totalAmount).toBe(22);
    expect(data.sellingPrice).toBe(22);
    expect(data.totalAmount, 'الخصمُ طُبِّق مرّةً في الاقتراحِ ومرّةً هنا').not.toBe(19);
  });

  it('ولا يلمس جدولَ العروضِ في طريقِه، إذ لا عرضَ مربوطٌ بالتأكيد', async () => {
    await confirm(22);
    expect(db.offer.findFirst).not.toHaveBeenCalled();
    expect(activeOffersFor).not.toHaveBeenCalled();
  });
});

/**
 * ONE PLACE COMPUTES MONEY. Not a check that a name appears — the numbers
 * above are that — but a check that no THIRD arithmetic has been added
 * beside them: two `computeCod` calls in this file (the preview and the
 * write), and no rounding of its own.
 */
describe('وحسابُ المالِ يبقى في money.ts', () => {
  const src = () => stripComments(repoFile('src/app/api/orders/ai-intake/route.ts'));

  it('نداءان لـ computeCod ولا ثالث', () => {
    expect(src().match(/computeCod\(/g) ?? []).toHaveLength(2);
  });

  it('ولا تدويرَ من عندِه', () => {
    expect(src()).not.toMatch(/Math\.round|toFixed/);
  });
});
