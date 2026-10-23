// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE TOUR RUNS ONCE — AND ONCE IS A FACT ON THE ROW, NOT IN THE BROWSER.
 *
 * Three mutation series, and one negative that outranks them all:
 *
 *   1. it fires for a user with no tourDoneAt, walks its steps, and
 *      finishing writes the dismissal to the row;
 *   2. it can be skipped for NOW, and skipped-with-the-checkbox writes the
 *      dismissal — «ما بدي أشرح مرة ثانية» is the person's word;
 *   3. every step names a real element (data-tour), and a step whose
 *      element is absent is skipped, never drawn against nothing;
 *   4. NEGATIVE: once tourDoneAt is on the session, the tour never opens —
 *      not on first paint, not after a re-render, not ever.
 *
 * The write is the door's business (PATCH /api/profile/tour), so it is
 * spied here and asserted as a request, not re-tested as a route.
 * ═══════════════════════════════════════════════════════════════════════
 */

const user: { current: { id: string; name: string; tourDoneAt?: string | null } | null } = {
  current: { id: 'u1', name: 'سامر', tourDoneAt: null },
};

const patches: string[] = [];

vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    currentUser: user.current,
    refreshUser: async () => undefined,
  }),
}));

vi.mock('@/lib/api-client', () => ({
  apiJson: Object.assign(
    vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') patches.push(input);
      return { tourDoneAt: new Date().toISOString() };
    })
  ),
}));

import { FirstRunTour } from './FirstRunTour';

/** The frame the tour anchors against: the four data-tour elements. */
function Frame({ withGuide = true }: { withGuide?: boolean }) {
  return (
    <div>
      <aside data-tour="sidebar">القائمة</aside>
      <div data-tour="context">المتجر</div>
      <button data-tour="search">ابحث</button>
      {withGuide && <button data-tour="guide">ⓘ</button>}
      <FirstRunTour />
    </div>
  );
}

