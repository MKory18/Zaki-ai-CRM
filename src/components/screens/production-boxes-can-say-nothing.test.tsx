// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { batchTotal, batchUnitCost } from '@/lib/product-cost';

/**
 * A CLEARED COST BOX IS NOT A TYPED ZERO — THE BROWSER HALF OF `0aea050`.
 *
 * `0aea050` hardened `POST /api/production`: a quantity or a cost that is
 * not written the way a number is written is refused with a 400 and an
 * Arabic sentence that names the field. Then this screen did:
 *
 *     const [quantityProduced, setQuantityProduced] = useState(1000);
 *     const [manufacturingCost, setManufacturingCost] = useState(2500);
 *     const [packagingCost,     setPackagingCost]     = useState(800);
 *     const [rawMaterialCost,   setRawMaterialCost]   = useState(700);
 *     const [otherCosts,        setOtherCosts]        = useState(0);
 *     onChange={(e) => setManufacturingCost(parseFloat(e.target.value) || 0)}
 *
 * TWO DEFECTS, AND THE FIRST ONE IS THE ONE THAT ACTUALLY FIRED.
 *
 *   1 · FIVE INVENTED NUMBERS. Open the dialog, pick a product, press save:
 *       a run of 1000 units costing 2500 + 800 + 700 is stored and priced
 *       at 4.0000 a unit, and not one of those figures came from a person
 *       or from a column default. `productCost` then averages that
 *       `costPerUnit` into the cost of goods on every order of the product.
 *
 *   2 · A CLEARED BOX SENT A LEGITIMATE `0`. `parseFloat('')` is `NaN` and
 *       `||` makes it `0` — and `0` is a value the door MUST accept,
 *       because a run with no packaging cost is real. So the refusal
 *       `0aea050` installed was unreachable from the only screen that opens
 *       that door. This is also what the Arabic-keyboard case comes down to
 *       in a browser: an `<input type="number">` does not keep «2,500».
 *       Chrome drops the comma and reports «2500»; Firefox reports `''`
 *       with `validity.badInput` — and that `''` became **0**.
 *
 * MEASURED HERE, so the claim is not inherited: the first `describe` below
 * types «2,500» into a real number box and prints what the box reports.
 * `parseFloat('2,500') === 2` is true of the STRING and is what the door
 * now refuses; it is not what this box produces, and saying otherwise would
 * be repeating a defect description instead of a measurement.
 *
 * Every assertion reads THE BODY ON THE WIRE, because that is the number a
 * person ends up looking at — `0aea050`'s seventh mutation reached only
 * `box.value` and had to be reordered for exactly this reason.
 */

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({ t: { cancel: 'إلغاء' }, locale: 'ar' }),
}));
// A searchable product list is a second question; this test is about the
// money boxes, and the screen already picks the first product on load.
vi.mock('@/components/ui/ProductPicker', () => ({
  ProductPicker: ({ value }: { value: string }) => <div data-testid="picker">{value}</div>,
}));
vi.mock('@/components/production/BatchCostDialog', () => ({
  BatchCostDialog: () => null,
}));

import { ManufacturingScreen } from './ManufacturingScreen';

const PRODUCT = { id: 'prod-1', name: 'كريم', sku: 'KR-1', sourceType: 'MANUFACTURED', basePrice: 10 };

/** Every non-GET body the screen sent, in order. */
let sent: { url: string; method: string; body: any }[] = [];
/** What the door answers. Replaced per test to drive a real refusal home. */
let answer: { ok: boolean; payload: any } = { ok: true, payload: { success: true, batch: { id: 'b1' } } };

beforeEach(() => {
  sent = [];
  answer = { ok: true, payload: { success: true, batch: { id: 'b1' } } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        sent.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return { ok: answer.ok, json: async () => answer.payload } as any;
      }
      if (url.startsWith('/api/products')) return { ok: true, json: async () => ({ products: [PRODUCT] }) } as any;
      return { ok: true, json: async () => ({ batches: [], currency: 'JOD' }) } as any;
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openForm = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<ManufacturingScreen />);
  // Both fetches have landed once the empty list has drawn itself; the
  // product id is chosen on load, inside the modal that is not open yet.
  await waitFor(() => expect(screen.getByText('لا تشغيلاتِ إنتاجٍ بعد')).toBeTruthy());
  await user.click(screen.getByText('تشغيلة جديدة'));
  await waitFor(() => expect(screen.getByTestId('picker').textContent).toBe('prod-1'));
};

