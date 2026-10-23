// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/lib/guard-source';

vi.mock('next/navigation', () => ({ usePathname: () => '/customers' }));

// jsdom has no layout and so no scrolling; the open panel scrolls its last message into view.
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--bulk-h');
});

import { BulkBar, BulkProvider } from '@/components/shell/BulkBar';
import { AiDock } from './AiDock';

/**
 * THE ASSISTANT'S BUTTON COVERED THE PAGER.
 *
 * «تحت عند التقليب بين الاصفحات زر المساعد بغطي عليهم». The button is
 * `fixed` — it takes no room in the page — so it sits over whatever the
 * page ends with. Measured, on a desk: the page keeps 24px under its last
 * row and the button spans 16–64px from the bottom edge. Every list that
 * ends in a pager (customers, orders, returns) puts «التالي» on the very
 * end the button is anchored to, so the arrow you need after the last row
 * was the one thing you could not press.
 *
 * The fix is room, not a move: the button stays where the phone's bar and
 * the notification cards were arranged around, and the dock reserves, in
 * the page, the height it floats over. These claims hold the three ways
 * that comes undone — the room goes missing, the room stops being enough
 * (somebody enlarges the button, lifts it, or thins the page's padding),
 * or the room lands somewhere that is not under the page.
 *
 * THE ARITHMETIC IS READ FROM THE SOURCE, not copied into this file. A
 * test that restates «64 + 8 ≤ 80» passes for ever after somebody changes
 * the button to 56px; one that reads the button's own class does not.
 * (jsdom has no layout, so a rectangle cannot be measured here — the real
 * rectangles were measured in a browser on the built stylesheet and are in
 * the pull request.)
 */

const ROOT = process.cwd();
const REM = 16;
/** What must be left between the last row and the button's top edge. */
const CLEARANCE = 8;

const file = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const code = (rel: string) => stripComments(file(rel));

/** Tailwind's spacing step: `h-14` is 14 × 0.25rem = 56px. */
const step = (n: string) => parseFloat(n) * 4;

/**
 * A sum of lengths in px and rem, with the two kinds of variable the
 * bottom strip is written in. `env(safe-area-inset-bottom)` is 0 here: it
 * is added to BOTH sides of every comparison (the page's padding and the
 * button's offset), so it cancels and a notch changes nothing.
 */
function px(expr: string, vars: Record<string, string> = {}): number {
  let e = expr;
  for (let i = 0; i < 4; i++) {
    e = e.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_m, name: string, fallback?: string) => vars[name] ?? fallback ?? '0px');
  }
  e = e.replace(/env\(safe-area-inset-bottom\)/g, '0px').replace(/calc\(/g, '').replace(/\)/g, '');
  return e.split('+').reduce((sum, term) => {
    const m = term.trim().match(/^(-?\d*\.?\d+)(rem|px)$/);
    if (!m) throw new Error(`cannot read «${term.trim()}» in «${expr}»`);
    return sum + parseFloat(m[1]) * (m[2] === 'rem' ? REM : 1);
  }, 0);
}

