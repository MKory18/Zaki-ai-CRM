// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ONE BOX, AND THE TWO THINGS IT MUST NOT DO.
 *
 * It must not become a way to reach a screen this account cannot open, and
 * it must not become a way to look up a customer this account was never
 * allowed to look up. Both are easy to get wrong in a palette, because the
 * usual way to build one is to list everything and hide the rest — which
 * ships the whole map to anybody who reads the bundle.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let viewer: { id: string; role: string; permissions: string[] } | null = null;
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ currentUser: viewer }) }));

import { CommandPalette, useCommandPalette } from './CommandPalette';
import { ALL_ROUTES } from '@/lib/route-registry';

const GROUPS = [
  {
    key: 'ops',
    label: 'التشغيل',
    routes: [
      { path: '/ops/shipments', label: 'الشحنات', icon: 'Truck', permissions: ['ops.ship'] },
      { path: '/ops/returns', label: 'المرتجعات', icon: 'Package', permissions: ['ops.returns'] },
    ],
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  viewer = { id: 'u1', role: 'SUPER_ADMIN', permissions: [] };
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ orders: [{ id: 'o1', orderNumber: 'ORD-4821', customer: { fullName: 'سميّة' } }] }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

function open(props: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  return render(
    <CommandPalette
      groups={GROUPS}
      canSearchRecords
      canSwitchStore
      open
      onClose={props.onClose ?? (() => undefined)}
      {...props}
    />
  );
}

async function type(text: string) {
  const box = screen.getByLabelText('ابحث أو انتقل أو نفّذ');
  await act(async () => {
    fireEvent.change(box, { target: { value: text } });
  });
  return box;
}

/** Let the settle timer fire and the response land. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  await act(async () => undefined);
}

describe('the screens it offers', () => {
  it('are the ones it was GIVEN, never a list of its own', () => {
    // The groups arrive already narrowed by the server. If the palette
    // carried its own copy of the menu, a warehouse account would find
    // "الرواتب" in a box that then 404s — and would learn the screen exists.
    const src = readFileSync(join(process.cwd(), 'src/components/shell/CommandPalette.tsx'), 'utf8');
    expect(src, 'الشاشات لا تأتي من الخارج').toMatch(/const screens[^=]*=[\s\S]{0,40}groups[\s\S]{0,20}flatMap/);
  });

  /**
   * AND «أفعال» IS NOT «شاشات» WITH A VERB FOR A NAME.
   *
   * The first list here was «شحنة جديدة», «إغلاق اليوم», «استلام مرتجع» —
   * and every one was already a route, with a noun for a name. Two lists
   * for one set of doors, one of them hand-kept and free to drift from the
   * permissions the real routes carry.
   */
  it('and no action is a route the menu already names', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/shell/CommandPalette.tsx'), 'utf8');
    const actions = src.slice(src.indexOf('const ACTIONS'), src.indexOf('interface Hit'));
    const paths = [...actions.matchAll(/href: '([^']+)'/g)].map((m) => m[1].split('?')[0]);
    const routes = new Set(ALL_ROUTES.map((r) => r.path));
    const dupes = paths.filter((p) => routes.has(p));
    expect(dupes, `فعلٌ هو شاشةٌ باسمٍ آخر: ${dupes.join('، ')}`).toEqual([]);
    expect(paths.length + [...actions.matchAll(/run: \(\)/g)].length, 'لا أفعال أصلاً').toBeGreaterThan(0);
  });

  it('and typing part of a name narrows to it', async () => {
    open();
    await type('مرتجع');
    expect(screen.queryByText('المرتجعات')).toBeTruthy();
    expect(screen.queryByText('الشحنات')).toBeNull();
  });
});

describe('an open, empty box', () => {
  it('offers the commands that have no route, not the first eight of fifty screens', () => {
    // Fifty screens under an empty query is the menu again in a smaller
    // window, answering a question nobody asked.
    open();
    expect(screen.queryByText('تسجيل الخروج'), 'الصندوق الفارغ لا يعرض الأوامر').toBeTruthy();
    expect(screen.queryByText('الشحنات'), 'الصندوق الفارغ أغرق الأوامر بالشاشات').toBeNull();
  });

  it('and one of them reads itself the other way round once the menu is folded', () => {
    open();
    expect(screen.queryByText('اطوِ القائمة إلى شريط')).toBeTruthy();
    cleanup();
    localStorage.setItem('osm.sidebar.rail', '1');
    open();
    expect(screen.queryByText('وسّع القائمة'), 'الأمر يعِد بطيِّ قائمةٍ مطويّة').toBeTruthy();
    localStorage.clear();
  });
});

describe('the commands it offers', () => {
  it('leave out the store switch when there is nothing to switch to', () => {
    // Exactly the header's own condition: one store and one country means
    // a picker with one thing in it.
    open({ canSwitchStore: false });
    expect(screen.queryByText('تبديل المتجر أو البلد'), 'تبديلٌ إلى لا شيء').toBeNull();
    expect(screen.queryByText('تسجيل الخروج'), 'اختفت بقية الأوامر معه').toBeTruthy();
  });

  it('and offer it when there is', () => {
    open();
    expect(screen.queryByText('تبديل المتجر أو البلد')).toBeTruthy();
  });

  it('and the ones that do something here do not pretend to navigate', async () => {
    open();
    const src = readFileSync(join(process.cwd(), 'src/components/shell/CommandPalette.tsx'), 'utf8');
    // `href` and `run` are alternatives; a row carrying both would navigate
    // away from the thing it just did.
    expect(src).toContain('if (row.href) router.push(row.href);');
    expect(src).toContain('else row.run?.();');
  });
});

