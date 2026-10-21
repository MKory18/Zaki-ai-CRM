// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/lib/guard-source';

/**
 * THE OWNER'S TWO BUTTONS, AS THE SCREEN DRAWS THEM.
 *
 * «بدي زر لحذف المتجر اذا ما كان مدخل عليه اشي» and «بدي زر لحذف المدن اذا
 * ما كان مربوط فيها ولا طلب».
 *
 * What the screen owes, beyond calling the route:
 *
 *   • the answer BEFORE a click — a store that may go shows its button, one
 *     that may not shows WHY, as a sentence, never a dead button;
 *   • nothing at all for somebody who may only look, and nothing drawn on a
 *     guess when the asking failed;
 *   • the typed name before a store goes, and Cancel being no;
 *   • and after any answer, the screen's own picture reloaded — a refusal
 *     means the picture was old.
 */

const { api, refresh, user } = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  user: { current: null as unknown },
}));

vi.mock('@/lib/api-client', () => ({ apiJson: (...a: unknown[]) => api(...a) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/settings/geo',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ currentUser: user.current }) }));
vi.mock('@/components/settings/StorefrontSettings', () => ({ StorefrontSettings: () => null }));
vi.mock('@/components/settings/StoreIdentityCard', () => ({ StoreIdentityCard: () => null }));

import { GeoSettingsScreen } from './GeoSettingsScreen';
import { ConfirmProvider } from '@/components/ui/Confirm';
import { ToastProvider } from '@/components/ui/Toast';

const manager = { id: 'u1', role: 'COMPANY_ADMIN', permissions: ['geo.view', 'geo.manage'] };
const viewer = { id: 'u2', role: 'SUPERVISOR', permissions: ['geo.view'] };

const store = (id: string, name: string) => ({ id, name, slug: id, status: 'ACTIVE', type: 'MULTI_PRODUCT' });
const COUNTRY = {
  id: 'c1', code: 'SY', name: 'سوريا', currencyCode: 'USD', minorUnit: 2, workHoursStart: '09:00', workHoursEnd: '17:00',
  weekendDays: [5], timezone: 'Asia/Damascus', orderPrefix: 'ORD', allowNegativeStock: false, isActive: true,
  stores: [store('s-empty', 'متجر فاضي'), store('s-busy', 'صحة بلس')],
  _count: { regions: 2, orders: 10 },
};

/** What the server says right now — a claim changes it before the screen asks. */
let storeBlockers: Record<string, { key: string; text: string; count?: number }[]>;
let regionUsage: Record<string, { key: string; text: string; count?: number }[]> | null;
let usageFails: boolean;
let deleteAnswer: Error | null;
let calls: { url: string; method: string; body?: unknown }[];

beforeEach(() => {
  vi.clearAllMocks();
  user.current = manager;
  usageFails = false;
  deleteAnswer = null;
  calls = [];
  storeBlockers = {
    's-empty': [],
    's-busy': [
      { key: 'order', text: 'الطلبات (42)', count: 42 },
      { key: 'customer', text: 'العملاء (7)', count: 7 },
    ],
  };
  regionUsage = {
    r1: [],
    r2: [{ key: 'orders', text: 'الطلبات (3)', count: 3 }],
  };
  api.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'DELETE') {
      if (deleteAnswer) throw deleteAnswer;
      return { success: true };
    }
    if (url === '/api/geo/countries') return { countries: [COUNTRY] };
    if (url === '/api/geo/stores/usage') {
      if (usageFails) throw new Error('HTTP 403');
      return { stores: Object.fromEntries(Object.entries(storeBlockers).map(([id, blockers]) => [id, { blockers }])) };
    }
    if (url === '/api/geo/countries/c1/regions') {
      return { regions: [{ id: 'r1', name: 'عمّان' }, { id: 'r2', name: 'إربد' }], usage: regionUsage };
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
});
afterEach(() => cleanup());

const draw = async () => {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <GeoSettingsScreen />
      </ConfirmProvider>
    </ToastProvider>
  );
  await screen.findByText('متجر فاضي');
  // The usage answer lands after the countries; wait for it when it is going to.
  if (user.current === manager && !usageFails) await screen.findByText(/لا يُحذف —/);
};
const asked = (url: string, method = 'GET') => calls.filter((c) => c.url === url && c.method === method);

// ───────────────────────── a store ─────────────────────────

describe('under each store', () => {
  it('— the empty one offers its delete control; the one with things in it says why not, and has no control', async () => {
    await draw();
    expect(screen.getByRole('button', { name: /حذف المتجر — لا شيء مُدخَل عليه/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /حذف المتجر/ })).toHaveLength(1);
    expect(screen.getByText(/لا يُحذف — الطلبات \(42\) · العملاء \(7\)/)).toBeTruthy();
  });

  it('and the reasons are the first three, with the rest counted, so a store with much in it is a line and not a page', async () => {
    storeBlockers['s-busy'] = ['الطلبات (1)', 'العملاء (2)', 'المنتجات (3)', 'المحافظ المالية (4)', 'الحملات (5)'].map((text, i) => ({ key: `k${i}`, text }));
    await draw();
    expect(screen.getByText(/لا يُحذف — الطلبات \(1\) · العملاء \(2\) · المنتجات \(3\) و2 غيرها/)).toBeTruthy();
  });

  it('and the answer is asked for once, and only by somebody who may press the button', async () => {
    await draw();
    expect(asked('/api/geo/stores/usage')).toHaveLength(1);
    cleanup();

    calls = [];
    user.current = viewer;
    await draw();
    expect(asked('/api/geo/stores/usage')).toHaveLength(0);
    expect(screen.queryByText(/لا يُحذف/)).toBeNull();
    expect(screen.queryByRole('button', { name: /حذف المتجر/ })).toBeNull();
  });

  it('and when the asking fails no button is drawn on a guess — the stores are still there', async () => {
    usageFails = true;
    await draw();
    expect(screen.getByText('صحة بلس')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /حذف المتجر/ })).toBeNull();
    expect(screen.queryByText(/لا يُحذف/)).toBeNull();
  });

  it('and it has a line of its own under the row — in the name’s column it was one word wide on a phone, and a third button squeezes the name out', () => {
    const src = stripComments(readFileSync(join(process.cwd(), 'src/components/screens/GeoSettingsScreen.tsx'), 'utf8'));
    // The row wraps, so a full-width child lands on the next line instead of squeezing its neighbours…
    expect(src).toMatch(/<li className="flex flex-wrap items-center gap-3 p-4">/);
    // …and that is what the removal line is: a full-width child of the row, after its buttons.
    const at = src.search(/<div className="w-full">\s*<StoreRemoval/);
    expect(at, 'السطر ليس صفّاً كامل العرض').toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(src.indexOf("'إيقاف مؤقت'"));
  });
});

