// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/lib/guard-source';
import { arDateTime } from '@/lib/format';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «الطلبات» — THE FILTERS AND THE ROWS MUST NOT RUN INTO EACH OTHER.
 *
 * The owner, 21/10, with two screenshots: «الطلبات الفلاتر داخلين ببعضص و
 * بيانات الطلب كذلك البيانات متداخلة» and «نسخة الهاتف بالطلبات كلو داخل
 * ببعضو». Three faults, each measured in a browser before it was touched:
 *
 *   1. The product box in the filter row asked for `min-w-[200px]` in a cell
 *      of 177px (a 1180px window) and ran UNDER «كل المحافظات».
 *   2. The facts of a row were written into ONE string each — a name, a
 *      « · », a number — which is a single bidirectional run: the number
 *      landed flush against the name and its separator ended up on the far
 *      side of it («محمد احسن937881204»).
 *   3. On a phone the row was four things on a line that cannot wrap, and one
 *      of them (the money and the buttons) refuses to shrink: the words were
 *      left ~40px. At 360px with the longest names, 131 boxes sat outside
 *      their row, 28 sat on top of one another, and the page itself was 381px
 *      wide in a 360px window. The card around the list also kept 24px of
 *      padding on each side that `className="p-0"` asked it to drop —
 *      `CardContent` writes `p-6` AND the caller's `p-0`, and the later rule
 *      wins.
 *
 * jsdom measures nothing, so what is held here is the SHAPE that makes the
 * browser do the right thing — read off the rendered screen, because the
 * measuring itself was done in a real browser (see the pull request).
 * ═══════════════════════════════════════════════════════════════════════
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/orders',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  apiJson: vi.fn(async () => ({})),
}));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    locale: 'ar',
    t: { orders: 'الطلبات', export: 'تصدير CSV', quickCreateOrder: 'إدخال طلب سريع' },
    currentUser: { id: 'u1', name: 'سارة', role: 'SUPER_ADMIN', permissions: [], status: 'ACTIVE' },
  }),
}));
vi.mock('@/hooks/useRegions', () => ({ useRegions: () => ({ regions: [] }) }));
vi.mock('@/hooks/useProducts', () => ({ useProducts: () => ({ products: [] }) }));
vi.mock('@/components/ui/Confirm', () => ({ useTell: () => vi.fn(), useConfirm: () => vi.fn() }));
vi.mock('@/components/labels/LabelSize', () => ({ useLabelSize: () => 'thermal', LabelSizePicker: () => null }));
vi.mock('@/components/labels/openWaybills', () => ({
  openWaybills: vi.fn(),
  describeRefused: () => '',
  WaybillError: class extends Error {},
}));
vi.mock('@/components/orders/CreateOrderModal', () => ({ CreateOrderModal: () => null }));
vi.mock('@/components/orders/AiOrderModal', () => ({ AiOrderModal: () => null }));
vi.mock('@/components/orders/OrderDetailModal', () => ({ OrderDetailModal: () => null }));
vi.mock('@/components/orders/ImportOrdersDialog', () => ({ ImportOrdersDialog: () => null }));
vi.mock('@/components/scan/ScanButton', () => ({ ScanButton: () => null }));
vi.mock('@/components/ui/SavedViews', () => ({ SavedViews: () => null }));
vi.mock('@/components/orders/CustomerHistory', () => ({ CustomerHistoryButton: () => null }));

import { OrdersScreen } from './OrdersScreen';

const CREATED = '2026-10-20T12:00:00.000Z';
const ORDER = {
  id: 'o1',
  orderNumber: 'ORD-26-5000',
  state: 'CONFIRMED',
  customer: { id: 'c1', fullName: 'نور الحسن', rawPhone: '0791234567', phone: '0791234567', city: 'عمّان' },
  region: { name: 'إربد' },
  productNameSnapshot: 'ساعة ذكية',
  quantity: 2,
  offer: { name: 'اشترِ 3 واحصل على 1 مجاناً' },
  source: 'Sheet import',
  moderator: { name: 'سارة' },
  createdAt: CREATED,
  totalAmount: 40,
  confirmationStatus: 'NEW',
  deliveryProvider: { kind: 'COMPANY', name: 'ناقل' },
  trackingNumber: 'TRK-900-000',
};

