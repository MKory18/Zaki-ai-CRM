// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Tabs } from './Tabs';

/**
 * EIGHT SCREENS KEEP A TAB IN STATE. TWO OF THEM SAY SO.
 *
 * The other six are rows of buttons that look like tabs and are not:
 * nothing announces them as a set, nothing says which is current, and the
 * arrow keys do nothing — so reaching the fourth tab means four presses of
 * Tab, through every tab before it, on every visit.
 */

const TABS = [
  { key: 'a', label: 'الجديدة', count: 4 },
  { key: 'b', label: 'المؤجلة' },
  { key: 'c', label: 'المغلقة' },
];

function Harness() {
  const [v, setV] = useState('a');
  return (
    <>
      <Tabs tabs={TABS} value={v} onChange={setV} />
      <span data-testid="now">{v}</span>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const now = () => screen.getByTestId('now').textContent;

describe('a set of tabs', () => {
  it('says it is a set, and which one is current', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('and is ONE stop on the way down the page, not nine', () => {
    render(<Harness />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0').length, 'كل تبويب محطّةٌ للمفتاح').toBe(1);
  });
});

describe('the arrow keys', () => {
  it('move the way the page reads — left is the next one', async () => {
    // The page is right-to-left. Following DOM order instead would move the
    // highlight opposite to the key pressed, which is worse than nothing.
    render(<Harness />);
    const list = screen.getByRole('tablist');
    await act(async () => {
      fireEvent.keyDown(list, { key: 'ArrowLeft' });
    });
    expect(now(), 'السهم الأيسر لم ينتقل إلى التالي').toBe('b');
  });

  it('and right goes back', async () => {
    render(<Harness />);
    const list = screen.getByRole('tablist');
    await act(async () => {
      fireEvent.keyDown(list, { key: 'ArrowLeft' });
    });
    await act(async () => {
      fireEvent.keyDown(list, { key: 'ArrowRight' });
    });
    expect(now()).toBe('a');
  });

  it('and wrap rather than stop, so the last tab is one press from the first', async () => {
    render(<Harness />);
    const list = screen.getByRole('tablist');
    await act(async () => {
      fireEvent.keyDown(list, { key: 'ArrowRight' });
    });
    expect(now()).toBe('c');
  });

  it('and Home and End reach the ends directly', async () => {
    render(<Harness />);
    const list = screen.getByRole('tablist');
    await act(async () => {
      fireEvent.keyDown(list, { key: 'End' });
    });
    expect(now()).toBe('c');
    await act(async () => {
      fireEvent.keyDown(list, { key: 'Home' });
    });
    expect(now()).toBe('a');
  });
});

describe('a count beside a tab', () => {
  it('is a number, never a dot', () => {
    // A dot says "something". A number answers "is it worth opening".
    render(<Harness />);
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('and a tab with nothing to count shows nothing', () => {
    render(<Harness />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[1].textContent).toBe('المؤجلة');
  });
});

/**
 * AND THE SCREENS THAT HAVE TABS SHOULD BE USING THIS.
 *
 * Not a rule this stage can enforce — wiring them is stage seven — but a
 * count that says plainly how much is still hand-rolled, so the number can
 * only go down.
 */
describe('how many screens still roll their own', () => {
  it('is reported, not asserted at zero', () => {
    const SKIP = ['/components/landing/', '/components/public/', '/components/store/'];
    const rolled: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.tsx') && !p.includes('.test.')) {
          const rel = `/${relative(process.cwd(), p).split('\\').join('/')}`;
          if (SKIP.some((s) => rel.includes(s))) continue;
          const src = readFileSync(p, 'utf8');
          if (/\[tab, setTab\]|activeTab|\bsetTab\(/.test(src) && !src.includes("from '@/components/ui/Tabs'")) {
            rolled.push(rel);
          }
        }
      }
    };
    walk(join(process.cwd(), 'src', 'components'));
    // Nine at the time of writing. The assertion is the CEILING: it may
    // fall, and a tenth must be a deliberate act.
    expect(rolled.length, `شاشات بتبويبٍ خاصّ بها:\n${rolled.join('\n')}`).toBeLessThanOrEqual(9);
  });
});