const QTY = 'الكمية المنتَجة (قطعة) *';
const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const save = () => screen.getByText('احفظ الدفعة وأضفها للمخزون');
const has = (body: any, key: string) => Object.prototype.hasOwnProperty.call(body, key);

describe('what the old reading did, in the numbers it produced', () => {
  it('turned every empty box into a zero the door is obliged to accept', () => {
    // The value an `<input type="number">` reports when it is cleared, or
    // when what was typed into it is not a number at all.
    expect(parseFloat('')).toBeNaN();
    expect(parseFloat('') || 0).toBe(0);
    expect(parseInt('', 10) || 0).toBe(0);
    // And a zero cost is a real answer, so the door cannot tell the two
    // apart — `money.default(0)` over a `Float @default(0)` NOT NULL column.
    expect(batchTotal({ manufacturingCost: 0, packagingCost: 0 }).total).toBe(0);
  });

  it('and `parseFloat` on an Arabic thousands separator is 2, which is the door’s case not this box’s', async () => {
    /*
     * The string-level claim, kept because it is what the DOOR refuses —
     * an API client, a paste into a plain text field, an import. What a
     * `type="number"` box reports is measured in the next test instead of
     * being assumed from this one.
     */
    expect(parseFloat('2,500')).toBe(2);
    // `0aea050`'s batch: 2500 + 500 over 1000 units.
    expect(batchTotal({ manufacturingCost: parseFloat('2,500'), packagingCost: 500 }).total).toBe(502);
    expect(batchUnitCost(502, 1000)).toBe(0.502);
    expect(batchUnitCost(3000, 1000)).toBe(3);
  });

  it('and a number box does NOT keep the comma — so the empty string is the browser’s real case', async () => {
    const user = userEvent.setup();
    await openForm(user);
    const costBox = box('كلفة التصنيع');
    await user.type(costBox, '2,500');
    // Chrome and jsdom both drop the rejected character; Firefox reports
    // `''` with `validity.badInput`. Neither ever hands over «2,500».
    expect(['2500', '']).toContain(costBox.value);
    await user.clear(costBox);
    await user.type(costBox, 'abc');
    // THE EMPTY STRING. This is the value `parseFloat(…) || 0` turned into
    // a stored zero, and the one every assertion below is about.
    expect(costBox.value).toBe('');
  });
});

describe('the form opens with nothing in it', () => {
  it('and not with 1000 / 2500 / 800 / 700 / 0 — five numbers nobody chose', async () => {
    const user = userEvent.setup();
    await openForm(user);
    expect(box(QTY).value).toBe('');
    expect(box('كلفة التصنيع').value).toBe('');
    expect(box('كلفة التغليف').value).toBe('');
    expect(box('كلفة المواد الخام').value).toBe('');
    expect(box('فحص الجودة / أخرى').value).toBe('');
  });

  it('so «open it and press save» sends an EMPTY request body, not a 4000 batch', async () => {
    /*
     * THE WHOLE DEFECT IN ONE REQUEST. With the five `useState` numbers in
     * place this same click sent
     *   { quantityProduced: 1000, manufacturingCost: 2500,
     *     packagingCost: 800, rawMaterialCost: 700, otherCosts: 0 }
     * and the door — which is right to accept a 1000-unit run at 2500 —
     * stored it with `costPerUnit` 4, and `productCost` then averaged that
     * 4 into the cost of goods of every order of the product.
     */
    const user = userEvent.setup();
    answer = { ok: false, payload: { error: 'الكمية المنتجة مطلوب' } };
    await openForm(user);
    // `required` sits on the quantity box, so the submit is driven the way
    // a form with `noValidate` or an older browser would drive it.
    (save().closest('form') as HTMLFormElement).noValidate = true;
    await user.click(save());

    await waitFor(() => expect(sent).toHaveLength(1));
    const body = sent[0].body;
    expect(sent[0].url).toBe('/api/production');
    for (const key of ['quantityProduced', 'manufacturingCost', 'packagingCost', 'rawMaterialCost', 'otherCosts']) {
      expect(has(body, key), `${key} ما زال يُبعَث من المتصفّح`).toBe(false);
    }
    expect(body.costLines).toEqual([]);
  });

  it('and shows no unit cost at all, rather than a zero that reads as «free»', async () => {
    const user = userEvent.setup();
    await openForm(user);
    // `batchUnitCost(total, 0)` is 0 — measured, not assumed — and
    // «تكلفة الوحدة: 0» beside real costs is the one thing an unfilled
    // quantity box cannot mean.
    expect(batchUnitCost(4000, 0)).toBe(0);
    expect(screen.getByText('تكلفة الوحدة المحسوبة:').parentElement!.textContent).toContain('—');
  });
});