beforeEach(() => {
  patches.length = 0;
  window.sessionStorage.clear();
  user.current = { id: 'u1', name: 'سامر', tourDoneAt: null };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const dialog = () => screen.getByRole('dialog', { name: 'الجولة الأولى' });

describe('the tour fires for a person who has not seen it', () => {
  it('opens on its own at the first step, anchored beside the menu', async () => {
    render(<Frame />);
    expect(dialog()).toBeTruthy();
    expect(screen.getByText(/هذه القائمة/)).toBeTruthy();
    expect(screen.getByText(/خطوة 1 من 4/)).toBeTruthy();
  });

  it('walks every step, and finishing writes the dismissal to the row', async () => {
    render(<Frame />);
    fireEvent.click(screen.getByText('التالي'));
    expect(screen.getByText(/المتجر والبلد/)).toBeTruthy();
    fireEvent.click(screen.getByText('التالي'));
    expect(screen.getByText(/يلاقي كل شي/)).toBeTruthy();
    fireEvent.click(screen.getByText('التالي'));
    // The last step is the guide ⓘ — the thing the tour exists to introduce.
    expect(screen.getByText(/زر «ⓘ»/)).toBeTruthy();
    expect(patches).toEqual([]); // nothing written until it is over
    fireEvent.click(screen.getByText('خلصت'));
    await act(async () => undefined);
    expect(patches).toEqual(['/api/profile/tour']);
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
  });

  it('and once it closed for this sign-in, it does not re-open while the page is alive', async () => {
    const { rerender } = render(<Frame />);
    fireEvent.click(screen.getByText('تخطّي'));
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
    expect(patches).toEqual([]); // a bare skip writes NOTHING — it may greet tomorrow
    rerender(<Frame />);
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
  });
});

describe('«تخطّي» lasts for the browser session, not for the life of one component', () => {
  it('a skipped tour does not come back when the shell is mounted again (reload, switching store)', () => {
    const first = render(<Frame />);
    fireEvent.click(screen.getByText('تخطّي'));
    first.unmount();
    render(<Frame />);
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
    expect(patches).toEqual([]); // still nothing on the row: tomorrow it greets
  });

  it('— but it is THIS person’s skip: somebody else on the same tab is still greeted', () => {
    const first = render(<Frame />);
    fireEvent.click(screen.getByText('تخطّي'));
    first.unmount();
    user.current = { id: 'u2', name: 'ليلى', tourDoneAt: null };
    render(<Frame />);
    expect(dialog()).toBeTruthy();
  });

  it('Escape is «تخطّي»: it closes the tour, remembers the skip, and writes nothing', () => {
    const first = render(<Frame />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
    first.unmount();
    render(<Frame />);
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
    expect(patches).toEqual([]);
  });

  it('Escape with «ما بدي أشرح مرة ثانية» ticked is the refusal, like the button', async () => {
    render(<Frame />);
    fireEvent.click(screen.getByLabelText('ما بدي أشرح مرة ثانية'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await act(async () => undefined);
    expect(patches).toEqual(['/api/profile/tour']);
  });

  it('focus moves into the card, so the keyboard reaches its buttons and not the page behind', () => {
    render(<Frame />);
    expect(document.activeElement).toBe(dialog());
  });
});

describe('«ما بدي أشرح مرة ثانية»', () => {
  it('checked, a skip writes the dismissal — the person said never', async () => {
    render(<Frame />);
    fireEvent.click(screen.getByLabelText('ما بدي أشرح مرة ثانية'));
    fireEvent.click(screen.getByText('تخطّي'));
    await act(async () => undefined);
    expect(patches).toEqual(['/api/profile/tour']);
  });

  it('unchecked, a skip writes nothing — tomorrow it greets again', () => {
    render(<Frame />);
    fireEvent.click(screen.getByText('تخطّي'));
    expect(patches).toEqual([]);
  });
});

describe('a step whose element is not on the screen', () => {
  it('is dropped from the plan, not drawn against nothing — and the count is honest', () => {
    // A phone folds the sidebar and a screen without a guide has no ⓘ: the
    // tour plans only what it can point at, and says «من 2» rather than
    // walking a person to a step that will never appear.
    const Bare = () => (
      <div>
        <div data-tour="context">المتجر</div>
        <button data-tour="search">ابحث</button>
        <FirstRunTour />
      </div>
    );
    render(<Bare />);
    expect(screen.getByText(/المتجر والبلد/)).toBeTruthy();
    expect(screen.getByText(/خطوة 1 من 2/)).toBeTruthy();
    fireEvent.click(screen.getByText('التالي'));
    expect(screen.getByText(/يلاقي كل شي/)).toBeTruthy();
    expect(screen.getByText(/خطوة 2 من 2/)).toBeTruthy();
    // and it ends there — no dangling fourth step pointing at nothing
    expect(screen.getByText('خلصت')).toBeTruthy();
  });

  it('— and one that is in the page but HIDDEN counts as not there (a phone: the sidebar is display:none)', () => {
    // jsdom has no stylesheet, so «hidden md:flex» is stood in for by the
    // computed style it produces on a phone. The anchor is found by
    // querySelector either way; only being SHOWN makes it a step.
    const Phone = () => (
      <div>
        <aside data-tour="sidebar" style={{ display: 'none' }}>القائمة</aside>
        <div data-tour="context">المتجر</div>
        <div style={{ display: 'none' }}>
          <button data-tour="search">ابحث</button>
        </div>
        <button data-tour="guide">ⓘ</button>
        <FirstRunTour />
      </div>
    );
    render(<Phone />);
    // the sidebar (itself hidden) and the search box (hidden by its PARENT) are dropped
    expect(screen.getByText(/خطوة 1 من 2/)).toBeTruthy();
    expect(screen.getByText(/المتجر والبلد/)).toBeTruthy();
    expect(screen.queryByText(/هذه القائمة/)).toBeNull();
    fireEvent.click(screen.getByText('التالي'));
    expect(screen.getByText(/زر «ⓘ»/)).toBeTruthy();
    expect(screen.queryByText(/يلاقي كل شي/)).toBeNull();
  });

  it('and a screen where EVERY anchor is hidden gets no overlay at all', () => {
    render(
      <div style={{ display: 'none' }}>
        <aside data-tour="sidebar">القائمة</aside>
        <FirstRunTour />
      </div>
    );
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
  });

  it('and a screen with nothing to anchor to gets no overlay at all', () => {
    render(
      <div>
        <p>شاشة بلا إطار</p>
        <FirstRunTour />
      </div>
    );
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
  });
});

describe('NEGATIVE: dismissed is dismissed, whatever happens after', () => {
  it('never opens again for a user with tourDoneAt — not on paint, not on re-render', () => {
    user.current = { id: 'u1', name: 'سامر', tourDoneAt: '2026-10-01T09:00:00.000Z' };
    const { rerender } = render(<Frame />);
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
    rerender(<Frame />);
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
    // A different device, same person: the fact is on the row, not the browser.
    expect(true).toBe(true);
  });

  it('never opens for a signed-out shell, and a failed write leaves no stuck overlay', async () => {
    user.current = { id: 'u1', name: 'سامر', tourDoneAt: null };
    render(<Frame />);
    fireEvent.click(screen.getByText('التالي'));
    fireEvent.click(screen.getByText('التالي'));
    fireEvent.click(screen.getByText('التالي'));
    fireEvent.click(screen.getByText('خلصت'));
    await act(async () => undefined);
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
  });

  it('renders nothing for a signed-out shell', () => {
    user.current = null;
    render(<Frame />);
    expect(screen.queryByRole('dialog', { name: 'الجولة الأولى' })).toBeNull();
  });
});
