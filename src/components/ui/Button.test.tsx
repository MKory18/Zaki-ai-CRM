// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Button } from './Button';

/**
 * THE SECOND PRESS.
 *
 * On this system a second press is not a duplicate render — it is a second
 * shipment dispatched, a second payout recorded, a second deduction
 * charged. Every caller used to guard that with its own `busy` flag, and
 * the ones that forgot are why it happened.
 *
 * So the promise IS the flag, and these hold it: while the work is in the
 * air the button is disabled, the label keeps its width, and a second
 * click reaches nothing.
 */

const vibrate = vi.fn();
Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A promise this test decides when to settle. */
function pending<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('a button whose work is still in the air', () => {
  it('cannot be pressed a second time', async () => {
    const { promise, resolve } = pending();
    const run = vi.fn(() => promise);
    await act(async () => {
      render(<Button onClick={run}>ادفع</Button>);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(run).toHaveBeenCalledTimes(1);

    // Three more presses while the first request is still flying.
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('button'));
    });
    expect(run, 'الزرّ قَبِل ضغطة ثانية أثناء العمل').toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve();
    });
  });

  it('says so — disabled, and busy for anything reading the page aloud', async () => {
    const { promise, resolve } = pending();
    await act(async () => {
      render(<Button onClick={() => promise}>ادفع</Button>);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      resolve();
    });
  });

  it('and keeps its label in place rather than swapping it', async () => {
    // A button that resizes under a finger already moving towards it is a
    // button pressed twice by accident.
    const { promise, resolve } = pending();
    await act(async () => {
      render(<Button onClick={() => promise}>ادفع الراتب</Button>);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(screen.getByText('ادفع الراتب'), 'اختفى النص فتغيّر عرض الزرّ').toBeTruthy();

    await act(async () => {
      resolve();
    });
  });

  it('becomes pressable again once it finishes', async () => {
    const { promise, resolve } = pending();
    const run = vi.fn(() => promise);
    await act(async () => {
      render(<Button onClick={run}>ادفع</Button>);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    await act(async () => {
      resolve();
    });
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('what it says when the work is done', () => {
  it('a refusal shakes the control the person just pressed', async () => {
    const { promise, reject } = pending();
    await act(async () => {
      render(<Button onClick={() => promise}>احفظ</Button>);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    await act(async () => {
      reject(new Error('no'));
      await promise.catch(() => undefined);
    });
    expect(screen.getByRole('button').className, 'الرفض لا يُرى حيث ضغط الإنسان').toContain('sys-shake');
  });

  it('and a rejection never escapes as an unhandled promise', async () => {
    // The button swallows it on purpose: the SCREEN reports the reason.
    // What must not happen is the page dying because a save failed.
    const { promise, reject } = pending();
    await act(async () => {
      render(<Button onClick={() => promise}>احفظ</Button>);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    await act(async () => {
      reject(new Error('no'));
      await promise.catch(() => undefined);
    });
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });
});

/**
 * HAPTICS ARE A SECOND CHANNEL, NEVER THE FIRST.
 *
 * iOS Safari has no vibration, on any iPhone. A confirmation that only
 * buzzes is one half the warehouse never receives.
 */
describe('the buzz', () => {
  it('accompanies a refusal — and the shake is there too', async () => {
    const { promise, reject } = pending();
    await act(async () => {
      render(<Button onClick={() => promise}>احفظ</Button>);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    await act(async () => {
      reject(new Error('no'));
      await promise.catch(() => undefined);
    });
    expect(vibrate).toHaveBeenCalled();
    expect(screen.getByRole('button').className).toContain('sys-shake');
  });

  it('and a device that cannot vibrate still gets the whole message', async () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
    const { promise, reject } = pending();
    await act(async () => {
      render(<Button onClick={() => promise}>احفظ</Button>);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    await act(async () => {
      reject(new Error('no'));
      await promise.catch(() => undefined);
    });
    // No throw, and the visible half still happened.
    expect(screen.getByRole('button').className).toContain('sys-shake');
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
  });
});

describe('a handler that is not asynchronous', () => {
  it('is left entirely alone', async () => {
    const run = vi.fn();
    await act(async () => {
      render(<Button onClick={run}>أغلق</Button>);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('button'));
    });
    // Nothing to wait for, so nothing is blocked: two clicks, two calls.
    expect(run).toHaveBeenCalledTimes(2);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });
});
