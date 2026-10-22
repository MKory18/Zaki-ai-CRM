// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { IMPORT_COLUMNS } from '@/lib/order-import';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE IMPORT DIALOG SAYS WHAT THE MODEL FILE IS — «لما اعمل استثيراد طلبات ما في ملف مرجعي نموذج» (THE OWNER, 21/10).
 *
 * The model file lived behind a button that said only «حمّل النموذج». The line under it now says what the file holds — rows made
 * from THIS store — names the five columns that must be filled, and says the one thing that is not obvious: a row whose price
 * cell is empty is not imported (22/10, the owner's ruling «ارفض الصف»; before it, an empty cell stored an order at a price of
 * ZERO at the order door — `an-import-row-reaches-the-door.test.ts`).
 *
 * The names are not retyped from memory: they are held equal to what `IMPORT_COLUMNS` marks required, so a column added to the
 * parser cannot leave the sentence telling people to fill in fewer than the file demands.
 * ═══════════════════════════════════════════════════════════════════════
 */

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(), apiJson: vi.fn() }));

import { apiFetch, apiJson } from '@/lib/api-client';
import { ImportOrdersDialog } from './ImportOrdersDialog';

const apiFetchMock = vi.mocked(apiFetch);
const apiJsonMock = vi.mocked(apiJson);

let opened: Array<[string, string | undefined, string | undefined]>;

