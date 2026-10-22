// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE DIALOG THAT SORTS THE PRODUCTS WITH NO CATEGORY — «انتا صنف افضل» (THE OWNER, 22/10).
 *
 * Each row arrives with the shelf its NAME points at already chosen, a name no rule recognises arrives blank, and every row is a
 * select he can change. Nothing is written until he presses «طبّق», and the press sends only the rows that have a shelf. What is held
 * here is what the person SEES and what the press SENDS — the rule that picks the shelf is held in `product-categories.test.ts`, the
 * door that files in `categorise/route.test.ts`.
 * ═══════════════════════════════════════════════════════════════════════
 */

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(), apiJson: vi.fn() }));

import { apiJson } from '@/lib/api-client';
import { CategoriseDialog, type UnfiledProduct } from './CategoriseDialog';

const apiJsonMock = vi.mocked(apiJson);

const P = (id: string, name: string, nameEn: string | null = null): UnfiledProduct => ({ id, label: name, name, nameEn, sku: `SKU-${id}` });
const CREAM = P('p1', 'كريم حرير');
const OVEN = P('p2', 'محضر الطعام');
const UNKNOWN = P('p3', 'سليكس');
const PRODUCTS = [CREAM, OVEN, UNKNOWN];

/** What `GET /api/categories` and `POST /api/products/categorise` answer — the company has one shelf, spelt without the shadda. */
let shelves: Array<{ name: string }> | 'fails';
let answer: unknown;
let sent: Array<{ url: string; init?: any }>;
let hold: Promise<unknown> | null;

beforeEach(() => {
  shelves = [{ name: 'مكملات' }, { name: 'العناية بالبشرة' }];
  answer = { filed: 2, skipped: 0, created: ['أجهزة منزلية'] };
  sent = [];
  hold = null;
  apiJsonMock.mockReset();
  apiJsonMock.mockImplementation((async (url: string, init?: any) => {
    sent.push({ url, init });
    if (url === '/api/categories') {
      if (shelves === 'fails') throw new Error('Forbidden');
      return { categories: shelves };
    }
    if (hold) await hold;
    if (answer instanceof Error) throw answer;
    return answer;
  }) as never);
});
afterEach(cleanup);

const posted = () => sent.filter((s) => s.url === '/api/products/categorise');
const body = () => JSON.parse(posted()[0].init.body) as { items: Array<{ productId: string; category: string }> };
const mount = (products: UnfiledProduct[] = PRODUCTS, over: { onClose?: () => void; onDone?: (r: any) => void } = {}) =>
  render(<CategoriseDialog products={products} onClose={over.onClose ?? (() => {})} onDone={over.onDone ?? (() => {})} />);
const ready = async (products?: UnfiledProduct[], over?: { onClose?: () => void; onDone?: (r: any) => void }) => {
  mount(products, over);
  await screen.findByLabelText(`تصنيف ${(products ?? PRODUCTS)[0].label}`);
};
const select = (label: string) => screen.getByLabelText(`تصنيف ${label}`) as HTMLSelectElement;
const applyButton = () => screen.getByText(/طبّق على|جارٍ التصنيف/).closest('button') as HTMLButtonElement;

describe('while the shelves are being read', () => {
  it('— says so, draws no row, and the press is disabled', async () => {
    let release: (v: unknown) => void = () => {};
    apiJsonMock.mockImplementationOnce((() => new Promise((r) => (release = r))) as never);
    mount();
    expect(screen.getByText('جارٍ تحميل تصنيفاتك…')).toBeTruthy();
    expect(screen.queryByLabelText('تصنيف كريم حرير')).toBeNull();
    expect(applyButton().disabled).toBe(true);
    release({ categories: shelves });
    await screen.findByLabelText('تصنيف كريم حرير');
    expect(screen.queryByText('جارٍ تحميل تصنيفاتك…')).toBeNull();
  });
});

