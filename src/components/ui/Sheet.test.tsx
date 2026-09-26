// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Modal } from './Modal';
import { Sparkline } from './Sparkline';
import { SavedViews } from './SavedViews';

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

/**
 * ESCAPE CLOSED IT. TAB COULD WALK OUT OF IT.
 *
 * A dialog whose focus is not held is a dialog where the third Tab press
 * lands on a button in the page behind — a page the scrim says is not
 * available and the keyboard could reach anyway.
 */
describe('a dialog', () => {
  const open = (onClose = () => undefined) =>
    render(
      <Modal isOpen onClose={onClose} title="تأكيد">
        <button>أ</button>
        <button>ب</button>
      </Modal>
    );

  it('says what it is, so a screen reader stops at its edge', () => {
    open();
    const box = screen.getByRole('dialog');
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(box.getAttribute('aria-label')).toBe('تأكيد');
  });

  it('holds the focus inside it', async () => {
    open();
    // jsdom does not move focus on Tab by itself, so "focus did not leave"
    // would pass whether or not there is a trap. What proves the trap is
    // that past the LAST stop it comes back to the FIRST.
    // From the DIALOG, in the same order the trap walks it — not from the
    // whole document, which also holds whatever the page behind renders.
    const stops = [...screen.getByRole('dialog').querySelectorAll('button')];
    const first = stops[0];
    const last = stops[stops.length - 1];
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    last.focus();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Tab' });
    });
    expect(document.activeElement, 'المؤشّر خرج من النافذة إلى الصفحة خلفها').toBe(first);
  });

  it('and Shift+Tab wraps the other way', async () => {
    open();
    const stops = [...screen.getByRole('dialog').querySelectorAll('button')];
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    stops[0].focus();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    });
    expect(document.activeElement).toBe(stops[stops.length - 1]);
  });

  it('and gives it back to whatever opened it', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const view = render(
      <Modal isOpen onClose={() => undefined} title="تأكيد">
        <button>أ</button>
      </Modal>
    );
    // The dialog takes focus on a timer, after paint. Without waiting for
    // that, focus never left the opener and "it came back" proves nothing.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(document.activeElement, 'النافذة لم تأخذ التركيز أصلاً').not.toBe(opener);

    await act(async () => {
      view.unmount();
    });
    expect(document.activeElement, 'العودة إلى أعلى الصفحة بدل الصفّ الذي فُتح منه').toBe(opener);
    opener.remove();
  });

  it('and Escape still closes it', async () => {
    const onClose = vi.fn();
    open(onClose);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalled();
  });
});

/**
 * A SHEET IS THAT COMPONENT WITH AN EDGE, NOT A SECOND ONE.
 *
 * Two dialog implementations means two portals, two scrims, two Escape
 * handlers and two focus traps — and one of the two always lags.
 */
describe('a sheet', () => {
  it('is the same component, reached by one prop', () => {
    const src = code(readFileSync(join(process.cwd(), 'src/components/ui/Modal.tsx'), 'utf8'));
    for (const side of ["'center'", "'end'", "'bottom'"]) {
      expect(src, `الحافة ${side} غير معرّفة`).toContain(side);
    }
    expect(src, 'مِحفظة ثانية للنوافذ').toContain('createPortal');
  });

  it('and one scrim serves the whole product', () => {
    // It used to be `--sys-sidebar` at 50% — a token that is a LIGHT colour
    // in two of the three themes, so the wash meant to push the page back
    // barely dimmed it.
    const src = code(readFileSync(join(process.cwd(), 'src/components/ui/Modal.tsx'), 'utf8'));
    expect(src).toContain('bg-[var(--sys-background)]/60');
    expect(src, 'حاجبٌ يأخذ لونه من رمزٍ فاتح في ثيمين').not.toContain('var(--sys-sidebar)]/50');
  });

  it('and a bottom sheet sits above the home indicator', () => {
    const src = code(readFileSync(join(process.cwd(), 'src/components/ui/Modal.tsx'), 'utf8'));
    expect(src).toContain('env(safe-area-inset-bottom)');
  });
});

