// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE BOTTOM STRIP HAS TWO CLAIMANTS, AND ONLY ONE THUMB.
 *
 * The orders list has had a bulk bar for a long time and on a phone it was
 * unreachable the whole time: it rendered above the list, so selecting five
 * rows put the actions four screens up. People scrolled back, lost their
 * place, and stopped selecting.
 *
 * So while a selection is live the navigation stands down. These hold the
 * three ways that goes wrong: the navigation does not come back, the page
 * does not reserve the right room, or something else keeps sitting on top.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/orders' }));

import { BulkBar, BulkProvider, useBulkActive } from './BulkBar';
import { MobileNav } from './MobileNav';

const GROUPS = [
  {
    key: 'main',
    label: 'الرئيسية',
    routes: [
      { path: '/orders', label: 'الطلبات', icon: 'ShoppingCart', permissions: null },
      { path: '/products', label: 'المنتجات', icon: 'Package', permissions: null },
    ],
  },
];

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--bulk-h');
  vi.clearAllMocks();
});

const nav = () => document.querySelector('nav[aria-label="التنقل"]');

function Harness({ initial = false }: { initial?: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <BulkProvider>
      <button onClick={() => setOn((v) => !v)}>toggle</button>
      <MobileNav groups={GROUPS} />
      <BulkBar show={on}>
        <span>محدَّد: 2 طلب</span>
      </BulkBar>
    </BulkProvider>
  );
}

describe('while something is selected', () => {
  it('the navigation stands down and the bar takes the strip', async () => {
    await act(async () => {
      render(<Harness />);
    });
    expect(nav(), 'لا شريط تنقّل أصلاً').toBeTruthy();

    await act(async () => {
      screen.getByText('toggle').click();
    });
    expect(nav(), 'التنقّل ما زال تحت شريط الإجراءات').toBeNull();
    expect(screen.getByText('محدَّد: 2 طلب')).toBeTruthy();
  });

  it('and it comes back the moment nothing is selected', async () => {
    await act(async () => {
      render(<Harness initial />);
    });
    expect(nav()).toBeNull();
    await act(async () => {
      screen.getByText('toggle').click();
    });
    expect(nav(), 'التنقّل لم يعد بعد إلغاء التحديد').toBeTruthy();
  });

  it('and nothing renders at all when there is no selection', async () => {
    await act(async () => {
      render(<Harness />);
    });
    expect(document.querySelector('[role="toolbar"]')).toBeNull();
  });
});

/**
 * A boolean would have been enough for one screen. It is not enough for
 * two: the second bar's unmount would switch the navigation back on
 * underneath the first one's live selection.
 */
describe('two screens, one strip', () => {
  function Two() {
    const [a, setA] = useState(true);
    return (
      <BulkProvider>
        <button onClick={() => setA(false)}>drop</button>
        <MobileNav groups={GROUPS} />
        <BulkBar show={a}>
          <span>أ</span>
        </BulkBar>
        <BulkBar show>
          <span>ب</span>
        </BulkBar>
      </BulkProvider>
    );
  }

  it('one bar going away does not hand the strip back while another holds it', async () => {
    await act(async () => {
      render(<Two />);
    });
    expect(nav()).toBeNull();
    await act(async () => {
      screen.getByText('drop').click();
    });
    expect(screen.queryByText('ب'), 'الشريط الثاني اختفى').toBeTruthy();
    expect(nav(), 'التنقّل عاد فوق تحديدٍ ما زال قائماً').toBeNull();
  });
});

describe('the room the page reserves for it', () => {
  it('is the bar’s real height, not a guess', async () => {
    // The bar wraps to two or three rows depending on how many actions the
    // person may perform. A constant leaves the last selected row under it.
    const observed: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
      }
    );
    // jsdom measures nothing, so pin the height the way a browser would.
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 141 } as DOMRect);

    await act(async () => {
      render(<Harness initial />);
    });
    expect(document.documentElement.style.getPropertyValue('--bulk-h')).toBe('141px');
    expect(observed.length, 'الارتفاع يُقاس مرّة واحدة ثم يُنسى').toBeGreaterThan(0);

    rect.mockRestore();
  });

  it('and is given back when the selection ends', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 141 } as DOMRect);

    await act(async () => {
      render(<Harness initial />);
    });
    await act(async () => {
      screen.getByText('toggle').click();
    });
    expect(
      document.documentElement.style.getPropertyValue('--bulk-h'),
      'الصفحة ما زالت تحجز مكاناً لشريطٍ اختفى'
    ).toBe('');
    rect.mockRestore();
  });

  it('and the page actually reads it', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/shell/Shell.tsx'), 'utf8');
    expect(shell, 'المحتوى يبقى تحت الشريط').toContain('var(--bulk-h,4.5rem)');
  });
});

describe('what else sits on that corner', () => {
  it('the assistant gets out of the way on a phone, and stays on a desk', () => {
    const dock = readFileSync(join(process.cwd(), 'src/components/ai/AiDock.tsx'), 'utf8');
    expect(dock, 'المساعد لا يعرف بالتحديد').toContain('useBulkActive');
    // Hidden on the phone only — a desk has no bottom navigation to yield
    // and the bar is not fixed there.
    expect(dock).toContain("'hidden md:flex' : 'flex'");
  });
});

describe('the flag itself', () => {
  it('is false outside any provider, so nothing crashes off the shell', () => {
    function Bare() {
      return <span>{String(useBulkActive())}</span>;
    }
    render(<Bare />);
    expect(screen.getByText('false')).toBeTruthy();
  });
});