const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/orders?')) {
      return json({
        orders: [ORDER],
        pagination: { total: 1, page: 1, limit: 25, totalPages: 1 },
        currency: { code: 'JOD', minorUnit: 3 },
        dialCode: '962',
      });
    }
    if (url.startsWith('/api/delivery-providers')) return json({ providers: [] });
    if (url.startsWith('/api/orders/sources')) return json({ sources: [] });
    return json({});
  });
});

afterEach(cleanup);

const tokens = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const draw = async () => {
  render(<OrdersScreen />);
  return screen.findByText('ORD-26-5000');
};
/** The row (`li`) an element sits in, and its first flex line. */
const rowOf = (el: Element) => el.closest('li') as HTMLElement;

describe('the filter row', () => {
  it('— the six boxes are cells of one grid, and no cell is given a floor wider than itself', async () => {
    await draw();
    const grid = screen.getByLabelText('فلتر الحالة').closest('.grid') as HTMLElement;
    expect(grid, 'لا شبكةَ للفلاتر').toBeTruthy();
    expect(grid.children).toHaveLength(6);
    for (const cell of Array.from(grid.children)) {
      const floors = tokens(cell).filter((c) => /^min-w-/.test(c) && c !== 'min-w-0');
      expect(floors, `خليّةٌ بحدٍّ أدنى للعرض: ${floors.join(' ')}`).toEqual([]);
    }
  });

  it('and the product box is allowed to be as narrow as its cell — `min-w-0`, as the dropdowns beside it', async () => {
    await draw();
    const picker = screen.getByText('كل المنتجات').closest('.grid > *') as HTMLElement;
    expect(picker, 'صندوقُ المنتج ليس خليّةً في الشبكة').toBeTruthy();
    expect(tokens(picker)).toContain('min-w-0');
  });

  it('and on a desk they are ONE row — as many columns as cells, so a seventh filter has to change the grid on purpose', async () => {
    await draw();
    const grid = screen.getByLabelText('فلتر الحالة').closest('.grid') as HTMLElement;
    expect(tokens(grid)).toContain(`lg:grid-cols-${grid.children.length}`);
  });
});

describe('a row on a phone', () => {
  it('— is a line that WRAPS below `lg`, so what cannot fit beside the words goes under them instead of crushing them', async () => {
    const row = rowOf(await draw());
    const line = row.firstElementChild as HTMLElement;
    expect(tokens(line)).toContain('flex-wrap');
    expect(tokens(line), 'عاد السطرُ لا يلتفّ على الشاشات الضيّقة').toContain('lg:flex-nowrap');
    // Built, not written: Tailwind scans test files too (comments included), and the bare class written out here made the
    // sheet 30 bytes longer for a class no screen uses.
    expect(tokens(line)).not.toContain(['flex', 'nowrap'].join('-'));
  });

  it('and the words keep a floor and take what is left, while the money and the buttons never shrink and go to the end', async () => {
    const row = rowOf(await draw());
    const line = row.firstElementChild as HTMLElement;
    const [, , words, right] = Array.from(line.children) as HTMLElement[];
    expect(tokens(words)).toContain('flex-1');
    expect(tokens(words).filter((c) => /^min-w-\[\d+px\]$/.test(c)), 'للكلماتِ حدٌّ أدنى').toHaveLength(1);
    expect(tokens(words), '`min-w-0` يُسقطُ الحدَّ الأدنى').not.toContain('min-w-0');
    expect(tokens(right)).toContain('shrink-0');
    expect(tokens(right)).toContain('ms-auto');
    // …and the money is in that column, with the buttons.
    expect(right.textContent).toContain('40');
    expect(right.querySelector('a[title="اتصال"]')).toBeTruthy();
  });

  it('and the order number and the waybill number are never broken at their hyphens, and never squeezed', async () => {
    const number = await draw();
    expect(tokens(number)).toEqual(expect.arrayContaining(['whitespace-nowrap', 'shrink-0']));
    expect(number.getAttribute('dir')).toBe('ltr');
    const waybill = within(rowOf(number), 'TRK-900-000');
    expect(tokens(waybill)).toEqual(expect.arrayContaining(['whitespace-nowrap', 'shrink-0']));
    expect(waybill.getAttribute('dir')).toBe('ltr');
  });

  it('and the list is not inset by a padding the screen asked to drop: the box around the rows carries no `p-6`', async () => {
    const row = rowOf(await draw());
    const box = row.closest('ul')!.parentElement as HTMLElement;
    expect(tokens(box)).not.toContain('p-6');
    expect(stripComments(readFileSync(join(process.cwd(), 'src/components/screens/OrdersScreen.tsx'), 'utf8'))).not.toMatch(/CardContent/);
  });
});

