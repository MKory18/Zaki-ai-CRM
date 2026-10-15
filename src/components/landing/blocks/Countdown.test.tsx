// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Countdown } from './Countdown';
// Static, not imported inside the test that uses them. `PageBlocks` pulls in
// the whole section library, and paying that transform cost INSIDE the test
// counted it against the 5s timeout — so the test failed under full-suite
// load and passed alone. A flake nobody could reproduce on purpose.
import { PageBlocks } from './PageBlocks';
import { newSection } from '@/lib/landing-sections';
import { offerDeadline } from '@/lib/selling-blocks';

/**
 * A COUNTDOWN WITH SOMETHING BEHIND IT.
 *
 * «عدّاد فقط من تاريخ انتهاء عرض حقيقي». It used to count `minutes` the
 * seller typed, from the moment the visitor arrived — so nothing happened
 * when it reached zero, because no price was tied to it. It defended that
 * invention carefully, keeping each visitor's deadline in their own browser
 * so a reload could not hand out a fresh one, and the defence was the
 * giveaway: a deadline that has to be remembered per browser is a deadline
 * that is not real.
 *
 * It now counts to `Offer.endsAt` — the same column that stops the price
 * applying. That is one moment for every visitor, so there is no storage
 * here at all, and the tests below are about the only two things left to
 * get wrong: the arithmetic, and whether a page with no ending offer draws
 * a clock anyway.
 */

const timer = () => screen.getByRole('timer').textContent;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0));
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the clock', () => {
  it('counts the real time left, and keeps counting it', () => {
    render(<Countdown endsAt={inHours(2)} />);
    expect(timer()).toBe('02:00:00');
    act(() => { vi.advanceTimersByTime(90 * 60_000); });
    expect(timer()).toBe('00:30:00');
  });

  /**
   * THE ONE THING THE OLD STORAGE WAS THERE TO PREVENT, now true for free.
   *
   * Two visitors, or one visitor twice, see the same number because the
   * number is a property of the offer and not of the browser. The second
   * mount below is a reload: it continues, and nothing was remembered to
   * make it continue.
   */
  it('is the same for a second visit, and remembers nothing to make it so', () => {
    const first = render(<Countdown endsAt={inHours(2)} />);
    act(() => { vi.advanceTimersByTime(60 * 60_000); });
    expect(timer()).toBe('01:00:00');
    first.unmount();

    render(<Countdown endsAt={inHours(1)} />);
    expect(timer()).toBe('01:00:00');
    expect(window.localStorage.length, 'العدّاد خزّن موعداً بالمتصفّح').toBe(0);
  });

  it('says it is over when the offer is over', () => {
    render(<Countdown endsAt={inHours(1)} />);
    act(() => { vi.advanceTimersByTime(61 * 60_000); });
    expect(screen.getByText('انتهى وقت العرض')).toBeTruthy();
  });

  /** «96:00:00» is a machine; «4 أيام» is what the offer says. */
  it('names the days rather than running the hours past a day', () => {
    render(<Countdown endsAt={inHours(96)} />);
    expect(timer()).toContain('4 أيام');
    expect(timer()).not.toContain('96');
  });

  /** A date nothing can parse is not a deadline. Nothing is drawn. */
  it('draws nothing at all for a date it cannot read', () => {
    const { container } = render(<Countdown endsAt="لا تاريخ" />);
    expect(container.textContent).toBe('');
  });
});

describe('on a page', () => {
  const ctx = {
    palette: {} as never, productName: 'x', price: 10, currency: 'SYP', stock: null, form: null,
  };
  const offer = (endsAt: Date | null) => ({
    id: 'o1', name: 'قطعة', quantity: 1, freeQuantity: 0, price: 10, endsAt,
  });

  /**
   * THE RULE, AT THE LEVEL A SELLER MEETS IT: the block is on the page and
   * there is no clock, because no offer ends. The seller cannot make one
   * appear by typing a number — there is no longer a field to type it in.
   */
  it('shows no clock when no offer has an end date', () => {
    const urgency = { ...newSection('urgency'), text: 'العرض ساري' } as ReturnType<typeof newSection>;
    const { container } = render(
      <PageBlocks sections={[urgency]} ctx={{ ...ctx, offers: [offer(null)] }} />
    );
    expect(container.textContent).toContain('العرض ساري');
    expect(container.querySelector('.lp-countdown'), 'عدّاد بلا عرض ينتهي').toBeNull();
  });

  it('and shows one, from the soonest offer that does end', () => {
    const urgency = newSection('urgency') as ReturnType<typeof newSection>;
    const soon = new Date(Date.now() + 3_600_000);
    const later = new Date(Date.now() + 10 * 3_600_000);
    const { container } = render(
      <PageBlocks
        sections={[urgency]}
        ctx={{ ...ctx, offers: [{ ...offer(later), id: 'o2' }, offer(soon)] }}
      />
    );
    expect(container.querySelector('.lp-countdown')).toBeTruthy();
    // The soonest, not the latest: the first thing on the page that stops
    // being true is what the clock is counting to.
    expect(offerDeadline([{ endsAt: later }, { endsAt: soon }])).toBe(soon.toISOString());
  });

  /**
   * A DEADLINE ALREADY PAST IS NOT A FINISHED COUNTDOWN TO SHOW SOMEBODY.
   *
   * The offers a public page is handed are the live ones, so a past date
   * here is a clock skew or a render on the boundary — and «انتهى وقت
   * العرض» over a price that is still being charged is the same lie the
   * other way round.
   */
  it('ignores an end date that has already gone', () => {
    const urgency = newSection('urgency') as ReturnType<typeof newSection>;
    const { container } = render(
      <PageBlocks sections={[urgency]} ctx={{ ...ctx, offers: [offer(new Date(Date.now() - 1000))] }} />
    );
    expect(container.querySelector('.lp-countdown')).toBeNull();
    expect(container.textContent).not.toContain('انتهى وقت العرض');
  });
});