describe('what the person sees', () => {
  it('— every row arrives with the shelf its name points at already chosen', async () => {
    await ready();
    expect(select('كريم حرير').value).toBe('العناية بالبشرة');
    expect(select('محضر الطعام').value).toBe('أجهزة منزلية');
  });

  it('— a name no rule recognises arrives blank, “بلا تصنيف”', async () => {
    await ready();
    expect(select('سليكس').value).toBe('');
    expect(within(select('سليكس')).getByRole('option', { name: 'بلا تصنيف' })).toBeTruthy();
  });

  it('— a suggested shelf the company already has is chosen in the company’s own spelling, not as a second one', async () => {
    await ready([P('p4', 'فيتامين د')]);
    expect(select('فيتامين د').value).toBe('مكملات');
    const names = within(select('فيتامين د')).getAllByRole('option').map((o) => o.textContent);
    expect(names.filter((n) => n === 'مكملات' || n === 'مكمّلات' || n === 'مكمّلات (جديد)')).toEqual(['مكملات']);
  });

  it('— the company’s own shelves are offered first, then the suggested ones it lacks, each marked «جديد»', async () => {
    await ready();
    const labels = within(select('كريم حرير')).getAllByRole('option').map((o) => o.textContent);
    expect(labels.slice(0, 3)).toEqual(['بلا تصنيف', 'مكملات', 'العناية بالبشرة']);
    const rest = labels.slice(3);
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((l) => l?.endsWith(' (جديد)'))).toBe(true);
    expect(rest).toContain('أجهزة منزلية (جديد)');
    // A shelf the company has is not offered a second time as a new one.
    expect(rest).not.toContain('العناية بالبشرة (جديد)');
  });

  it('— says how many have a shelf, and names the shelves that pressing would make', async () => {
    await ready();
    expect(screen.getByText(/2 من 3 منتجاً لها تصنيف مختار/)).toBeTruthy();
    expect(screen.getByText(/سيُنشأ: أجهزة منزلية\./)).toBeTruthy();
    expect(applyButton().textContent).toBe('طبّق على 2 منتجاً');
  });

  it('— and the count follows what he changes: a shelf that exists, a blank, a new one', async () => {
    await ready();
    const user = userEvent.setup();
    await user.selectOptions(select('محضر الطعام'), 'مكملات');
    expect(screen.queryByText(/سيُنشأ/)).toBeNull();
    await user.selectOptions(select('كريم حرير'), '');
    expect(screen.getByText(/1 من 3 منتجاً/)).toBeTruthy();
    await user.selectOptions(select('سليكس'), 'إلكترونيات');
    expect(screen.getByText(/سيُنشأ: إلكترونيات\./)).toBeTruthy();
    expect(applyButton().textContent).toBe('طبّق على 2 منتجاً');
  });

  it('— the English name is read too', async () => {
    await ready([P('p5', 'منتج', 'Hair Shampoo')]);
    expect(select('منتج').value).toBe('العناية بالشعر');
  });
});

