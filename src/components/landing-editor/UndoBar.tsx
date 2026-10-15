'use client';

import { RiArrowGoBackLine, RiArrowGoForwardLine } from '@remixicon/react';

/**
 * ONE STEP BACK, IN EVERY EDITOR, DRAWN ONCE.
 *
 * The page editor had this pair and the other two editors did not, which
 * is the worst of the three possible states: a seller who learns that
 * Ctrl+Z works on a landing page tries it on the shop's home page, loses
 * the block they just deleted, and stops trusting either.
 *
 * It is NOT the same control as «أرجِع للمحفوظة» standing beside it on the
 * templates screen. That one throws away every unsaved change at once and
 * returns to the draft on the server; this one takes back the LAST change.
 * They are a step and a reset, and a seller who presses the wrong one has
 * been told by the product that they are the same thing — so they are drawn
 * differently, labelled differently, and both are kept.
 *
 * WHY IT IS AN ICON PAIR AND NOT A WORD. It sits in a header that already
 * holds «حفظ» and «نشر», and a third and fourth word there pushes the two
 * that matter off a 390px screen. Both carry `aria-label` and a `title`
 * with the keystroke, and the arrows mirror in RTL — an undo arrow that
 * points the same way in both directions is pointing the wrong way in one.
 */
export function UndoBar({
  undo,
  redo,
  canUndo,
  canRedo,
  className = '',
}: {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  className?: string;
}) {
  return (
    <div className={`flex rounded-lg border border-[var(--sys-border)] p-0.5 ${className}`}>
      <button
        type="button"
        aria-label="تراجع"
        onClick={undo}
        disabled={!canUndo}
        title="تراجع — Ctrl+Z"
        className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 cursor-pointer rounded-md p-1.5 text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] disabled:cursor-default disabled:opacity-30"
      >
        <RiArrowGoBackLine className="icon-mirror h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="إعادة"
        onClick={redo}
        disabled={!canRedo}
        title="إعادة — Ctrl+Shift+Z"
        className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 cursor-pointer rounded-md p-1.5 text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] disabled:cursor-default disabled:opacity-30"
      >
        <RiArrowGoForwardLine className="icon-mirror h-4 w-4" />
      </button>
    </div>
  );
}
