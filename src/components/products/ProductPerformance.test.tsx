// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/lib/guard-source';

/**
 * «أداء المبيعات» — FOUR EMPTY FIGURES ABOUT A PRODUCT THAT HAS SOLD.
 *
 * The card read `analytics.revenue`, `.netProfit`, `.totalOrders` and `.deliveredOrders` — keys the product's door has
 * never sent. It reads the door that already counts sales per product (`/api/products/grades`, the products list's
 * own grade) and prints what it says: nothing is worked out here, a figure the caller may not see is not drawn at all
 * (never as a zero), and a caller who may not see sales is told so instead of being shown four zeros.
 */

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: (...a: unknown[]) => apiJson(...a) }));

import { ProductPerformance } from './ProductPerformance';

const SALES = { confirmed: 140, delivered: 131, returned: 9, refused: 22, deliveredRevenue: 5246.5, deliveredCogs: 2100, bestDeliveredValue: 40 };
const grade = (over: Record<string, unknown> = {}) => ({
  productId: 'p-1',
  state: 'GRADED',
  tone: 'good',
  label: 'مقيَّم',
  why: 'تسليم 94% من 140 طلباً مؤكَّداً وهامش 59%.',
  score: null,
  sales: SALES,
  readiness: { complete: true, gaps: [] },
  ...over,
});
const answer = (over: Record<string, unknown> = {}) => ({
  window: { start: '2026-07-24T00:00:00Z', end: '2026-10-22T00:00:00Z', days: 90 },
  salesVisible: true,
  costVisible: true,
  grades: [grade()],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  apiJson.mockResolvedValue(answer());
});
afterEach(cleanup);

describe('where it asks', () => {
  it('— the grades door, for THIS product only', async () => {
    render(<ProductPerformance productId="p-1" />);
    await screen.findByText('الإيراد');
    expect(apiJson).toHaveBeenCalledTimes(1);
    expect(apiJson.mock.calls[0][0]).toBe('/api/products/grades?ids=p-1');
  });

  it('and takes the grade that is THIS product’s, whatever else the door sent back', async () => {
    apiJson.mockResolvedValue(
      answer({ grades: [grade({ productId: 'other', sales: { ...SALES, delivered: 7, deliveredRevenue: 11 } }), grade()] })
    );
    render(<ProductPerformance productId="p-1" />);
    await screen.findByText('الإيراد');
    expect(screen.getByText('131')).toBeTruthy();
    expect(screen.queryByText('7')).toBeNull();
  });
});

describe('what it draws', () => {
  it('— the revenue, the cost of the goods, delivered, confirmed, returned and refused, exactly as the door counted them', async () => {
    render(<ProductPerformance productId="p-1" />);
    await screen.findByText('الإيراد');
    const text = document.body.textContent ?? '';
    for (const expected of ['5,246.50', '2,100.00', '131', '140', '9', '22']) expect(text, expected).toContain(expected);
    for (const label of ['الإيراد', 'تكلفة البضاعة', 'موصّل', 'مؤكَّد', 'راجع', 'مرفوض بالهاتف']) expect(screen.getByText(label), label).toBeTruthy();
  });

  it('and each figure sits under ITS OWN label — «راجع» is 9 and «مرفوض بالهاتف» is 22, and not the other way round', async () => {
    render(<ProductPerformance productId="p-1" />);
    await screen.findByText('الإيراد');
    const under = (label: string) => screen.getByText(label).parentElement!.textContent ?? '';
    expect(under('الإيراد')).toContain('5,246.50');
    expect(under('تكلفة البضاعة')).toContain('2,100.00');
    expect(under('موصّل')).toBe('موصّل131');
    expect(under('مؤكَّد')).toBe('مؤكَّد140');
    expect(under('راجع')).toBe('راجع9');
    expect(under('مرفوض بالهاتف')).toBe('مرفوض بالهاتف22');
  });

  it('and asks again, for the NEW product, when the page moves to another one — and shows nothing of the old one while it waits', async () => {
    const { rerender } = render(<ProductPerformance productId="p-1" />);
    await screen.findByText('الإيراد');
    apiJson.mockReturnValueOnce(new Promise(() => undefined));
    rerender(<ProductPerformance productId="p-2" />);
    expect(apiJson).toHaveBeenCalledTimes(2);
    expect(apiJson.mock.calls[1][0]).toBe('/api/products/grades?ids=p-2');
    expect(screen.getByText('جارٍ القراءة…')).toBeTruthy();
    expect(screen.queryByText('الإيراد'), 'أرقامُ المنتجِ السابقِ بقيت على البطاقة').toBeNull();
  });

  it('and the verdict with its sentence — the same words the products list prints for the same product', async () => {
    render(<ProductPerformance productId="p-1" />);
    await screen.findByText('الإيراد');
    expect(screen.getByText('مقيَّم')).toBeTruthy();
    expect(screen.getAllByText('تسليم 94% من 140 طلباً مؤكَّداً وهامش 59%.').length).toBeGreaterThan(0);
  });

  it('and says the window the figures cover — «آخر 90 يوماً» — because «الكل» in a report is a bounded window', async () => {
    render(<ProductPerformance productId="p-1" />);
    expect(await screen.findByText('الطلبات الموصّلة — آخر 90 يوماً')).toBeTruthy();
    cleanup();
    apiJson.mockResolvedValue(answer({ window: { start: null, end: null, days: null } }));
    render(<ProductPerformance productId="p-1" />);
    expect(await screen.findByText('الطلبات الموصّلة')).toBeTruthy();
  });
});

