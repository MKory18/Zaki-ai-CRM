// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Countdown } from './Countdown';

/**
 * A COUNTDOWN THAT DOES NOT LIE ON RELOAD.
 *
 * It started from the full minutes on every mount, so reloading the page
 * gave the visitor a fresh deadline — the exact trick its own comment
 * promised it would never play. The deadline is kept in the browser now.
 */

const timer = () => screen.getByRole('timer').textContent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0));
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the deadline', () => {
  it('survives a reload: the second mount continues where the first was', () => {
    const first = render(<Countdown minutes={10} id="u1" />);
    expect(timer()).toBe('10:00');
    act(() => { vi.advanceTimersByTime(3 * 60_000); });
    expect(timer()).toBe('07:00');
    first.unmount();

    render(<Countdown minutes={10} id="u1" />);
    expect(timer()).toBe('07:00');
  });

  it('says it is over when it is over — and a reload does not restart it', () => {
    const first = render(<Countdown minutes={1} id="u1" />);
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(screen.getByText('انتهى وقت العرض')).toBeTruthy();
    first.unmount();

    render(<Countdown minutes={1} id="u1" />);
    expect(screen.getByText('انتهى وقت العرض')).toBeTruthy();
  });

  it('a visitor back a day after it ran out is on a new visit', () => {
    const first = render(<Countdown minutes={1} id="u1" />);
    first.unmount();
    vi.setSystemTime(new Date(2026, 8, 25, 13, 0, 0));
    render(<Countdown minutes={1} id="u1" />);
    expect(timer()).toBe('01:00');
  });

  it('is kept per block: another timer on the page has its own', () => {
    render(<Countdown minutes={10} id="u1" />);
    act(() => { vi.advanceTimersByTime(60_000); });
    cleanup();
    render(<Countdown minutes={5} id="u2" />);
    expect(timer()).toBe('05:00');
  });

  it('in the builder canvas it is never kept: the seller editing is not a visitor', () => {
    const first = render(<Countdown minutes={1} id="u1" persist={false} />);
    act(() => { vi.advanceTimersByTime(61_000); });
    first.unmount();
    render(<Countdown minutes={1} id="u1" persist={false} />);
    expect(timer()).toBe('01:00');
    expect(window.localStorage.length).toBe(0);
  });

  it('still counts when the browser refuses storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<Countdown minutes={2} id="u1" />);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(timer()).toBe('01:30');
    spy.mockRestore();
  });
});

describe('on a page', () => {
  it('the builder canvas never keeps a deadline; the public page does', async () => {
    const { PageBlocks } = await import('./PageBlocks');
    const { newSection } = await import('@/lib/landing-sections');
    const urgency = { ...newSection('urgency'), minutes: 5 } as ReturnType<typeof newSection>;
    const ctx = {
      palette: {} as never, productName: 'x', price: 1, currency: 'SYP', stock: null, offers: [], form: null,
    };
    render(<PageBlocks sections={[urgency]} ctx={{ ...ctx, building: true }} />);
    expect(window.localStorage.length).toBe(0);
    cleanup();
    render(<PageBlocks sections={[urgency]} ctx={ctx} />);
    expect(window.localStorage.length).toBe(1);
  });
});