beforeEach(() => {
  apiFetchMock.mockReset();
  apiJsonMock.mockReset();
  opened = [];
  vi.stubGlobal('open', (...a: [string, string?, string?]) => {
    opened.push([a[0], a[1], a[2]]);
    return null;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = () => render(<ImportOrdersDialog onClose={() => {}} onDone={() => {}} />);
const sentence = () => screen.getByText(/في النموذج صفوف مثال/).textContent ?? '';

describe('the line under the download button', () => {
  it('— says the model carries example rows made from THIS store: its products, its prices, a number from its country', () => {
    mount();
    const s = sentence();
    expect(s).toContain('من منتجات متجرك بأسعارها');
    expect(s).toContain('رقم هاتف من بلدك');
    expect(s).toContain('عدّلها أو امسحها');
  });

  it('and names the required columns — the same ones `IMPORT_COLUMNS` marks required, no more and no fewer', () => {
    mount();
    const s = sentence();
    const required = IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.ar);
    for (const ar of required) expect(s, `«${ar}» ما انذكر`).toContain(ar);

    // And nothing else is claimed to be required: the names between «المطلوب:» and the bracket are exactly the required ones.
    const listed = /المطلوب: ([^(]+)\(/.exec(s)?.[1]?.split('،').map((x) => x.trim()).filter(Boolean) ?? [];
    expect(new Set(listed)).toEqual(new Set(required));
  });

  it('and says that a row with an empty price is not imported — the price is written every time', () => {
    mount();
    const s = sentence();
    expect(s).toContain('الصفّ الذي سعره فارغ لا يُستورَد');
    // The two claims the sentence used to make are gone: neither «write the price» as advice to dodge a free order,
    // nor «an empty cell creates an order at zero» — an empty cell creates nothing now.
    expect(s, 'الجملة ما زالت تقول إنّ الخانة الفارغة تُنشئ طلباً').not.toContain('تُنشئ طلباً');
    expect(s).not.toContain('بسعر صفر');
  });

  it('and sits with the download, before the file is chosen — the place a person looks when they do not know what to write', () => {
    mount();
    const button = screen.getByText('حمّل النموذج').closest('button') as HTMLElement;
    const line = screen.getByText(/في النموذج صفوف مثال/);
    // Document order: the button, then its explanation, then the file chooser.
    expect(button.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const chooser = screen.getByText('اختر الملف');
    expect(line.compareDocumentPosition(chooser) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the download itself', () => {
  it('— the button opens the template door in a new tab, without handing the new page this one', async () => {
    mount();
    await userEvent.setup().click(screen.getByText('حمّل النموذج'));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]).toEqual(['/api/orders/import', '_blank', 'noopener']);
  });
});

/**
 * A ROW WITHOUT A PRICE IS NOT IMPORTED — «ارفض الصف» (THE OWNER, 22/10), driven through the screen.
 *
 * `an-import-row-reaches-the-door.test.ts` holds the reading door and the shape of the screen's guard; this holds the screen's
 * BEHAVIOUR, which is what the guard is for: the server calls a row importable, the row has no price, and nothing is posted.
 * That is a state the server never produces (it refuses such a row), which is exactly why the guard is tested with a server that
 * says the wrong thing — a guard that is only ever fed good answers has never been asked to refuse.
 */
describe('the screen and a row without a price', () => {
  const COUNTS = { total: 1, importable: 1, problems: 0, duplicatesInFile: 0, alreadyOrdered: 0, blocked: 0 };

  /** The row as `POST /api/orders/import` answers it. */
  const serverRow = (over: Record<string, unknown> = {}) => ({
    line: 2,
    values: {
      customerName: 'أحمد المغني',
      customerPhone: '0999123456',
      customerAltPhone: '',
      customerAddress: 'حمص — شارع الحضارة',
      customerCity: '',
      productName: 'كريم مرطّب',
      quantity: '1',
      sellingPrice: '',
      notes: '',
    },
    phone: '0999123456',
    quantity: 1,
    sellingPrice: 12 as number | null,
    problems: [] as Array<{ field: string; kind: string; ar: string }>,
    duplicateOfLine: null,
    blocked: false,
    existingOrder: null,
    productId: '11111111-1111-4111-8111-111111111111',
    productLabel: 'كريم مرطّب',
    importable: true,
    ...over,
  });

  /** Chooses a file; the server (mocked) answers with these rows. */
  async function readFile(rows: unknown[], counts = COUNTS) {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ rows, counts, recentDays: 14 }) } as unknown as Response);
    mount();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.setup().upload(input, new File(['x'], 'orders.csv', { type: 'text/csv' }));
    await screen.findByText(/جاهز/);
  }

  it('— a row the server refuses for its empty price shows «السعر مفقود», cannot be ticked, and leaves nothing to import', async () => {
    await readFile(
      [serverRow({ sellingPrice: null, importable: false, problems: [{ field: 'sellingPrice', kind: 'MISSING', ar: 'السعر مفقود' }] })],
      { ...COUNTS, importable: 0, problems: 1 }
    );
    expect(screen.getByText('السعر مفقود')).toBeTruthy();
    const tick = screen.getByTitle('هذا الصفّ لا يمكن إنشاؤه') as HTMLButtonElement;
    expect(tick.disabled, 'صفٌّ بلا سعر يمكن تحديده').toBe(true);
    const run = screen.getByText(/استورد \d+ طلباً/).closest('button') as HTMLButtonElement;
    expect(screen.getByText(/استورد 0 طلباً/)).toBeTruthy();
    expect(run.disabled, 'زرّ الاستيراد مفتوحٌ بلا أيّ صفٍّ صالح').toBe(true);
    expect(apiJsonMock).not.toHaveBeenCalled();
  });

  /**
   * THE GUARD, FED A LYING SERVER. `importable: true` and no price is the one answer the real door cannot give, and it is the
   * one the guard exists for: there must be no path that posts that row and lets the order door write `sellingPrice ?? 0`.
   */
  it('— and a row the server wrongly calls importable, with no price, is not posted: it fails by its line and nothing is created', async () => {
    await readFile([serverRow({ sellingPrice: null })]);
    await userEvent.setup().click(screen.getByText(/استورد 1 طلباً/));
    expect(await screen.findByText('صفٌّ ناقص — لا يُنشأ'), 'الصفُّ لم يُرفَض بسببه').toBeTruthy();
    expect(apiJsonMock, 'طلبٌ بلا سعرٍ وصل باب الإنشاء').not.toHaveBeenCalled();
  });

  /** THE CONTROL — without it the test above passes on a screen that posts nothing at all. */
  it('— while the same row WITH its price is posted, with the price the sheet gave', async () => {
    apiJsonMock.mockResolvedValue({});
    const onDone = vi.fn();
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ rows: [serverRow()], counts: COUNTS, recentDays: 14 }) } as unknown as Response);
    render(<ImportOrdersDialog onClose={() => {}} onDone={onDone} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const user = userEvent.setup();
    await user.upload(input, new File(['x'], 'orders.csv', { type: 'text/csv' }));
    await user.click(await screen.findByText(/استورد 1 طلباً/));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(1));
    expect(apiJsonMock).toHaveBeenCalledTimes(1);
    const [url, init] = apiJsonMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('/api/orders');
    expect(JSON.parse(init.body)).toMatchObject({ sellingPrice: 12, quantity: 1, viaImport: true });
  });
});