describe('what it does not draw', () => {
  it('— the cost of the goods, for a caller who may not see what goods cost: the tile is ABSENT, not a zero', async () => {
    apiJson.mockResolvedValue(answer({ costVisible: false, grades: [grade({ sales: { ...SALES, deliveredCogs: null } })] }));
    render(<ProductPerformance productId="p-1" />);
    await screen.findByText('الإيراد');
    expect(screen.queryByText('تكلفة البضاعة')).toBeNull();
    expect(document.body.textContent).not.toContain('2,100');
  });

  it('and a caller who may not see sales is told so — no figure at all, not four zeros', async () => {
    apiJson.mockResolvedValue(answer({ salesVisible: false, costVisible: false, grades: [grade({ state: 'SALES_HIDDEN', sales: null })] }));
    render(<ProductPerformance productId="p-1" />);
    expect(await screen.findByText(/لا تظهر إلا لمن معه صلاحية «التقارير»/)).toBeTruthy();
    expect(screen.queryByText('الإيراد')).toBeNull();
    expect(screen.queryByText('موصّل')).toBeNull();
  });

  it('and a product the door has no row for says «لا بيانات» rather than drawing zeros', async () => {
    apiJson.mockResolvedValue(answer({ grades: [] }));
    render(<ProductPerformance productId="p-1" />);
    expect(await screen.findByText('لا بيانات عن هذا المنتج.')).toBeTruthy();
    expect(screen.queryByText('الإيراد')).toBeNull();
  });
});

describe('while it waits, and when it cannot', () => {
  it('— says «جارٍ القراءة…» first, and no figure until the answer is here', () => {
    apiJson.mockReturnValue(new Promise(() => undefined));
    render(<ProductPerformance productId="p-1" />);
    expect(screen.getByText('جارٍ القراءة…')).toBeTruthy();
    expect(screen.queryByText('الإيراد')).toBeNull();
  });

  it('and a failure says what failed', async () => {
    apiJson.mockRejectedValue(new Error('انقطع الاتصال'));
    render(<ProductPerformance productId="p-1" />);
    expect(await screen.findByText('انقطع الاتصال')).toBeTruthy();
  });

  it('and one product’s failure does not stay on the card when the page moves to another — it is read again, and says so', async () => {
    apiJson.mockRejectedValueOnce(new Error('انقطع الاتصال'));
    const { rerender } = render(<ProductPerformance productId="p-1" />);
    expect(await screen.findByText('انقطع الاتصال')).toBeTruthy();
    apiJson.mockReturnValueOnce(new Promise(() => undefined));
    rerender(<ProductPerformance productId="p-2" />);
    expect(screen.queryByText('انقطع الاتصال'), 'فشلُ المنتجِ السابقِ بقي على البطاقة').toBeNull();
    expect(screen.getByText('جارٍ القراءة…')).toBeTruthy();
  });
});

describe('how it is built', () => {
  const src = () => stripComments(readFileSync(join(process.cwd(), 'src/components/products/ProductPerformance.tsx'), 'utf8'));

  it('— not one figure is worked out here: no subtraction of revenue and cost, no sum, no average, and no «صافي الربح»', () => {
    expect(src()).not.toMatch(/deliveredRevenue\s*[-+*/]|[-+*/]\s*sales\.deliveredCogs|deliveredCogs\s*[-+*/]/);
    expect(src()).not.toMatch(/\.reduce\(|Math\.|toFixed\(/);
    expect(src()).not.toContain('صافي الربح');
  });

  it('and it never reads the keys the product’s door has never sent', () => {
    expect(src()).not.toMatch(/analytics\??\./);
  });
});
