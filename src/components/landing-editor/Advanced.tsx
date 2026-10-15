'use client';

import { useId, useState } from 'react';
import { RiArrowDownSLine } from '@remixicon/react';

/**
 * THE CONTROLS NOBODY USES ON THEIR FIRST PAGE, FOLDED AWAY.
 *
 * Counted on the two editors before this: the block builder's identity
 * panel offered twelve colour swatches, a hex field, a mood, thirteen
 * typefaces, a font uploader, two corner styles, a page background and a
 * veil slider — all open, all at once, before the seller had chosen a
 * single block. The templates screen's colour tab offered fourteen named
 * colour pickers under the one picker that actually decides the shop's
 * colour, every one of them derived from it and most of them never touched.
 *
 * A panel like that does not offer a choice, it hides one: the control that
 * matters is the same size as the thirteen that do not, so the eye has no
 * reason to land on it. The owner's complaint about the storefront screens
 * was exactly this — «معجّق، كلام فوق بعضه، داتا مكدّسة، بتضيع».
 *
 * NOTHING IS REMOVED. Every control is still here, one tap away, with its
 * own heading saying what is inside. «Mark a feature, never delete it» is
 * the house rule, and a folded control is marked: the row says how many are
 * in there, so a seller who set one last week knows where it went.
 *
 * CLOSED BY DEFAULT, AND NOT REMEMBERED. A disclosure that restores itself
 * from storage is a panel that is sometimes open and sometimes not for
 * reasons the person cannot see, and the screenshots in a bug report stop
 * matching the screen. One state, visible, every time the editor loads.
 */
export function Advanced({
  children,
  label = 'متقدّم',
  /** What is inside, in a seller's words — «الزوايا · خلفية الصفحة · خطّك». */
  holds,
  className = '',
}: {
  children: React.ReactNode;
  label?: string;
  holds?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={`border-t border-[var(--sys-surface)] pt-3 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="min-h-11 md:min-h-0 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-start transition hover:text-[var(--sys-primary)]"
      >
        <span className="min-w-0">
          <span className="block text-xs font-bold text-[var(--sys-muted-foreground)]">{label}</span>
          {holds && <span className="block truncate text-xs text-[var(--sys-muted)]">{holds}</span>}
        </span>
        <RiArrowDownSLine
          className={`h-4 w-4 shrink-0 text-[var(--sys-muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {/* `hidden` rather than unmounted: a half-typed hex in there must
          survive a seller folding the section to look at the preview. */}
      <div id={id} className={open ? 'mt-2 space-y-3' : 'hidden'}>
        {children}
      </div>
    </div>
  );
}