/** Everything the claims need, read from the four places it is written. */
function geometry() {
  const dock = code('src/components/ai/AiDock.tsx');
  const shell = code('src/components/shell/Shell.tsx');
  const css = file('src/app/(system)/system.css');

  const button = dock.match(/className=\{`fixed end-4[^`]*`\}/);
  if (!button) throw new Error('الزر لم يعد fixed end-4');
  const buttonHeight = step(button[0].match(/\bh-(\d+(?:\.\d+)?)\b/)![1]);
  const deskOffset = step(button[0].match(/md:!bottom-(\d+(?:\.\d+)?)/)![1]);

  const navHeight = css.match(/--sys-mobile-nav-h:\s*(calc\([^;]+\));/);
  const phoneOffset = px(dock.match(/style=\{\{ bottom: '([^']+)' \}\}/)![1], { '--sys-mobile-nav-h': navHeight![1] });

  const room = dock.match(/<div aria-hidden className=\{[^}]*\} \/>/);
  const roomHeight = step(room![0].match(/\bh-(\d+(?:\.\d+)?)\b/)![1]);

  // The shell's main element, wherever its class list sits among its attributes and however the tag is
  // wrapped: since 23/10/2026 the tag also carries `data-empty-family` (the picture an empty list wears under
  // «ليل»), written before the class list and on lines of its own — and a pattern that insisted on
  // «<main className=» right after the tag name read that as no main at all and crashed on null.
  const main = shell.match(/<main\b[^>]*\bclassName="([^"]+)"/)![1];
  const deskPad = step(main.match(/md:pb-(\d+(?:\.\d+)?)/)![1]);
  const phonePad = px(main.match(/(?<![:\w-])pb-\[(calc\([^\]]+\))\]/)![1]);

  return { buttonHeight, deskOffset, phoneOffset, roomHeight, deskPad, phonePad };
}

describe('the room under the page is at least as tall as what floats over it', () => {
  it('on a desk: the page’s padding plus the room clears the button’s top edge', () => {
    const g = geometry();
    const buttonTop = g.deskOffset + g.buttonHeight;
    expect(
      g.deskPad + g.roomHeight,
      `المكتب: الزر يصل إلى ${buttonTop}px والصفحة تترك ${g.deskPad + g.roomHeight}px فقط`
    ).toBeGreaterThanOrEqual(buttonTop + CLEARANCE);
  });

  it('on a phone: above the bottom bar the button is higher, and so is the room', () => {
    const g = geometry();
    const buttonTop = g.phoneOffset + g.buttonHeight;
    expect(
      g.phonePad + g.roomHeight,
      `الهاتف: الزر يصل إلى ${buttonTop}px والصفحة تترك ${g.phonePad + g.roomHeight}px فقط`
    ).toBeGreaterThanOrEqual(buttonTop + CLEARANCE);
  });

  it('and the numbers are the real ones, not zeros that make every sum pass', () => {
    const g = geometry();
    expect(g.buttonHeight).toBe(48);
    expect(g.deskOffset).toBe(16);
    expect(g.phoneOffset).toBe(57 + 12);
    expect(g.deskPad).toBe(24);
    expect(g.phonePad).toBe(72);
    expect(g.roomHeight).toBe(56);
  });
});

describe('where the room lands', () => {
  it('the layout mounts the dock INSIDE the shell, so the room is under the page and not beside it', () => {
    const layout = code('src/app/(system)/(shell)/layout.tsx');
    const open = layout.indexOf('<Shell');
    const close = layout.indexOf('</Shell>');
    const dock = layout.indexOf('<AiDock />');
    expect(open).toBeGreaterThan(-1);
    expect(dock, 'المساعد خارج الـShell').toBeGreaterThan(open);
    expect(dock, 'المساعد بعد نهاية الـShell').toBeLessThan(close);
  });

  it('and the shell draws its children inside the page’s own main, after the page', () => {
    const shell = code('src/components/shell/Shell.tsx');
    const main = shell.indexOf('<main');
    const children = shell.indexOf('{children}');
    expect(main).toBeGreaterThan(-1);
    expect(children, 'المحتوى خارج main').toBeGreaterThan(main);
    expect(children).toBeLessThan(shell.indexOf('</main>'));
  });

  it('the room is drawn straight after the page and before the button', () => {
    render(
      <BulkProvider>
        <main>
          <p>آخر صف في الصفحة</p>
          <AiDock />
        </main>
      </BulkProvider>
    );
    const button = screen.getByRole('button', { name: 'افتح المساعد الذكي' });
    const room = button.previousElementSibling as HTMLElement;
    expect(room, 'لا شيء قبل الزر').toBeTruthy();
    expect(room.className).toContain('h-14');
    expect(room.previousElementSibling?.textContent).toBe('آخر صف في الصفحة');
  });
});

describe('the room is only a gap', () => {
  it('— hidden from a screen reader, holding nothing, taking no focus', () => {
    render(
      <BulkProvider>
        <AiDock />
      </BulkProvider>
    );
    const room = screen.getByRole('button', { name: 'افتح المساعد الذكي' }).previousElementSibling as HTMLElement;
    expect(room.getAttribute('aria-hidden')).toBe('true');
    expect(room.childElementCount).toBe(0);
    expect(room.textContent).toBe('');
    expect(room.hasAttribute('tabindex')).toBe(false);
  });

  it('— and is still there with the panel open, so the page does not jump when the assistant opens', async () => {
    render(
      <BulkProvider>
        <AiDock />
      </BulkProvider>
    );
    const before = document.querySelectorAll('[aria-hidden="true"].h-14').length;
    expect(before).toBe(1);
    await act(async () => {
      screen.getByRole('button', { name: 'افتح المساعد الذكي' }).click();
    });
    expect(screen.queryByRole('button', { name: 'افتح المساعد الذكي' })).toBeNull();
    expect(document.querySelectorAll('[aria-hidden="true"].h-14').length).toBe(1);
  });
});

describe('it yields with the button', () => {
  function Selecting({ on }: { on: boolean }) {
    const [shown, setShown] = useState(on);
    return (
      <BulkProvider>
        <button onClick={() => setShown((v) => !v)}>toggle</button>
        <AiDock />
        <BulkBar show={shown}>
          <span>محدَّد: 2 طلب</span>
        </BulkBar>
      </BulkProvider>
    );
  }
  const roomNow = () =>
    document.querySelector('[aria-hidden="true"].h-14') as HTMLElement;

  it('— with nothing selected the room is always there', async () => {
    await act(async () => {
      render(<Selecting on={false} />);
    });
    expect(roomNow().className).not.toContain('hidden');
  });

  it('— while a selection owns the bottom strip it is gone on a phone and kept on a desk', async () => {
    await act(async () => {
      render(<Selecting on />);
    });
    // The bar reserves its own height through the page's padding; keeping
    // the room as well would leave a hand's width of air above the bar.
    expect(roomNow().className).toContain('hidden');
    // A desk's bulk bar is not fixed, and the button stays on a desk.
    expect(roomNow().className).toContain('md:block');
  });

  it('— and it comes back when the selection is cleared', async () => {
    await act(async () => {
      render(<Selecting on />);
    });
    await act(async () => {
      screen.getByText('toggle').click();
    });
    expect(roomNow().className).not.toContain('hidden');
  });
});
