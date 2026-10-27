// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';

/**
 * «إدخال طلب سريع» AND «متقدم» DID NOTHING — THE HEADER WAS LYING ON TOP OF THEM.
 *
 * The group at the end of the header wraps on purpose: at tablet widths it would otherwise push the
 * whole document sideways. But the header itself had a FIXED height of 72px, so a wrapped group did
 * not make it taller — centred in 72px, it hung out of both edges. Measured in a browser at 800px with
 * an install button, a shift chip and four counters: six rows, from 33px above the window to 104px,
 * and the part below the bar sat over the page's first row. On «الطلبات» that row is «متقدم» and
 * «إدخال طلب سريع»: a press landed on the header's transparent group and nothing opened. The rows
 * above the window were simply never seen.
 *
 * jsdom draws no layout, so the measurement lives in the PR. What is pinned here is the rule the
 * measurement came down to, read off the RENDERED header: the bar that holds a wrapping group may
 * have a minimum height and never a fixed one. The class names are built from parts so this file does
 * not hand Tailwind a class the product does not use (the stylesheet has a byte ceiling).
 */

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/sign-out', () => ({ signOut: vi.fn() }));
// The chips fetch on mount; what they draw is not the subject — the bar that holds them is.
vi.mock('@/components/shell/NotificationBell', () => ({ NotificationBell: () => <span data-chip="bell" /> }));
vi.mock('./MyWork', () => ({ MyWork: () => <span data-chip="work" /> }));
vi.mock('./InstallApp', () => ({ InstallAppButton: () => <span data-chip="install" /> }));
vi.mock('@/components/attendance/ShiftChip', () => ({ ShiftChip: () => <span data-chip="shift" /> }));

import { Header } from './Header';

afterEach(cleanup);

const cls = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);
const FIXED_72 = ['h', '[72px]'].join('-');
const AT_LEAST_72 = ['min', 'h', '[72px]'].join('-');
/** Any fixed height on the bar — `h-…`, at any breakpoint — not only today's 72. */
const fixedHeight = (c: string) => /^(?:[a-z0-9]+:)*h-/.test(c);

function draw() {
  render(
    <Header
      onMenuClick={() => {}}
      onSearchClick={() => {}}
      userName="تجربة"
      userRole="SUPER_ADMIN"
      context={{ storeName: 'متجر', storePaused: false, countryName: 'الأردن', currencyCode: 'JOD', canSwitch: false }}
    />
  );
  const bar = document.querySelector('header');
  const group = document.querySelector('[data-chip="bell"]')?.parentElement ?? null;
  return { bar, group };
}

describe('the header and the group that wraps inside it', () => {
  it('the group still wraps — the reason the bar must be able to grow', () => {
    const { group } = draw();
    expect(cls(group)).toContain('flex-wrap');
  });

  it('the bar is at least 72px tall, and has no fixed height at any width', () => {
    const { bar } = draw();
    const c = cls(bar);
    expect(c, 'الشريط فقد حدّه الأدنى').toContain(AT_LEAST_72);
    expect(c, 'الشريط رجع بارتفاع ثابت — المجموعة الملفوفة بتطلع فوق الصفحة').not.toContain(FIXED_72);
    expect(c.filter(fixedHeight), 'ارتفاع ثابت على الشريط').toEqual([]);
  });

  it('and a wrapped row has room inside the bar instead of on its border', () => {
    const { bar } = draw();
    expect(cls(bar)).toContain('py-2');
  });
});
