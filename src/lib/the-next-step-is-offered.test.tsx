// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A SUCCESS ENDED THERE. NOW IT SAYS WHERE THE THING IS.
 *
 * The owner, 21/10: «الخطوة يتودي للثانية». Every success in this product
 * was «تم …», a reload, and the person left to remember where the next thing
 * lives: the order just made, the queue to pull more from, the screen that
 * prints the labels of the batch just built. The message is already at the
 * thumb; the way on goes with it.
 *
 * Three moments, one mechanism: a toast that can carry a link
 * (`ToastAction`), one question for «may this person open that screen»
 * (`useMayOpen`), and one file that says what each step is called and where
 * it goes (`next-step.ts`).
 * ═══════════════════════════════════════════════════════════════════════
 */

const user: { current: any } = { current: null };
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ currentUser: user.current }) }));

import { ToastProvider, useToast, type ToastAction } from '@/components/ui/Toast';
import { useMayOpen } from '@/hooks/useMayOpen';
import { deskIsEmpty, openOrderStep, printLabelsStep, pullMoreStep } from './next-step';
import { findRoute } from './route-registry';
import { repoFile, stripComments } from './guard-source';

const ID = '3f2b8c1e-7a4d-4e65-9b0a-1c2d3e4f5a6b';
const holding = (...permissions: string[]) => ({
  id: 'u1', role: 'MODERATOR', status: 'ACTIVE', permissions,
});
const yes = () => true;
const no = () => false;