describe('the facts of a row', () => {
  it('— the name, the number and the place are three boxes of one wrapping line, with no « · » typed between them', async () => {
    const row = rowOf(await draw());
    const name = within(row, 'نور الحسن');
    const line = name.parentElement as HTMLElement;
    expect(tokens(line)).toEqual(expect.arrayContaining(['flex', 'flex-wrap']));
    expect(Array.from(line.children).map((c) => c.textContent)).toEqual(['نور الحسن', '0791234567', 'إربد']);
    // Nothing is typed BETWEEN the boxes: the line is the three of them end to end.
    expect(line.textContent).toBe('نور الحسن0791234567إربد');
    // A name or a place written in Latin letters must not be read as Arabic: each takes the direction of its own first letter.
    expect(name.getAttribute('dir')).toBe('auto');
    expect(within(row, 'إربد').getAttribute('dir')).toBe('auto');
  });

  it('and the number is a left-to-right box of its OWN — its digits and nothing else — so it cannot land against the name', async () => {
    const row = rowOf(await draw());
    const phone = within(row, '0791234567');
    expect(phone.getAttribute('dir')).toBe('ltr');
    expect(phone.textContent).toBe('0791234567');
  });

  it('and where it came from and when are boxes too: the source takes the direction of its own first letter, the date is whole', async () => {
    const row = rowOf(await draw());
    const source = within(row, 'Sheet import');
    expect(source.getAttribute('dir')).toBe('auto');
    expect(source.textContent).toBe('Sheet import');
    const line = source.parentElement as HTMLElement;
    expect(Array.from(line.children).map((c) => c.textContent)).toEqual(['Sheet import', 'سارة', arDateTime(CREATED)]);
    // The one « · » on this line is the date's own (`20 أكتوبر 2026 · 15:00`); none is typed between the boxes.
    expect(line.textContent).toBe('Sheet importسارة' + arDateTime(CREATED));
    expect(tokens(line)).toContain('flex-wrap');
    // The date is one piece and is never broken across two lines of the row («20 أكتوبر» above, «2026» under it).
    expect(tokens(within(row, arDateTime(CREATED)))).toContain('whitespace-nowrap');
  });

  it('and what is in it is a box per fact as well: the product, « × 2 », and the offer', async () => {
    const row = rowOf(await draw());
    const product = within(row, 'ساعة ذكية');
    const line = product.parentElement as HTMLElement;
    expect(Array.from(line.children).map((c) => c.textContent)).toEqual(['ساعة ذكية', '× 2', 'اشترِ 3 واحصل على 1 مجاناً']);
    expect(tokens(line)).toContain('flex-wrap');
    // «× 2» never splits from its number, and the product's name takes the direction of its own first letter.
    expect(tokens(within(row, '× 2'))).toContain('whitespace-nowrap');
    expect(product.getAttribute('dir')).toBe('auto');
  });

  it('and a line is allowed to wrap between boxes: none of the four is cut off with `truncate`', async () => {
    const row = rowOf(await draw());
    const words = (row.firstElementChild as HTMLElement).children[2] as HTMLElement;
    expect(words.querySelectorAll('.truncate'), 'سطرٌ يُقطَع بـ truncate').toHaveLength(0);
  });
});

/** The text box whose own text is exactly `text`, inside a row. */
function within(row: HTMLElement, text: string): HTMLElement {
  const hit = Array.from(row.querySelectorAll('span')).filter((s) => s.textContent === text && s.children.length === 0);
  expect(hit, `«${text}» ليست في صندوقٍ لحالها`).toHaveLength(1);
  return hit[0] as HTMLElement;
}
