'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { RiAlertLine, RiCheckLine, RiCloseLine, RiErrorWarningLine } from '@remixicon/react';

/**
 * WHAT THE SCREEN SAYS AFTER YOU PRESS SOMETHING.
 *
 * Two hundred and eighty-nine `setError` calls across seventy files, each
 * with its own strip, its own colour, its own place on the page — and the
 * place is the problem. A red line at the TOP of a long form, after a
 * button at the bottom, is a message nobody sees: the button is pressed,
 * nothing appears to happen, and it is pressed again.
 *
 * So the message appears where the press was: near the thumb on a phone,
 * near the pointer on a desk, in the same place every time.
 *
 * A SUCCESS LEAVES. A FAILURE DOES NOT.
 *
 * «تم الحفظ» has done its job in three seconds and then it is clutter. A
 * refusal has a REASON in it, and a reason that removes itself after three
 * seconds is a reason nobody finished reading — and the commonest thing a
 * person does next is press the button again. So an error waits to be
 * dismissed, and says so with a close button rather than a countdown.
 *
 * AND IT IS NOT THE ONLY CHANNEL.
 *
 * `role="alert"` for a refusal and `aria-live="polite"` for a confirmation,
 * because the person who most needs to be told something happened may not
 * be looking at the corner it happened in.
 */

export type ToastTone = 'done' | 'warn' | 'failed';

/**
 * THE STEP AFTER THIS ONE, OFFERED WHERE THE PRESS WAS.
 *
 * The owner, 21/10: «الخطوة يتودي للثانية». Every success on this system
 * ended the same way — «تم …», a reload, and the person left to remember
 * where the next thing lives: the order just made, the batch just built, the
 * queue to pull from. The message is already at the thumb; the way on goes
 * with it.
 *
 * A LINK, never a callback. A toast that runs arbitrary code is a toast
 * whose button does something nobody reading the screen can predict, and the
 * one place this is wanted — «go to the thing» — is a navigation, which a
 * link is already. It also means the destination is an address a person can
 * middle-click, and one the guard checks when it is opened.
 *
 * WHETHER IT MAY BE OFFERED IS THE CALLER'S QUESTION. A link to a screen
 * the person cannot open is a link that ends in a refusal, so the caller
 * asks `useMayOpen` first and passes nothing when the answer is no.
 */
export interface ToastAction {
  label: string;
  href: string;
}

interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
  /** Not every message can be said in six words. */
  detail?: string;
  action?: ToastAction;
}

const LIVE_MS = 4000;
/**
 * LONG ENOUGH TO BE PRESSED.
 *
 * Four seconds is right for a message that is only read, and wrong for one
 * with a button: it is the time to read «تم إنشاء الطلب» and not the time
 * to decide to follow it and reach for the pointer. A toast that offers a
 * next step stays twice as long, and leaves the moment it is used.
 */
const LIVE_WITH_ACTION_MS = 9000;

const Ctx = createContext<{
  done: (text: string, detail?: string, action?: ToastAction) => void;
  warn: (text: string, detail?: string, action?: ToastAction) => void;
  failed: (text: string, detail?: string, action?: ToastAction) => void;
}>({ done: () => undefined, warn: () => undefined, failed: () => undefined });

/** Say something happened. Available anywhere under the shell. */
export function useToast() {
  return useContext(Ctx);
}

const LOOK: Record<ToastTone, { cls: string; Icon: typeof RiCheckLine }> = {
  done: {
    cls: 'border-[var(--sys-success)]/40 bg-[var(--sys-success-soft)] text-[var(--sys-success)]',
    Icon: RiCheckLine,
  },
  warn: {
    cls: 'border-[var(--sys-warning)]/40 bg-[var(--sys-warning-soft)] text-[var(--sys-warning)]',
    Icon: RiAlertLine,
  },
  failed: {
    cls: 'border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)]',
    Icon: RiErrorWarningLine,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const next = useRef(1);

  const push = useCallback((tone: ToastTone, text: string, detail?: string, action?: ToastAction) => {
    const id = next.current++;
    // Four at a time. A screen that fires ten in a loop should not bury the
    // page it is reporting on.
    setItems((all) => [...all, { id, tone, text, detail, action }].slice(-4));
  }, []);

  const api = useMemo(
    () => ({
      done: (t: string, d?: string, a?: ToastAction) => push('done', t, d, a),
      warn: (t: string, d?: string, a?: ToastAction) => push('warn', t, d, a),
      failed: (t: string, d?: string, a?: ToastAction) => push('failed', t, d, a),
    }),
    [push]
  );

  const drop = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  return (
    <Ctx.Provider value={api}>
      {children}
      {items.length > 0 && (
        <div
          // Above whatever owns the bottom strip — the navigation, or a bulk
          // bar that reported its own height into `--bulk-h`.
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[calc(var(--bulk-h,4.5rem)+1rem+env(safe-area-inset-bottom))] md:pb-6"
        >
          {items.map((t) => (
            // `drop` itself, not an arrow around it: the arrow was a new
            // function on every render of this provider, and the line's
            // dismiss timer depends on it — so each arriving toast restarted
            // the countdown of every toast already on screen.
            <Line key={t.id} toast={t} onDone={drop} />
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}

function Line({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  const { cls, Icon } = LOOK[toast.tone];
  const leaves = toast.tone === 'done';

  /**
   * THE DISMISSER IN A REF, SO THE COUNTDOWN CANNOT BE RESTARTED FROM OUTSIDE.
   *
   * `drop` is stable today, and listing it was correct. But a countdown whose
   * correctness depends on the CALLER passing a stable function is a countdown
   * that breaks silently: an arrow written in place above would make every
   * arriving toast reset the timer of every toast already on screen, nothing
   * would throw, and the messages would simply stop leaving.
   */
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (!leaves) return;
    const id = setTimeout(
      () => onDoneRef.current(toast.id),
      toast.action ? LIVE_WITH_ACTION_MS : LIVE_MS
    );
    return () => clearTimeout(id);
  }, [leaves, toast.id, toast.action]);

  return (
    <div
      role={toast.tone === 'failed' ? 'alert' : 'status'}
      aria-live={toast.tone === 'failed' ? 'assertive' : 'polite'}
      className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-lg border px-3 py-2.5 shadow-overlay ${cls}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{toast.text}</p>
        {toast.detail && <p className="mt-0.5 text-xs opacity-80">{toast.detail}</p>}
      </div>
      {/* The way on. It leaves with the message the moment it is used: a
          button that stayed after you followed it would offer the same step
          from the screen you have already gone to. */}
      {toast.action && (
        <Link
          href={toast.action.href}
          onClick={() => onDone(toast.id)}
          className="min-h-11 shrink-0 self-center px-1 text-sm font-bold underline md:min-h-0"
        >
          {toast.action.label}
        </Link>
      )}
      {/* A message that removes itself is fine. A REASON that removes itself
          is a reason nobody finished reading, so this is how it goes. */}
      {!leaves && (
        <button type="button" onClick={() => onDone(toast.id)} aria-label="إغلاق" className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 -me-1 shrink-0 p-1">
          <RiCloseLine className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