describe('the body on the wire', () => {
  it('leaves an empty cost box OUT of the request, so the column default decides', async () => {
    const user = userEvent.setup();
    await openForm(user);
    await user.type(box(QTY), '1000');
    await user.type(box('كلفة التصنيع'), '2500');
    // packaging, raw material and other are left untouched.
    await user.click(save());

    await waitFor(() => expect(sent).toHaveLength(1));
    const body = sent[0].body;
    // ABSENT, not zero. Restore `parseFloat(e.target.value) || 0` and these
    // three read `800`, `700` and `0` — the prefills — and with the
    // prefills emptied they read `0`, `0` and `0`: three costs asserted by
    // a browser, indistinguishable from three a person typed.
    expect(has(body, 'packagingCost')).toBe(false);
    expect(has(body, 'rawMaterialCost')).toBe(false);
    expect(has(body, 'otherCosts')).toBe(false);
    // And what WAS typed is there, as the characters.
    expect(body.quantityProduced).toBe('1000');
    expect(body.manufacturingCost).toBe('2500');
    expect(body.manufacturingCost).not.toBe(2500);
  });

  it('sends a typed zero AS zero, because a run with no packaging cost is real', async () => {
    const user = userEvent.setup();
    await openForm(user);
    await user.type(box(QTY), '500');
    await user.type(box('كلفة التصنيع'), '100');
    await user.type(box('كلفة التغليف'), '0');
    await user.click(save());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(has(sent[0].body, 'packagingCost')).toBe(true);
    expect(sent[0].body.packagingCost).toBe('0');
  });

  it('and a decimal cost arrives digit for digit', async () => {
    const user = userEvent.setup();
    await openForm(user);
    await user.type(box(QTY), '7');
    await user.type(box('كلفة التصنيع'), '12.75');
    await user.click(save());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body.manufacturingCost).toBe('12.75');
  });

  it('and a NEGATIVE cost is sent as typed, so the door’s 400 reaches the person', async () => {
    /*
     * THE ROUND TRIP, FROM THE BOX. The four cost boxes carry no `min`, so
     * `-500` is a value a browser will hand over and `checkValidity()` is
     * true. `money()` is `z.number().min(0)`, so the door answers 400 and
     * `zodMessage` names the field — and `0aea050` recorded why it must
     * REFUSE rather than clamp: a clamp leaves the batch total understated
     * by exactly what was typed and says nothing.
     */
    const user = userEvent.setup();
    answer = { ok: false, payload: { error: 'كلفة التصنيع: 0 على الأقل' } };
    await openForm(user);
    await user.type(box(QTY), '1000');
    const costBox = box('كلفة التصنيع');
    await user.type(costBox, '-500');
    expect(costBox.value).toBe('-500');
    expect(costBox.checkValidity()).toBe(true);
    await user.click(save());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body.manufacturingCost).toBe('-500');
    // The refusal, in the modal the person is looking at.
    await waitFor(() => expect(screen.getByText('كلفة التصنيع: 0 على الأقل')).toBeTruthy());
  });

  it('leaves a cleared QUANTITY out of the request, so the door says «مطلوب» and not «اكتبه رقماً»', async () => {
    /*
     * The quantity is the one box with no default anywhere: `count(1_000_000, 1)`
     * at the door, with no `.default()`. An absent quantity is therefore
     * «الكمية المنتجة مطلوب» — «not filled in» — which is the distinction
     * `0aea050` put into `zod-message.ts`. With `parseInt('', 10) || 0` the
     * browser sent `0`: a filled-in number below the minimum, so the
     * sentence the operator read was «الكمية المنتجة: 1 على الأقل» about a
     * box they had left blank.
     */
    const user = userEvent.setup();
    answer = { ok: false, payload: { error: 'الكمية المنتجة مطلوب' } };
    await openForm(user);
    await user.type(box('كلفة التصنيع'), '2500');
    (save().closest('form') as HTMLFormElement).noValidate = true;
    await user.click(save());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(has(sent[0].body, 'quantityProduced')).toBe(false);
    expect(sent[0].body.quantityProduced).toBeUndefined();
    await waitFor(() => expect(screen.getByText('الكمية المنتجة مطلوب')).toBeTruthy());
  });
});

