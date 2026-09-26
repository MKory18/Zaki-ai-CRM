// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { IDLE_LIMIT_MS, IDLE_WARN_MS } from '@/lib/exposure';

/**
 * THE TWO THINGS A WEB PAGE CAN HONESTLY DO ABOUT A PERSONAL PHONE.
 *
 * Neither of them stops a screenshot. A page cannot stop a screenshot on
 * any phone, and a second phone pointed at the first defeats every scheme
 * that claims to. What these do is put a name in the picture, and stop the
 * account being open on a device nobody is holding.
 */

const signOut = vi.fn(async (_reason?: string) => undefined);
vi.mock('@/lib/sign-out', () => ({ signOut: (reason?: string) => signOut(reason) }));

import { Watermark } from './Watermark';
import { IdleGuard } from './IdleGuard';

const VIEWER = { name: 'أحمد المصري', id: '3f2a1b9c-77d4-4e51-9a02-abc123def456' };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('the watermark', () => {
  it('names the account in a way a photograph will carry', () => {
    render(<Watermark viewer={VIEWER} />);
    expect(screen.getAllByText(/أحمد المصري/).length).toBeGreaterThan(1);
  });

  it('cannot be clicked, selected, or land in a copy-paste', () => {
    render(<Watermark viewer={VIEWER} />);
    const layer = screen.getByTestId('watermark');
    expect(layer.className).toContain('pointer-events-none');
    expect(layer.className).toContain('select-none');
  });

  it('sits ABOVE the dialogs, which is where one customer is largest', () => {
    // A watermark under the modal layer is absent from exactly the screen
    // worth photographing: one person's name, address and phone, enlarged.
    const modal = readFile('src/components/ui/Modal.tsx');
    const modalZ = Number(/z-(\d+)/.exec(modal)?.[1] ?? 0);
    const mark = readFile('src/components/shell/Watermark.tsx');
    const markZ = Number(/z-\[(\d+)\]/.exec(mark)?.[1] ?? 0);
    expect(markZ).toBeGreaterThan(modalZ);
  });

  /**
   * THE ONE EXEMPTION, AND WHY IT IS SAFE TO HAVE ONE.
   *
   * The owner is exempt: the mark exists to make a leaked screen traceable
   * to the account that was looking at it, and the owner is who that
   * protects rather than who it deters. Everybody else carries it.
   *
   * This asserted that the mark was UNCONDITIONAL, which was the right
   * rule while there were no exemptions and is now too strong. What still
   * has to hold is the shape of the condition: exactly one, on the ROLE
   * the server rendered, and on nothing a client can change. A mark behind
   * a preference or a query parameter is a mark for the honest.
   */
  it('is lifted for the owner, and for nobody else', () => {
    const shell = readFile('src/components/shell/Shell.tsx');
    expect(shell).toContain('<Watermark');
    const conditions = [...shell.matchAll(/\{\s*([^{}]+?)\s*&&\s*<Watermark/g)].map((m) => m[1]);
    expect(conditions.length, 'العلامة بلا شرط، أو بأكثر من شرط').toBe(1);
    expect(conditions[0], 'الإعفاء ليس بالدور').toBe("userRole !== 'SUPER_ADMIN'");
    // The role arrives as a rendered prop from the server layout. Anything
    // the browser can set — storage, a search param, a toggle — is not it.
    for (const escape of ['localStorage', 'sessionStorage', 'searchParams', 'document.cookie']) {
      const near = new RegExp(escape + '[\s\S]{0,200}<Watermark');
      expect(near.test(shell), `الإعفاء من ${escape}`).toBe(false);
    }
  });
});

function readFile(rel: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(require('node:path').join(process.cwd(), rel), 'utf8');
}

describe('a phone left on a counter', () => {
  const T0 = 1_700_000_000_000;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  /** Move the world forward, letting the guard's interval fire. */
  async function pass(ms: number) {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }

  it('says nothing while somebody is working', async () => {
    render(<IdleGuard />);
    await pass(IDLE_LIMIT_MS - IDLE_WARN_MS - 10_000);
    expect(screen.queryByTestId('idle-warning')).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('warns before it acts', async () => {
    render(<IdleGuard />);
    await pass(IDLE_LIMIT_MS - IDLE_WARN_MS + 1000);
    expect(screen.getByTestId('idle-warning')).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('and signs out for real when nobody answers', async () => {
    render(<IdleGuard />);
    await pass(IDLE_LIMIT_MS + 1000);
    expect(signOut).toHaveBeenCalledWith('idle');
  });

  it('signs out ONCE, not once per tick', async () => {
    render(<IdleGuard />);
    await pass(IDLE_LIMIT_MS + 60_000);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('a touch puts the clock back to zero', async () => {
    render(<IdleGuard />);
    await pass(IDLE_LIMIT_MS - IDLE_WARN_MS + 1000);
    expect(screen.getByTestId('idle-warning')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText('أنا هنا'));
    });
    expect(screen.queryByTestId('idle-warning')).toBeNull();

    await pass(IDLE_LIMIT_MS - 10_000);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('and so does scrolling, which is the only thing a reader does', async () => {
    render(<IdleGuard />);
    await pass(IDLE_LIMIT_MS - 30_000);
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });
    await pass(IDLE_LIMIT_MS - 30_000);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('work in another tab keeps this one alive', async () => {
    render(<IdleGuard />);
    await pass(IDLE_LIMIT_MS - 30_000);
    // The other tab wrote its own activity a moment ago.
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'salesflow.lastActive', newValue: String(Date.now()) })
      );
    });
    await pass(IDLE_LIMIT_MS - 30_000);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('but a STALE write from another tab does not cut this one short', async () => {
    // The other tab is a second voice about the same account, and it can be
    // wrong: a tab restored from the back/forward cache replays the value
    // it was holding an hour ago. Taking that as the truth signs out the
    // person who is working in THIS tab right now, which reads as the app
    // throwing people out at random.
    render(<IdleGuard />);
    await pass(5 * 60_000);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'salesflow.lastActive', newValue: String(T0 - 3_600_000) })
      );
    });
    await pass(10 * 60_000);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('and a garbled one is ignored rather than believed', async () => {
    render(<IdleGuard />);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'salesflow.lastActive', newValue: 'يا سلام' })
      );
    });
    await pass(IDLE_LIMIT_MS - 30_000);
    expect(signOut).not.toHaveBeenCalled();
    await pass(60_000);
    expect(signOut).toHaveBeenCalledWith('idle');
  });

  it('a stale timestamp in storage never signs out a person who just arrived', async () => {
    // The other direction, and the one that would be a lockout rather than
    // a leak: opening the app after a week away must not read last week's
    // timestamp as "twenty minutes idle" and bounce somebody straight back
    // to the login screen they just came from. Loading the shell is a
    // person acting; the shared clock may extend a session, never end one.
    localStorage.setItem('salesflow.lastActive', String(T0 - 7 * 24 * 60 * 60 * 1000));
    render(<IdleGuard />);
    await pass(60_000);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('and coming BACK to the tab is not, by itself, being present', async () => {
    // Somebody picking up a phone that has been face-down for an hour
    // arrives at exactly this moment. It is the moment the session must
    // already be gone.
    render(<IdleGuard />);
    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await pass(IDLE_LIMIT_MS - 1000);
    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await pass(5_000);
    expect(signOut).toHaveBeenCalledWith('idle');
  });
});

describe('the app in the background', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('is covered, for the thumbnail the phone keeps of it', async () => {
    render(<IdleGuard />);
    expect(screen.queryByTestId('backgrounded')).toBeNull();

    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByTestId('backgrounded')).toBeTruthy();
  });

  it('and uncovered on return — it is a curtain, not a lock', async () => {
    render(<IdleGuard />);
    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.queryByTestId('backgrounded')).toBeNull();
  });
});
