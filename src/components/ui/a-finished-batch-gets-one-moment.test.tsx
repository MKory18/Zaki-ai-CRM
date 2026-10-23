// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAR_POINTS, StarMark } from './StarMark';
import { BulkDoneMoment, FADE_MS, MOMENT_MIN, MOMENT_MS, SETTLE_MS, ordersNoun } from './BulkDoneMoment';
import { BulkBar } from '@/components/shell/BulkBar';
import { stripComments } from '@/lib/guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A FINISHED BATCH GETS ONE MOMENT — AND THE STAR IN IT HAS EIGHT POINTS.
 *
 * The star is checked by GEOMETRY, not by a copy of its own string: a
 * khatam is two equal squares, one turned 45°, and its outline is exactly
 * sixteen points — eight tips on one circle, and eight notches where the
 * edges of the two squares cross. A test that compared the string to
 * itself would pass a five-pointed star typed into both places; round one
 * of the image brief came back with exactly that star.
 *
 * The moment is checked by its CLOCK (fake timers): once per batch, held
 * 2.5 s, gone after the 0.4 s fade, in Latin digits, its picture silent.
 *
 * ── THE MUTATIONS THIS WAS RUN AGAINST (each turned it red) ──
 *   · one STAR_POINTS pair nudged by 2               → the geometry
 *   · the points written as a five-pointed star      → «exactly sixteen»
 *   · the once-per-serial guard deleted              → «not again for the same batch»
 *   · the moment remounted on a selection flip       → «a selection flip does not replay it»
 *     (`key={String(show)}` on it in BulkBar)
 *   · MOMENT_MS 2500 → 1500                          → «held two and a half seconds»
 *   · the fade timer keyed on the props again        → «a parent that lets go mid-moment»
 *   · the count printed with toLocaleString('ar-EG') → «Latin digits»
 *   · alt="" replaced by a description               → «the picture says nothing»
 *   · MOMENT_MIN 10 → 1                              → «nine is a click»
 *   · a `motion-reduce:` utility added to the star   → «only utilities the product already ships»
 * ═══════════════════════════════════════════════════════════════════════
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StarMark — the khatam, exactly', () => {
  const pairs = STAR_POINTS.trim().split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]);

  it('— is exactly sixteen points, and the polygon drawn is that outline', () => {
    expect(pairs).toHaveLength(16);
    const { container } = render(<StarMark />);
    const outline = container.querySelector('polygon');
    expect(outline?.getAttribute('points')).toBe(STAR_POINTS);
  });

  it('— eight tips on one circle, 45° apart: the corners of the two squares', () => {
    const tips = pairs.filter((_, i) => i % 2 === 0);
    const angles = tips.map(([x, y]) => {
      expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(48, 0);
      return Math.round((Math.atan2(y - 50, x - 50) * 180) / Math.PI);
    });
    const steps = angles.map((a, i) => (((angles[(i + 1) % 8] - a) % 360) + 360) % 360);
    for (const s of steps) expect(s).toBe(45);
  });

  it('— and eight notches, each on an edge of BOTH squares: where they cross', () => {
    const notches = pairs.filter((_, i) => i % 2 === 1);
    for (const [x, y] of notches) {
      // the upright square: |x−50| ≤ 34 and |y−50| ≤ 34, on its boundary
      expect(Math.max(Math.abs(x - 50), Math.abs(y - 50))).toBe(34);
      // the turned square (a diamond): |x−50| + |y−50| = 48
      expect(Math.abs(x - 50) + Math.abs(y - 50)).toBe(48);
    }
  });

  it('— walked in order round the centre, so it is drawn as a star and not a scribble', () => {
    const a = pairs.map(([x, y]) => (Math.atan2(y - 50, x - 50) * 180) / Math.PI);
    for (let i = 0; i < 16; i++) {
      const step = (((a[(i + 1) % 16] - a[i]) % 360) + 360) % 360;
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(45);
    }
  });

  it('— says nothing unless it IS the message, and spins slowly', () => {
    const quiet = render(<StarMark />).container.querySelector('svg')!;
    expect(quiet.getAttribute('aria-hidden')).toBe('true');
    expect(quiet.getAttribute('role')).toBeNull();
    expect(quiet.getAttribute('class')).toContain('animate-spin');
    expect(quiet.style.animationDuration).toBe('9s');
    cleanup();
    const told = render(<StarMark label="جارٍ التحميل" />).container.querySelector('svg')!;
    expect(told.getAttribute('role')).toBe('img');
    expect(told.getAttribute('aria-label')).toBe('جارٍ التحميل');
  });

  it('— and stands still for somebody who asked for less motion: the house block pins every animation to one 1 ms turn', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/(system)/system.css'), 'utf8');
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/animation-duration:\s*1ms\s*!important/);
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(block).toMatch(/transition-duration:\s*1ms\s*!important/);
  });
});

