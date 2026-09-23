'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

/**
 * ASKING BEFORE, AND TELLING AFTER — inside the app.
 *
 * `confirm()` and `alert()` are the operating system interrupting the
 * person: a grey box with the hostname at the top, Latin buttons, and the
 * same alarmed look whatever it says. A question about deleting one row
 * arrives looking exactly like a browser security warning.
 *
 * This is the same question in the app's own dialog, in Arabic, with the
 * dangerous button coloured as dangerous. Sixteen places called the native
 * ones; a component each would have been sixteen dialogs to keep in step,
 * so it is one hook:
 *
 *     const confirm = useConfirm();
 *     if (!(await confirm({ title: 'حذف…؟', tone: 'danger' }))) return;
 *
 * It returns a promise so the calling code keeps reading top to bottom,
 * the way `confirm()` let it.
 */

export interface ConfirmOptions {
  title: string;
  /** The consequence, in one sentence. */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything destructive — it colours the button. */
  tone?: 'danger' | 'normal';
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<ConfirmOptions | null>(null);
  const answer = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((options) => {
    setOpen(options);
    return new Promise<boolean>((resolve) => {
      answer.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    setOpen(null);
    // Dismissing IS declining. A dialog closed by Escape must never be read
    // as a yes — the whole point of asking is that silence is not consent.
    answer.current?.(ok);
    answer.current = null;
  };

  const danger = open?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Modal isOpen={Boolean(open)} onClose={() => close(false)} title="" maxWidth="sm">
        {open && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  danger ? 'bg-[#feecee] text-[#fb323f]' : 'bg-[#eef2f6] text-[#364152]'
                }`}
              >
                {danger ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#121926]">{open.title}</p>
                {open.body && <p className="mt-1 text-xs leading-6 text-[#697586]">{open.body}</p>}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => close(false)}>
                {open.cancelLabel ?? 'إلغاء'}
              </Button>
              <Button
                size="sm"
                onClick={() => close(true)}
                className={danger ? 'bg-[#fb323f] hover:bg-[#e02b37]' : undefined}
              >
                {open.confirmLabel ?? (danger ? 'احذف' : 'تابع')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

/**
 * Ask the person. Falls back to the browser's own dialog if the provider is
 * missing, so a screen mounted outside it still asks rather than silently
 * going ahead — a missing provider must never turn a question into a yes.
 */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  return (
    ask ??
    (async (o) =>
      typeof window !== 'undefined' &&
      window.confirm(`${o.title}${o.body ? `\n\n${o.body}` : ''}`))
  );
}
