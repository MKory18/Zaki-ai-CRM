// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A MENU FOLDED TO A RAIL, AND THE THREE WAYS THAT GOES WRONG.
 *
 * It forgets — so every page load hands back the wide menu somebody
 * deliberately put away. It flashes — so every page load paints 280px and
 * then snaps to 76px, which is worse than not folding at all. Or it takes
 * the names with it — sixty glyphs and no way to learn which is which, and
 * nothing at all for anyone reading the screen aloud.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/orders' }));

import { Sidebar } from './Sidebar';
import { RAIL_KEY, railed, setRailed } from '@/lib/sidebar-rail';

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

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-rail');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('what the browser remembers about the menu', () => {
  it('is one character, and it survives the next visit', () => {
    expect(railed()).toBe(false);
    setRailed(true);
    expect(localStorage.getItem(RAIL_KEY)).toBe('1');
    expect(railed(), 'الطيّ يُنسى بين الزيارات').toBe(true);
    setRailed(false);
    expect(railed()).toBe(false);
  });

  it('and it reaches the document in the same breath, so nothing waits for React', () => {
    setRailed(true);
    expect(document.documentElement.getAttribute('data-rail')).toBe('1');
    setRailed(false);
    expect(document.documentElement.getAttribute('data-rail')).toBeNull();
  });

  it('and a browser that refuses storage still gets a working menu', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => railed()).not.toThrow();
    expect(railed(), 'المتصفح الرافض يبدأ مطويّاً بلا سبب').toBe(false);
    expect(() => setRailed(true)).not.toThrow();
    // Folding still worked for this visit, even unremembered.
    expect(document.documentElement.getAttribute('data-rail')).toBe('1');
    get.mockRestore();
    set.mockRestore();
  });
});

describe('the width', () => {
  it('is applied before the first paint, not by an effect', () => {
    // A `useEffect` cannot beat the paint: the server has no way to know
    // what this browser remembered, so the wide menu renders, paints, then
    // snaps 204px narrower — every page load, forever.
    const shell = readFileSync(join(process.cwd(), 'src/components/shell/Shell.tsx'), 'utf8');
    expect(shell, 'لا نصّ يسبق الرسم').toContain('RAIL_SCRIPT');

    const rail = readFileSync(join(process.cwd(), 'src/lib/sidebar-rail.ts'), 'utf8');
    expect(rail).toMatch(/RAIL_SCRIPT = `try\{/);
    expect(rail, 'خطأ تخزين يوقف الصفحة').toContain('catch(e){}');
  });

  it('and the menu and the page read the SAME variable for it', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/shell/Shell.tsx'), 'utf8');
    const bar = readFileSync(join(process.cwd(), 'src/components/shell/Sidebar.tsx'), 'utf8');
    expect(shell, 'هامش الصفحة لا يتبع عرض القائمة').toContain('md:mr-[var(--shell-nav)]');
    expect(bar, 'عرض القائمة ثابت بينما الهامش متغيّر').toContain('md:w-[var(--shell-nav)]');
  });

  it('and folding is a desk’s affair — a drawer laid over a phone gains nothing by being narrow', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/(system)/system.css'), 'utf8');
    const at = css.indexOf("html[data-rail='1']");
    const mediaAt = css.lastIndexOf('@media (min-width: 768px)', at);
    expect(mediaAt, 'الطيّ يسري على الهاتف أيضاً').toBeGreaterThan(-1);
    expect(css.slice(mediaAt, at), 'قاعدة الطيّ خارج استعلام الشاشة').not.toContain('}\n}');
  });
});

describe('a folded menu', () => {
  it('still says what every glyph is', async () => {
    setRailed(true);
    await act(async () => {
      render(<Sidebar groups={GROUPS} />);
    });
    const link = screen.getByRole('link', { name: 'المنتجات' });
    expect(link.getAttribute('title'), 'أيقونة بلا اسم في الشريط المطويّ').toBe('المنتجات');
  });

  it('and unfolded it does not repeat a label you can already read', async () => {
    await act(async () => {
      render(<Sidebar groups={GROUPS} />);
    });
    const link = screen.getByRole('link', { name: 'المنتجات' });
    expect(link.getAttribute('title'), 'تلميحٌ يكرّر نصّاً ظاهراً').toBeNull();
  });

  it('and can always be unfolded again', async () => {
    setRailed(true);
    await act(async () => {
      render(<Sidebar groups={GROUPS} />);
    });
    // Folded, the row that held the fold control is just the mark — so the
    // control has to be somewhere the rail still draws.
    const back = screen.getAllByRole('button', { name: 'وسّع القائمة' });
    expect(back.length, 'لا سبيل لإعادة فتح القائمة').toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(back[0]);
    });
    expect(railed()).toBe(false);
  });

  it('and shows every group, because a folded heading draws nothing at all', async () => {
    setRailed(true);
    await act(async () => {
      render(<Sidebar groups={GROUPS} />);
    });
    // Both routes present: a collapsed group in a rail is an empty rail.
    expect(screen.getByRole('link', { name: 'الطلبات' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'المنتجات' })).toBeTruthy();
  });
});