describe('deleting a store', () => {
  const press = () => fireEvent.click(screen.getByRole('button', { name: /حذف المتجر — لا شيء مُدخَل عليه/ }));
  const dialog = () => screen.getByRole('dialog');

  it('— asks for the name, and the button waits until something is typed', async () => {
    await draw();
    press();
    expect(within(dialog()).getByText('حذف المتجر «متجر فاضي»؟')).toBeTruthy();
    expect(within(dialog()).getByText(/لا يمكن التراجع/)).toBeTruthy();
    expect((within(dialog()).getByRole('button', { name: 'احذف المتجر' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog()).getByRole('textbox'), { target: { value: 'متجر فاضي' } });
    expect((within(dialog()).getByRole('button', { name: 'احذف المتجر' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('and Cancel is no: nothing is sent', async () => {
    await draw();
    press();
    fireEvent.change(within(dialog()).getByRole('textbox'), { target: { value: 'متجر فاضي' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'إلغاء' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(asked('/api/geo/stores/s-empty', 'DELETE')).toHaveLength(0);
  });

  it('and the typed name is what is sent — the route compares it, the screen does not pre-judge', async () => {
    await draw();
    press();
    fireEvent.change(within(dialog()).getByRole('textbox'), { target: { value: 'متجر فاضي' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'احذف المتجر' }));
    await waitFor(() => expect(asked('/api/geo/stores/s-empty', 'DELETE')).toHaveLength(1));
    expect(asked('/api/geo/stores/s-empty', 'DELETE')[0].body).toEqual({ confirm: 'متجر فاضي' });
  });

  it('and a wrong name is sent as it was typed — the route is the judge, the screen does not pre-judge', async () => {
    await draw();
    press();
    fireEvent.change(within(dialog()).getByRole('textbox'), { target: { value: 'اسم خطأ' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'احذف المتجر' }));
    await waitFor(() => expect(asked('/api/geo/stores/s-empty', 'DELETE')).toHaveLength(1));
    expect(asked('/api/geo/stores/s-empty', 'DELETE')[0].body).toEqual({ confirm: 'اسم خطأ' });
  });

  it('and after it goes the screen reloads, and so does the page around it — the header’s switcher is drawn there', async () => {
    await draw();
    const before = asked('/api/geo/countries').length;
    press();
    fireEvent.change(within(dialog()).getByRole('textbox'), { target: { value: 'متجر فاضي' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'احذف المتجر' }));
    await screen.findByText('حُذف المتجر «متجر فاضي»');
    await waitFor(() => expect(asked('/api/geo/countries').length).toBe(before + 1));
    expect(asked('/api/geo/stores/usage').length).toBe(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('and a refusal — a wrong name, or something that arrived since — is said as the route said it, and the screen is asked again', async () => {
    await draw();
    deleteAnswer = new Error('لا يُحذف المتجر: الطلبات (1)');
    press();
    fireEvent.change(within(dialog()).getByRole('textbox'), { target: { value: 'متجر فاضي' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'احذف المتجر' }));
    await screen.findByText('لا يُحذف المتجر: الطلبات (1)');
    await waitFor(() => expect(asked('/api/geo/stores/usage').length).toBe(2));
    expect(refresh).not.toHaveBeenCalled();
  });
});

// ───────────────────────── a city ─────────────────────────

describe('the cities', () => {
  const open = async () => {
    await draw();
    fireEvent.click(screen.getByRole('button', { name: 'الإعدادات' }));
    await screen.findByText('إربد');
    await waitFor(() => expect(screen.getByText(/تظهر علامة الحذف/)).toBeTruthy());
  };

  it('— a cross on the city nothing names, and on no other', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'حذف المحافظة عمّان' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'حذف المحافظة إربد' })).toBeNull();
  });

  it('and the city that stays says why, where the pointer rests', async () => {
    await open();
    expect(screen.getByText('إربد').closest('span')!.getAttribute('title')).toBe('لا تُحذف — الطلبات (3)');
    // …and the one that may go says nothing of the kind.
    expect(screen.getByText('عمّان').closest('span')!.getAttribute('title')).toBeNull();
  });

  it('and the rule is on the screen in a sentence — nobody has to find a cross to learn there is one', async () => {
    await open();
    expect(screen.getByText('تظهر علامة الحذف على المحافظة التي لا طلب عليها ولا أجرة توصيل — وحدها تُحذف.')).toBeTruthy();
  });

  it('and somebody who may only look sees no crosses and no sentence about them — the server sent no counts', async () => {
    user.current = viewer;
    regionUsage = null;
    await draw();
    fireEvent.click(screen.getByRole('button', { name: 'الإعدادات' }));
    await screen.findByText('إربد');
    expect(screen.queryByRole('button', { name: /حذف المحافظة/ })).toBeNull();
    expect(screen.queryByText(/تظهر علامة الحذف/)).toBeNull();
  });

  it('and pressing the cross asks first — Cancel is no', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'حذف المحافظة عمّان' }));
    expect(within(screen.getByRole('dialog')).getByText('حذف المحافظة «عمّان»؟')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'إلغاء' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(asked('/api/geo/countries/c1/regions/r1', 'DELETE')).toHaveLength(0);
  });

  it('and yes sends the delete, says so, and reloads the cities AND the country’s own count of them', async () => {
    await open();
    const countries = asked('/api/geo/countries').length;
    const regions = asked('/api/geo/countries/c1/regions').length;
    fireEvent.click(screen.getByRole('button', { name: 'حذف المحافظة عمّان' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'احذف' }));
    await screen.findByText('حُذفت المحافظة «عمّان»');
    expect(asked('/api/geo/countries/c1/regions/r1', 'DELETE')).toHaveLength(1);
    await waitFor(() => expect(asked('/api/geo/countries/c1/regions').length).toBe(regions + 1));
    await waitFor(() => expect(asked('/api/geo/countries').length).toBe(countries + 1));
  });

  it('and a refusal is said as the route said it, and the picture is reloaded all the same', async () => {
    await open();
    const regions = asked('/api/geo/countries/c1/regions').length;
    deleteAnswer = new Error('لا يُحذف المحافظة: الطلبات (1)');
    fireEvent.click(screen.getByRole('button', { name: 'حذف المحافظة عمّان' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'احذف' }));
    await screen.findByText('لا يُحذف المحافظة: الطلبات (1)');
    await waitFor(() => expect(asked('/api/geo/countries/c1/regions').length).toBe(regions + 1));
  });
});
