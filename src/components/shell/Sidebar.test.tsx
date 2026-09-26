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
import { RAIL_COOKIE, railed, setRailed } from '@/lib/sidebar-rail';

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
  document.cookie = `${RAIL_COOKIE}=; path=/; max-age=0`;
  document.documentElement.removeAttribute('data-rail');
  document.querySelector('[data-sys-theme]')?.removeAttribute('data-rail');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('what the browser remembers about the menu', () => {
  it('is one character, and it survives the next visit', () => {
    expect(railed()).toBe(false);
    setRailed(true);
    expect(document.cookie).toContain(`${RAIL_COOKIE}=1`);
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

  it('and a browser that refuses cookies still gets a working menu', () => {
    const spy = vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setRailed(true)).not.toThrow();
    // Folding still worked for this visit, even unremembered.
    expect(document.documentElement.getAttribute('data-rail')).toBe('1');
    spy.mockRestore();
  });
});

describe('the width', () => {
  it('is applied before the first paint, not by an effect', () => {
    // A `useEffect` cannot beat the paint: the server has no way to know
    // what this browser remembered, so the wide menu renders, paints, then
    // snaps 204px narrower — every page load, forever.
    // A COOKIE, read by the server, so the attribute is in the HTML the
    // browser parses. It was an inline script; React objects to one on
    // every page load — «Scripts inside React components are never
    // executed when rendering on the client» — and that error then hides
    // real ones. Moving the tag to the server layout did not silence it.
    const layout = readFileSync(join(process.cwd(), 'src/app/(system)/layout.tsx'), 'utf8');
    expect(layout, 'العرض لا يُرسم من الخادم').toContain('RAIL_COOKIE');
    expect(layout, 'نصٌّ يطبع خطأً في كل تحميل').not.toContain('<script');

    const shell = readFileSync(join(process.cwd(), 'src/components/shell/Shell.tsx'), 'utf8');
    expect(shell, 'نصٌّ داخل مكوّنٍ عميل').not.toContain('<script');

    const frame = readFileSync(join(process.cwd(), 'src/app/(system)/SystemFrame.tsx'), 'utf8');
    expect(frame, 'الإطار لا يحمل الحالة').toContain('data-rail');
  });

  it('and the menu and the page read the SAME variable for it', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/shell/Shell.tsx'), 'utf8');
    const bar = readFileSync(join(process.cwd(), 'src/components/shell/Sidebar.tsx'), 'utf8');
    expect(shell, 'هامش الصفحة لا يتبع عرض القائمة').toContain('md:mr-[var(--shell-nav)]');
    expect(bar, 'عرض القائمة ثابت بينما الهامش متغيّر').toContain('md:w-[var(--shell-nav)]');
  });

  it('and folding is a desk’s affair — a drawer laid over a phone gains nothing by being narrow', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/(system)/system.css'), 'utf8');
    const at = css.indexOf("[data-rail='1']");
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