describe('what the press sends', () => {
  it('— only the rows that have a shelf, each with the shelf shown for it, in one POST', async () => {
    const onDone = vi.fn();
    await ready(PRODUCTS, { onDone });
    await userEvent.setup().click(applyButton());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(posted()).toHaveLength(1);
    expect(posted()[0].init.method).toBe('POST');
    expect(posted()[0].init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(body()).toEqual({
      items: [
        { productId: 'p1', category: 'العناية بالبشرة' },
        { productId: 'p2', category: 'أجهزة منزلية' },
      ],
    });
  });

  it('— the shelf he changed, not the one that was suggested; a row he emptied is not sent', async () => {
    const onDone = vi.fn();
    await ready(PRODUCTS, { onDone });
    const user = userEvent.setup();
    await user.selectOptions(select('كريم حرير'), 'مكملات');
    await user.selectOptions(select('محضر الطعام'), '');
    await user.selectOptions(select('سليكس'), 'صحة وأعشاب');
    await user.click(applyButton());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body().items).toEqual([
      { productId: 'p1', category: 'مكملات' },
      { productId: 'p3', category: 'صحة وأعشاب' },
    ]);
  });

  it('— hands the door’s answer to whoever opened the dialog', async () => {
    const onDone = vi.fn();
    answer = { filed: 7, skipped: 1, created: ['أجهزة منزلية'] };
    await ready(PRODUCTS, { onDone });
    await userEvent.setup().click(applyButton());
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ filed: 7, skipped: 1, created: ['أجهزة منزلية'] }));
  });

  it('— sends nothing, and cannot be pressed, when no row has a shelf', async () => {
    await ready();
    const user = userEvent.setup();
    await user.selectOptions(select('كريم حرير'), '');
    await user.selectOptions(select('محضر الطعام'), '');
    expect(applyButton().textContent).toBe('طبّق على 0 منتجاً');
    expect(applyButton().disabled).toBe(true);
    await user.click(applyButton());
    expect(posted()).toHaveLength(0);
  });

  it('— at most 300 in one press, and says so; the rest wait for the next', async () => {
    const many = Array.from({ length: 305 }, (_, i) => P(`m${i}`, `كريم رقم ${i}`));
    const onDone = vi.fn();
    await ready(many, { onDone });
    expect(applyButton().textContent).toBe('طبّق على 300 منتجاً');
    expect(screen.getByText(/يُطبَّق 300 في المرّة الواحدة/)).toBeTruthy();
    await userEvent.setup().click(applyButton());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body().items).toHaveLength(300);
    expect(body().items[0].productId).toBe('m0');
    expect(body().items[299].productId).toBe('m299');
  });

  it('— and says nothing about a limit when there is no need', async () => {
    await ready();
    expect(screen.queryByText(/في المرّة الواحدة/)).toBeNull();
  });
});

describe('when something goes wrong', () => {
  it('— the door’s sentence is shown, the dialog stays, and the press can be made again', async () => {
    answer = new Error('لا تملك صلاحية تعديل المنتجات.');
    const onDone = vi.fn();
    await ready(PRODUCTS, { onDone });
    const user = userEvent.setup();
    await user.click(applyButton());
    expect(await screen.findByText('لا تملك صلاحية تعديل المنتجات.')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(applyButton().disabled).toBe(false);
    answer = { filed: 2, skipped: 0, created: [] };
    await user.click(applyButton());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('لا تملك صلاحية تعديل المنتجات.')).toBeNull();
  });

  it('— while the request is in flight the press says so and cannot be made twice', async () => {
    let release: (v: unknown) => void = () => {};
    hold = new Promise((r) => (release = r));
    await ready();
    const user = userEvent.setup();
    await user.click(applyButton());
    await waitFor(() => expect(applyButton().textContent).toContain('جارٍ التصنيف…'));
    expect(applyButton().disabled).toBe(true);
    await user.click(applyButton());
    expect(posted()).toHaveLength(1);
    release(undefined);
    await waitFor(() => expect(applyButton().textContent).toContain('طبّق على'));
  });

  it('— when the company’s shelves cannot be read it says so, offers only the suggested ones as new, and still works', async () => {
    shelves = 'fails';
    const onDone = vi.fn();
    await ready(PRODUCTS, { onDone });
    expect(screen.getByText(/تعذّر تحميل تصنيفاتك الحالية/)).toBeTruthy();
    expect(select('كريم حرير').value).toBe('العناية بالبشرة');
    expect(within(select('كريم حرير')).getByRole('option', { name: 'العناية بالبشرة (جديد)' })).toBeTruthy();
    await userEvent.setup().click(applyButton());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('— and the warning is absent when they were read', async () => {
    await ready();
    expect(screen.queryByText(/تعذّر تحميل تصنيفاتك الحالية/)).toBeNull();
  });

  it('— Escape closes it too, and sends nothing', async () => {
    const onClose = vi.fn();
    await ready(PRODUCTS, { onClose });
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(posted()).toHaveLength(0);
  });

  it('— “إغلاق” closes it and sends nothing', async () => {
    const onClose = vi.fn();
    await ready(PRODUCTS, { onClose });
    await userEvent.setup().click(screen.getByText('إغلاق'));
    expect(onClose).toHaveBeenCalled();
    expect(posted()).toHaveLength(0);
  });
});