describe('a sparkline', () => {
  it('draws nothing from one point, because one point has no shape', () => {
    const { container } = render(<Sparkline points={[5]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('and draws a flat line from a series that did not move', () => {
    // Dividing by a zero range would produce NaN in the path and render
    // nothing — and "it did not move" is itself the answer.
    const { container } = render(<Sparkline points={[5, 5, 5]} />);
    const d = container.querySelector('path')?.getAttribute('d') ?? '';
    expect(d).not.toContain('NaN');
    expect(d.length).toBeGreaterThan(0);
  });

  it('and knows that falling is sometimes the good news', () => {
    const down = render(<Sparkline points={[10, 4]} goodWhen="falling" />);
    expect(down.container.querySelector('path')?.getAttribute('stroke')).toBe('var(--sys-success)');
    cleanup();
    const up = render(<Sparkline points={[10, 4]} goodWhen="rising" />);
    expect(up.container.querySelector('path')?.getAttribute('stroke')).toBe('var(--sys-destructive)');
  });

  it('and is not read aloud, because the figure beside it already says it', () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('and costs no chart library, because nothing imports one', () => {
    // `recharts` IS in package.json — nine megabytes of it in node_modules
    // — and not one file imports it. Unused, it is tree-shaken out and
    // reaches no bundle, so what this guards is the thing that matters:
    // that no screen starts importing it to draw a line through nine
    // points. Removing the dependency is the owner's call, not a stage
    // about appearance.
    const LIBS = ['recharts', 'chart.js', 'victory', 'apexcharts', 'echarts', 'd3'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if ((p.endsWith('.ts') || p.endsWith('.tsx')) && !p.includes('.test.')) {
          const src = readFileSync(p, 'utf8');
          for (const lib of LIBS) {
            if (new RegExp(`from '${lib}(?:/|')`).test(src)) offenders.push(`${p}: ${lib}`);
          }
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(offenders, `مكتبةُ رسومٍ استُوردت: ${offenders.join('، ')}`).toEqual([]);
  });
});

/**
 * A SAVED VIEW IS A QUESTION TO RE-ASK, NEVER AN ANSWER TO REPLAY.
 */
describe('saved views', () => {
  it('store a name and a query, and nothing else', async () => {
    const onApply = vi.fn();
    render(<SavedViews screen="orders" current="q=1&state=RETURNED" onApply={onApply} />);
    await act(async () => {
      screen.getByText('احفظ هذا العرض').click();
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('اسم العرض المحفوظ'), { target: { value: 'المرتجعات' } });
    });
    await act(async () => {
      screen.getByText('احفظ').click();
    });

    const raw = JSON.parse(localStorage.getItem('osm.views.orders') ?? '[]');
    expect(raw).toEqual([{ name: 'المرتجعات', query: 'q=1&state=RETURNED' }]);
    expect(Object.keys(raw[0]), 'العرض المحفوظ يحمل أكثر من سؤال').toEqual(['name', 'query']);
  });

  it('and re-ask it rather than showing what it answered before', async () => {
    localStorage.setItem('osm.views.orders', JSON.stringify([{ name: 'المتأخرة', query: 'lateDays=10' }]));
    const onApply = vi.fn();
    render(<SavedViews screen="orders" current="" onApply={onApply} />);
    await act(async () => {
      screen.getByText('المتأخرة').click();
    });
    expect(onApply).toHaveBeenCalledWith('lateDays=10');
  });

  it('and saving over a name replaces it rather than making a twin', async () => {
    localStorage.setItem('osm.views.orders', JSON.stringify([{ name: 'المتأخرة', query: 'lateDays=10' }]));
    render(<SavedViews screen="orders" current="lateDays=30" onApply={() => undefined} />);
    await act(async () => {
      screen.getByText('احفظ هذا العرض').click();
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('اسم العرض المحفوظ'), { target: { value: 'المتأخرة' } });
    });
    await act(async () => {
      screen.getByText('احفظ').click();
    });
    const raw = JSON.parse(localStorage.getItem('osm.views.orders') ?? '[]');
    expect(raw.length, 'عرضان بالاسم نفسه ويختلفان في فلتر').toBe(1);
    expect(raw[0].query).toBe('lateDays=30');
  });

  it('and a browser that refuses storage simply shows none', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() =>
      render(<SavedViews screen="orders" current="" onApply={() => undefined} />)
    ).not.toThrow();
    spy.mockRestore();
  });

  it('and rubbish in storage is ignored rather than rendered', () => {
    // An ARRAY of rubbish, which is the case the shape check exists for —
    // a non-array is already turned away one line earlier.
    localStorage.setItem(
      'osm.views.orders',
      JSON.stringify([{ name: 123, query: {} }, 'hello', null, { name: 'سليم', query: 'q=1' }])
    );
    render(<SavedViews screen="orders" current="" onApply={() => undefined} />);
    expect(screen.getByText('سليم'), 'العرض السليم ضاع مع الفاسد').toBeTruthy();
    expect(screen.queryByText('123'), 'قيمةٌ فاسدة رُسمت كعرض').toBeNull();
    expect(screen.queryByText('hello')).toBeNull();
  });

  it('and a non-array in storage is turned away too', () => {
    localStorage.setItem('osm.views.orders', '{"not":"an array"}');
    render(<SavedViews screen="orders" current="" onApply={() => undefined} />);
    expect(screen.getByText('احفظ هذا العرض')).toBeTruthy();
  });
});

describe('a filter bar', () => {
  it('says how many filters are doing something', () => {
    const src = code(readFileSync(join(process.cwd(), 'src/components/ui/FilterBar.tsx'), 'utf8'));
    // Six dropdowns showing «كل الحالات» and one showing «ملغى» look the
    // same at a glance. A number does not.
    expect(src).toContain('{active}');
    expect(src).toContain('امسح الفلاتر');
  });
});