/**
 * THE PRIVACY RULE THAT CAME WITH THE OLD BOX.
 *
 * The header's search was the owner's alone, deliberately: the results were
 * always role-scoped, but a box inviting everyone to type a phone number is
 * not the same thing as a box only the owner has. Moving the box must not
 * quietly widen it.
 */
describe('record lookup', () => {
  it('does not even ask when this account was not the one allowed to', async () => {
    open({ canSearchRecords: false });
    await type('01234567');
    await settle();
    expect(fetchMock, 'البحث في السجلات اتّسع لمن لم يكن يملكه').not.toHaveBeenCalled();
    expect(screen.queryByText('ORD-4821')).toBeNull();
  });

  it('and does when it was', async () => {
    open();
    await type('01234567');
    await settle();
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.queryByText('ORD-4821')).toBeTruthy();
  });

  it('goes through the orders endpoint, so the server filters by role again', async () => {
    open();
    await type('4821');
    await settle();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/orders?q=');
  });

  it('and a barcode is one request, not one per character', async () => {
    open();
    const box = screen.getByLabelText('ابحث أو انتقل أو نفّذ');
    // A scanner types the whole code in a few milliseconds.
    for (const value of ['A', 'A1', 'A1B', 'A1B2', 'A1B2C', 'A1B2C3']) {
      await act(async () => {
        fireEvent.change(box, { target: { value } });
      });
    }
    await settle();
    expect(fetchMock.mock.calls.length, 'كل حرف أطلق طلباً').toBe(1);
  });

  it('and two letters is the floor — one letter asks nothing', async () => {
    open();
    await type('A');
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('and a refused request leaves the box usable, not broken', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({}) }));
    open();
    await type('مرتجع');
    await settle();
    // Only the records half came back empty. The screens the term matches
    // are still listed, so a 403 or a dropped line does not blank the box.
    expect(screen.queryByText('المرتجعات'), 'طلبٌ مرفوض أفرغ الصندوق كلّه').toBeTruthy();
  });
});

describe('the keyboard', () => {
  it('walks the list and opens what it lands on', async () => {
    open();
    const box = await type('مرتجع');
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter' });
    });
    expect(push).toHaveBeenCalledWith('/ops/returns');
  });

  it('and Escape closes it', async () => {
    const onClose = vi.fn();
    open({ onClose });
    const box = await type('م');
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('and the cursor cannot walk off either end', async () => {
    open();
    const box = await type('مرتجع'); // exactly one row
    // One act per press. Batched into one, every handler would read the
    // same stale cursor and the clamp would never be exercised.
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowDown', 'Enter']) {
      await act(async () => {
        fireEvent.keyDown(box, { key });
      });
    }
    expect(push, 'المؤشر خرج عن القائمة فلم يفتح شيئاً').toHaveBeenCalledWith('/ops/returns');
  });
});

/** Ctrl/Cmd + K, from anywhere, without every screen knowing about it. */
describe('the shortcut', () => {
  function Harness() {
    const { open: isOpen, setOpen } = useCommandPalette();
    return <span data-testid="state">{isOpen ? 'open' : 'shut'}</span>;
  }

  it('is Ctrl+K and Cmd+K, and toggles', async () => {
    render(<Harness />);
    expect(screen.getByTestId('state').textContent).toBe('shut');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });
    expect(screen.getByTestId('state').textContent).toBe('open');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'K', metaKey: true });
    });
    expect(screen.getByTestId('state').textContent, 'الاختصار لا يُغلق ما فتحه').toBe('shut');
  });

  it('and a bare K still types a K', async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'k' });
    });
    expect(screen.getByTestId('state').textContent).toBe('shut');
  });
});

describe('the header it replaced', () => {
  it('no longer carries a search box of its own', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/shell/Header.tsx'), 'utf8');
    expect(/<input/.test(src), 'بحثٌ ثانٍ ما زال في الترويسة').toBe(false);
    expect(src, 'لا باب إلى الصندوق الواحد').toContain('onSearchClick');
  });

  it('and the door is open to everyone, because navigating is not exposure', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/shell/Header.tsx'), 'utf8');
    const trigger = src.slice(src.indexOf('ONE TRIGGER'), src.indexOf('<div className="flex shrink-0'));
    expect(trigger, 'الباب نفسه مشروط بدور').not.toMatch(/SUPER_ADMIN/);
  });

  it('while the rule about records travelled with it, unchanged', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/shell/Shell.tsx'), 'utf8');
    expect(shell, 'قاعدة البحث في السجلات تغيّرت أثناء النقل').toMatch(
      /canSearchRecords\s*=\s*userRole === 'SUPER_ADMIN'/
    );
  });
});

describe('it is reachable without a keyboard', () => {
  it('because a phone has no Ctrl and no Esc', () => {
    const header = readFileSync(join(process.cwd(), 'src/components/shell/Header.tsx'), 'utf8');
    // The icon that opens it on a phone…
    expect(header).toMatch(/onSearchClick[\s\S]{0,240}md:hidden/);
    const palette = readFileSync(join(process.cwd(), 'src/components/shell/CommandPalette.tsx'), 'utf8');
    // …and the one that closes it there.
    expect(palette, 'لا مخرج من الصندوق على الهاتف').toMatch(/md:hidden[\s\S]{0,160}RiCloseLine/);
  });
});