beforeEach(() => {
  user.current = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// ───────────────────────── what each step is ─────────────────────────

describe('«افتح الطلب» — after an order was made', () => {
  it('— points at the order’s own address', () => {
    expect(openOrderStep(ID, yes)).toEqual({ label: 'افتح الطلب', href: `/orders/${ID}` });
  });

  it('and is not offered to somebody who may not open the orders screen', () => {
    expect(openOrderStep(ID, no)).toBeUndefined();
  });

  it.each([[undefined], [null], [''], ['abc'], [42], [`${ID}x`], [{ id: ID }]])(
    'and is not built from %j, which is not an order’s id — a link to a 404 is worse than none',
    (bad) => {
      expect(openOrderStep(bad, yes)).toBeUndefined();
    }
  );

  it('and it asks about the LIST, not about the order it is pointing at', () => {
    // `/orders/<id>` is a door; the gate it passes through is `/orders`.
    const asked: string[] = [];
    openOrderStep(ID, (p) => (asked.push(p), true));
    expect(asked).toEqual(['/orders']);
  });
});

describe('«اسحب طلبات جديدة» — only when that was the last thing on her desk', () => {
  const full = { work: [{}], noAnswer: [] };
  const decisions = { work: [], noAnswer: [{}, {}] };
  const empty = { work: [], noAnswer: [] };

  it('— not while there is a call left to make', () => {
    expect(pullMoreStep(full, yes)).toBeUndefined();
  });

  it('and not while there is a decision left to take', () => {
    expect(pullMoreStep(decisions, yes)).toBeUndefined();
  });

  it('and when the desk is empty it points at the pull screen', () => {
    expect(pullMoreStep(empty, yes)).toEqual({ label: 'اسحب طلبات جديدة', href: '/confirmation/queue' });
  });

  it('and not to somebody who may not open it — a moderator may not', () => {
    expect(pullMoreStep(empty, no)).toBeUndefined();
  });

  it('and «I could not read the desk» is NOT «the desk is empty»', () => {
    /*
     * The one that matters. A failed read is `null`, and rendering that as
     * «you are done, take more» would tell an agent with forty orders still
     * waiting that she has finished.
     */
    expect(deskIsEmpty(null)).toBe(false);
    expect(deskIsEmpty(undefined)).toBe(false);
    expect(pullMoreStep(null, yes)).toBeUndefined();
  });

  it('and only calls to make and decisions to take count as work', () => {
    // The rest of `MineResponse` — confirmed today, closed today, postponed —
    // is history and a promise, and is not even a field of `Desk`.
    expect(deskIsEmpty({ work: [], noAnswer: [] })).toBe(true);
    expect(deskIsEmpty({ work: [1], noAnswer: [] })).toBe(false);
    expect(deskIsEmpty({ work: [], noAnswer: [1] })).toBe(false);
  });
});

describe('«اطبع البوالص» — after a batch was made', () => {
  it('— points at the screen where printing lives', () => {
    expect(printLabelsStep(yes)).toEqual({ label: 'اطبع البوالص', href: '/ops/batches' });
  });

  it('and is not offered to somebody who may not open it', () => {
    expect(printLabelsStep(no)).toBeUndefined();
  });
});

describe('every address a step points at is a real screen', () => {
  it('— the three are in the registry, so a rename cannot leave a link dead', () => {
    for (const href of ['/orders', '/confirmation/queue', '/ops/batches']) {
      expect(findRoute(href), href).toBeDefined();
    }
  });
});

// ───────────────────────── may this person open it ─────────────────────────

describe('useMayOpen', () => {
  const ask = () => renderHook(() => useMayOpen()).result.current;

  it('— says yes to a screen the person holds a permission for, and no to the rest', () => {
    user.current = holding('orders.view');
    const may = ask();
    expect(may('/orders')).toBe(true);
    expect(may('/finance/profit')).toBe(false);
  });

  it('and ignores a query string — it asks about the screen, not the filter', () => {
    user.current = holding('orders.view');
    expect(ask()('/orders?state=DELIVERED')).toBe(true);
  });

  it('and a path the registry does not name is NO, never yes', () => {
    user.current = holding('orders.view');
    expect(ask()('/not-a-screen')).toBe(false);
    // «I cannot tell» is not permission to link.
    expect(ask()('/orders/3f2b8c1e-7a4d-4e65-9b0a-1c2d3e4f5a6b')).toBe(false);
  });

  it('and nobody signed in may open anything', () => {
    user.current = null;
    expect(ask()('/orders')).toBe(false);
  });

  it('and a suspended person may open nothing, however much they hold', () => {
    user.current = { ...holding('orders.view'), status: 'SUSPENDED' };
    expect(ask()('/orders')).toBe(false);
  });

  it('and it is the registry’s own rule, not a second one', () => {
    // It must call `canAccessRoute`. A re-implemented check here would be a
    // third copy of «who may open what», beside the sidebar and the guard.
    const src = stripComments(repoFile('src/hooks/useMayOpen.ts'));
    expect(src).toContain('canAccessRoute');
    expect(src).not.toMatch(/permissions\.(includes|some)/);
  });
});

// ───────────────────────── the toast that carries it ─────────────────────────

function Harness({ action }: { action?: ToastAction }) {
  const t = useToast();
  return (
    <>
      <button onClick={() => t.done('تم إنشاء الطلب', undefined, action)}>done</button>
      <button onClick={() => t.warn('تم، لكن…', 'ملاحظة', action)}>warn</button>
      <button onClick={() => t.failed('تعذّر', 'السبب', action)}>failed</button>
    </>
  );
}
const wrap = (action?: ToastAction) =>
  render(
    <ToastProvider>
      <Harness action={action} />
    </ToastProvider>
  );
const NEXT: ToastAction = { label: 'افتح الطلب', href: `/orders/${ID}` };

describe('a toast that carries the way on', () => {
  it('— shows it as a link to the address it was given', async () => {
    wrap(NEXT);
    await act(async () => screen.getByText('done').click());
    const link = screen.getByRole('link', { name: 'افتح الطلب' });
    expect(link.getAttribute('href')).toBe(`/orders/${ID}`);
  });

  it('and a toast without one has no link at all, exactly as before', async () => {
    wrap(undefined);
    await act(async () => screen.getByText('done').click());
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('and stays long enough to be pressed: gone from a plain one at 5s, still here with a step', async () => {
    /*
     * Four seconds is the time to READ «تم إنشاء الطلب». It is not the time
     * to decide to follow it and reach for the pointer.
     */
    const plain = wrap(undefined);
    await act(async () => screen.getByText('done').click());
    await act(async () => void vi.advanceTimersByTime(5000));
    expect(screen.queryByText('تم إنشاء الطلب'), 'العادية ما راحت').toBeNull();
    plain.unmount();

    wrap(NEXT);
    await act(async () => screen.getByText('done').click());
    await act(async () => void vi.advanceTimersByTime(5000));
    expect(screen.queryByText('تم إنشاء الطلب'), 'اللي فيها خطوة راحت قبل ما تنضغط').toBeTruthy();
    await act(async () => void vi.advanceTimersByTime(5000));
    expect(screen.queryByText('تم إنشاء الطلب'), 'ما راحت أبداً').toBeNull();
  });

  it('and leaves the moment the step is used — it would offer the same step from the screen you have gone to', async () => {
    wrap(NEXT);
    await act(async () => screen.getByText('done').click());
    await act(async () => screen.getByRole('link', { name: 'افتح الطلب' }).click());
    expect(screen.queryByText('تم إنشاء الطلب')).toBeNull();
  });

  it('and works on a warning, which already stays until closed', async () => {
    wrap(NEXT);
    await act(async () => screen.getByText('warn').click());
    expect(screen.getByRole('link', { name: 'افتح الطلب' })).toBeTruthy();
    await act(async () => void vi.advanceTimersByTime(60_000));
    expect(screen.queryByText('تم، لكن…'), 'التحذير راح لوحده').toBeTruthy();
  });

  it('and a refusal that carries one still waits to be closed', async () => {
    wrap(NEXT);
    await act(async () => screen.getByText('failed').click());
    await act(async () => void vi.advanceTimersByTime(60_000));
    expect(screen.queryByText('تعذّر')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'افتح الطلب' })).toBeTruthy();
  });

  it('and the link is a real <a>, not a button that runs code', () => {
    // A toast that executes arbitrary code is a toast whose button does
    // something nobody reading the screen can predict. Navigation is what is
    // wanted, and a link is navigation — one that can be middle-clicked, and
    // one the guard checks when it is opened.
    const src = stripComments(repoFile('src/components/ui/Toast.tsx'));
    expect(src).toContain('<Link');
    expect(src).not.toMatch(/action\.(onClick|run|callback|fn)\b/);
  });
});

// ───────────────────────── and the screens that use it ─────────────────────────

describe('the three moments use it, and say it only when it happened', () => {
  it('— making an order offers the order, on BOTH the success and the «not yours» warning', () => {
    const src = stripComments(repoFile('src/components/orders/CreateOrderModal.tsx'));
    expect(src).toContain('openOrderStep(created?.id, mayOpen)');
    // Both outcomes carry it: she made the order either way, and either way
    // she may want it open.
    expect(src).toMatch(/toast\.warn\([^;]*undefined,\s*openIt\)/);
    expect(src).toMatch(/toast\.done\([^;]*undefined,\s*openIt\)/);
  });

  it('and confirming an order says so — it used to be silent', () => {
    const src = stripComments(repoFile('src/components/screens/ConfirmationMineScreen.tsx'));
    expect(src).toContain('تم تأكيد الطلب');
    expect(src).toContain('pullMoreStep(fresh, mayOpen)');
    expect(src).toContain('deskIsEmpty(fresh)');
  });

  it('and what is said is said only AFTER the action succeeded, never about a refusal', () => {
    /*
     * `act` runs the callback after the request and the reload — inside the
     * `try`, before the `catch` — so a refusal throws past it. A toast that
     * said «تم تأكيد الطلب» about an order the server refused would be worse
     * than the silence it replaced.
     */
    const src = stripComments(repoFile('src/components/screens/ConfirmationMineScreen.tsx'));
    const act = src.slice(src.indexOf('const act = async'));
    const body = act.slice(0, act.indexOf('\n  };'));
    const at = body.indexOf('after?.(fresh)');
    expect(at, 'ما في after بالدالة').toBeGreaterThan(-1);
    expect(at, 'after بعد catch').toBeLessThan(body.indexOf('catch'));
    expect(body.indexOf('await fn()'), 'after قبل الطلب').toBeLessThan(at);
  });

  it('and the batch banner carries the way to its labels', () => {
    const src = stripComments(repoFile('src/components/screens/ShipmentsNewScreen.tsx'));
    expect(src).toContain('printLabelsStep(mayOpen)');
    expect(src).toContain('labelsStep.href');
  });

  it('and no screen builds its own «open the order» link where the helper exists', () => {
    // One place says what the step is called and where it goes.
    const src = stripComments(repoFile('src/components/orders/CreateOrderModal.tsx'));
    expect(src, 'رابط الطلب مكتوب يدوياً').not.toMatch(/href:\s*`\/orders\//);
  });
});