describe('the live total is the same arithmetic the door will do', () => {
  it('and the zero an absent cost counts as lives in `batchTotal`, not in this browser', async () => {
    /*
     * There is no `?? 0` in the screen: an empty box is handed to
     * `batchTotal` as `undefined` and `batchTotal` decides. So the figure
     * on screen is the figure `POST /api/production` computes from the same
     * function, for the same input — which is what Ⅳ·4 of
     * `the-frontend-invariants` pins this screen for.
     */
    const user = userEvent.setup();
    await openForm(user);
    await user.type(box(QTY), '1000');
    await user.type(box('كلفة التصنيع'), '2500');
    await user.type(box('كلفة التغليف'), '500');

    const expected = batchTotal({ manufacturingCost: 2500, packagingCost: 500 }).total;
    expect(expected).toBe(3000);
    await waitFor(() => expect(screen.getByText(/الكلفة الكلية/).textContent).toContain('3,000'));
    // And the unit cost, to the four places the column stores.
    expect(batchUnitCost(expected, 1000)).toBe(3);
    expect(screen.getByText('تكلفة الوحدة المحسوبة:').parentElement!.textContent).toContain('3');
  });
});

describe('a free-form cost line', () => {
  it('opens with no amount, and sends none — a named line with no figure is refused', async () => {
    const user = userEvent.setup();
    answer = { ok: false, payload: { error: 'المبلغ مطلوب' } };
    await openForm(user);
    await user.type(box(QTY), '100');
    await user.selectOptions(screen.getByDisplayValue('+ أضف بنداً…'), 'قالب');

    const amount = (await waitFor(() => box('مبلغ البند 1'))) as HTMLInputElement;
    // `{ label, amount: 0 }` used to be written into the line the moment it
    // appeared — a named cost already claiming it cost nothing.
    expect(amount.value).toBe('');

    await user.click(save());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body.costLines).toEqual([{ label: 'قالب' }]);
    await waitFor(() => expect(screen.getByText('المبلغ مطلوب')).toBeTruthy());
  });

  it('and a typed amount travels as the characters', async () => {
    const user = userEvent.setup();
    await openForm(user);
    await user.type(box(QTY), '100');
    await user.selectOptions(screen.getByDisplayValue('+ أضف بنداً…'), 'قالب');
    const amount = (await waitFor(() => box('مبلغ البند 1'))) as HTMLInputElement;
    await user.type(amount, '12.5');
    await user.click(save());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body.costLines).toEqual([{ label: 'قالب', amount: '12.5' }]);
  });
});

describe('after a batch is saved', () => {
  it('the boxes are emptied, so the next run cannot inherit this one’s costs', async () => {
    const user = userEvent.setup();
    await openForm(user);
    await user.type(box(QTY), '1000');
    await user.type(box('كلفة التصنيع'), '2500');
    await user.click(save());
    await waitFor(() => expect(sent).toHaveLength(1));

    await user.click(screen.getByText('تشغيلة جديدة'));
    await waitFor(() => expect(screen.getByTestId('picker').textContent).toBe('prod-1'));
    expect(box(QTY).value).toBe('');
    expect(box('كلفة التصنيع').value).toBe('');
  });
});