describe('BulkDoneMoment — once per batch, on a clock', () => {
  beforeEach(() => vi.useFakeTimers());
  const card = (c: HTMLElement) => c.querySelector('[data-phase]') as HTMLElement | null;
  const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it('— a batch of twelve: the picture, the number in Latin digits, and the sentence', () => {
    const { container } = render(<BulkDoneMoment serial={1} count={12} src="/x.webp" />);
    expect(container.querySelector('[data-bulk-moment="1"]')).not.toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('12');
    expect(text).toContain('طلبًا خلصوا');
    expect(text).not.toMatch(/[٠-٩]/);
  });

  it('— the picture says nothing: alt="" and aria-hidden, and the live region is polite and always there', () => {
    const { container, rerender } = render(<BulkDoneMoment serial={null} count={null} src="/x.webp" />);
    const region = container.querySelector('[role="status"]')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
    rerender(<BulkDoneMoment serial={7} count={30} src="/x.webp" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[role="status"]')).toBe(region);
  });

  it('— arrives a hair large and faded, settles, is held two and a half seconds, then fades and leaves', () => {
    const { container } = render(<BulkDoneMoment serial={1} count={12} src="/x.webp" />);
    expect(card(container)!.dataset.phase).toBe('arrive');
    expect(card(container)!.className).toContain('opacity-0');
    expect(card(container)!.style.scale).toBe('1.06');
    tick(SETTLE_MS);
    expect(card(container)!.dataset.phase).toBe('hold');
    expect(card(container)!.className).toContain('opacity-100');
    expect(card(container)!.style.scale).toBe('1');
    tick(MOMENT_MS - SETTLE_MS - 1);
    expect(card(container)!.dataset.phase).toBe('hold');
    tick(1);
    expect(MOMENT_MS).toBe(2500);
    expect(card(container)!.dataset.phase).toBe('leave');
    expect(card(container)!.className).toContain('opacity-0');
    expect(card(container)!.style.transitionDuration).toBe(`${FADE_MS}ms`);
    tick(FADE_MS - 1);
    expect(card(container)).not.toBeNull();
    tick(1);
    expect(card(container)).toBeNull();
  });

  it('— fires once per batch, and not again for the same batch whatever re-renders', () => {
    const { container, rerender } = render(<BulkDoneMoment serial={1} count={12} src="/x.webp" />);
    tick(MOMENT_MS + FADE_MS);
    expect(card(container)).toBeNull();
    rerender(<BulkDoneMoment serial={1} count={12} src="/x.webp" />);
    rerender(<BulkDoneMoment serial={1} count={13} src="/x.webp" />);
    tick(10);
    expect(card(container), 'نفس الدفعة رجعت تنعرض').toBeNull();
    rerender(<BulkDoneMoment serial={2} count={15} src="/x.webp" />);
    expect(card(container), 'دفعة جديدة ما انعرضت').not.toBeNull();
    expect(container.textContent).toContain('15');
  });

  it('— a parent that lets go mid-moment does not freeze the picture on screen', () => {
    const { container, rerender } = render(<BulkDoneMoment serial={1} count={12} src="/x.webp" />);
    tick(1000);
    rerender(<BulkDoneMoment serial={null} count={null} src="/x.webp" />);
    tick(MOMENT_MS + FADE_MS - 1000);
    expect(card(container)).toBeNull();
  });

  it('— nine is a click, not a batch: no picture below MOMENT_MIN', () => {
    expect(MOMENT_MIN).toBe(10);
    const { container, rerender } = render(<BulkDoneMoment serial={1} count={9} src="/x.webp" />);
    expect(card(container)).toBeNull();
    rerender(<BulkDoneMoment serial={2} count={0} src="/x.webp" />);
    expect(card(container)).toBeNull();
    rerender(<BulkDoneMoment serial={3} count={10} src="/x.webp" />);
    expect(card(container)).not.toBeNull();
  });

  it('— counts the way Arabic counts', () => {
    expect(ordersNoun(10)).toBe('طلبات');
    expect(ordersNoun(12)).toBe('طلبًا');
    expect(ordersNoun(99)).toBe('طلبًا');
    expect(ordersNoun(100)).toBe('طلب');
    expect(ordersNoun(103)).toBe('طلبات');
    expect(ordersNoun(111)).toBe('طلبًا');
  });
});

describe('BulkBar — the bar owns the moment, and keeps it in one place', () => {
  beforeEach(() => vi.useFakeTimers());

  it('— a selection flip after a batch does not replay the batch', () => {
    const done = { serial: 4, count: 20 };
    const view = (show: boolean) => (
      <BulkBar show={show} done={done}>
        <span>محدَّد</span>
      </BulkBar>
    );
    const { container, rerender } = render(view(false));
    expect(container.querySelector('[data-phase]')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(MOMENT_MS + FADE_MS));
    expect(container.querySelector('[data-phase]')).toBeNull();
    rerender(view(true));
    rerender(view(false));
    rerender(view(true));
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull();
    expect(container.querySelector('[data-phase]'), 'تبدّل التحديد أعاد اللحظة').toBeNull();
  });

  it('— with nothing finished it draws no picture, and no bar without a selection', () => {
    const { container } = render(
      <BulkBar show={false}>
        <span>محدَّد</span>
      </BulkBar>
    );
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('and it costs the first-load stylesheet nothing', () => {
  /*
   * The sheet has about a hundred bytes left under the ceiling in
   * quality-gates.test.ts, which only measures after a production build.
   * This is the early warning: every utility these two files ask for must
   * already be asked for somewhere else in the product, so Tailwind
   * generates nothing new for them.
   */
  const ROOT = process.cwd();
  const OWN = ['src/components/ui/BulkDoneMoment.tsx', 'src/components/ui/StarMark.tsx'];
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const classesIn = (src: string): string[] => {
    const code = stripComments(src);
    const out: string[] = [];
    let i = 0;
    while ((i = code.indexOf('className=', i)) !== -1) {
      i += 'className='.length;
      let j = i;
      if (code[i] === '"') j = code.indexOf('"', i + 1);
      else if (code[i] === '{') for (let d = 0; j < code.length; j++) if (code[j] === '{') d++; else if (code[j] === '}' && --d === 0) break;
      for (const m of code.slice(i, j + 1).matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
        out.push(...(m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean));
      }
      i = j + 1;
    }
    return [...new Set(out)];
  };

  it('— only utilities the product already ships, and no class nobody wrote', () => {
    const elsewhere = walk(join(ROOT, 'src'))
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => !OWN.includes(f.slice(ROOT.length + 1).split('\\').join('/')))
      .map((f) => stripComments(readFileSync(f, 'utf8')))
      .join('\n');
    const fresh: string[] = [];
    for (const file of OWN) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      expect(stripComments(src)).not.toMatch(/motion-reduce:|zk-moment/);
      for (const token of classesIn(src)) {
        const esc = token.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        if (!new RegExp(`(^|[\\s"'\`{])${esc}(?=[\\s"'\`}]|$)`, 'm').test(elsewhere)) fresh.push(`${file}: ${token}`);
      }
    }
    expect(fresh, `أداة جديدة = قاعدة جديدة في الورقة الأولى:\n${fresh.join('\n')}`).toEqual([]);
  });
});
