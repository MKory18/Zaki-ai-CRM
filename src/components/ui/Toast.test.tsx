// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ToastProvider, useToast } from './Toast';

/**
 * A SUCCESS LEAVES. A FAILURE DOES NOT.
 *
 * «تم الحفظ» has done its job in three seconds and is clutter after that.
 * A refusal has a REASON in it, and a reason that removes itself after
 * three seconds is a reason nobody finished reading — and the commonest
 * thing a person does next is press the button again. On this system a
 * second press is a second shipment.
 */

function Harness() {
  const t = useToast();
  return (
    <ToastButtons
      done={() => t.done('تم الحفظ')}
      failed={() => t.failed('تعذّر الحفظ', 'المخزون غير كافٍ')}
    />
  );
}

function ToastButtons({ done, failed }: { done: () => void; failed: () => void }) {
  return (
    <>
      <button onClick={done}>ok</button>
      <button onClick={failed}>no</button>
    </>
  );
}

const wrap = () =>
  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>
  );

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe('after something worked', () => {
  it('it is said, and then it goes away on its own', async () => {
    wrap();
    await act(async () => {
      screen.getByText('ok').click();
    });
    expect(screen.queryByText('تم الحفظ')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('تم الحفظ'), 'رسالة النجاح بقيت فوضى على الشاشة').toBeNull();
  });

  it('and is announced politely, not as an interruption', async () => {
    wrap();
    await act(async () => {
      screen.getByText('ok').click();
    });
    const line = screen.getByRole('status');
    expect(line.getAttribute('aria-live')).toBe('polite');
  });
});

describe('after something was refused', () => {
  it('it stays until somebody closes it', async () => {
    wrap();
    await act(async () => {
      screen.getByText('no').click();
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.queryByText('تعذّر الحفظ'), 'السبب اختفى قبل أن يُقرأ').toBeTruthy();
  });

  it('and carries the reason, not just the fact', async () => {
    wrap();
    await act(async () => {
      screen.getByText('no').click();
    });
    expect(screen.queryByText('المخزون غير كافٍ')).toBeTruthy();
  });

  it('and can be closed, because it will not close itself', async () => {
    wrap();
    await act(async () => {
      screen.getByText('no').click();
    });
    await act(async () => {
      screen.getByLabelText('إغلاق').click();
    });
    expect(screen.queryByText('تعذّر الحفظ')).toBeNull();
  });

  it('and interrupts, because a refusal is not an aside', async () => {
    wrap();
    await act(async () => {
      screen.getByText('no').click();
    });
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
  });
});

describe('a screen that fires ten in a loop', () => {
  it('does not bury the page it is reporting on', async () => {
    wrap();
    await act(async () => {
      for (let i = 0; i < 10; i++) screen.getByText('no').click();
    });
    expect(screen.getAllByRole('alert').length, 'الرسائل غطّت الشاشة').toBeLessThanOrEqual(4);
  });
});

describe('where it appears', () => {
  it('is above whatever owns the bottom strip, not on top of it', () => {
    // The navigation, or a bulk bar that reported its own height. Sitting
    // on either of them is how the button underneath gets pressed instead.
    const src = readFileSync(join(process.cwd(), 'src/components/ui/Toast.tsx'), 'utf8');
    expect(src, 'الرسالة تجلس فوق الشريط السفليّ').toContain('var(--bulk-h,4.5rem)');
  });

  it('and does not swallow clicks on the page behind it', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/ui/Toast.tsx'), 'utf8');
    expect(src).toContain('pointer-events-none');
    expect(src).toContain('pointer-events-auto');
  });

  it('and takes every colour from the theme', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/ui/Toast.tsx'), 'utf8');
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(src.match(/(?:bg|text|border)-(?:red|green|amber|emerald|rose|slate)-\d{2,3}/g) ?? []).toEqual([]);
  });
});

describe('the shell', () => {
  it('mounts it once, beside the one dialog', () => {
    const layout = readFileSync(join(process.cwd(), 'src/app/(system)/(shell)/layout.tsx'), 'utf8');
    expect(layout).toContain('<ToastProvider>');
    expect((layout.match(/<ToastProvider>/g) ?? []).length, 'منطقتا رسائل').toBe(1);
  });
});
