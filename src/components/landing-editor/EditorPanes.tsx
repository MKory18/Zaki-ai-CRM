'use client';

import { RiEyeLine, RiPencilLine } from '@remixicon/react';

/**
 * EDIT AND PREVIEW, SIDE BY SIDE — AND ON A PHONE, ONE AT A TIME.
 *
 * On a laptop the two columns stand together and nothing here is needed:
 * the controls are on the right, the page is on the left, and a change is
 * visible in the same glance that made it. That is the whole point of the
 * arrangement and it is why the editors were built that way.
 *
 * ON A PHONE THE SAME ARRANGEMENT IS A LIE. Two columns do not fit at 390
 * px, so they stack — and a stacked editor means the preview sits below a
 * panel that is itself taller than the screen. A seller changing the accent
 * colour sees nothing happen, scrolls down past eleven controls to find out
 * whether it worked, and scrolls back up to change it again. Measured on
 * the block builder's own panel: the preview starts more than two screens
 * below the first control.
 *
 * So on a phone it is a TOGGLE, not a stack: one pane at a time, switched
 * in one tap, with both panes alive — the preview is not rebuilt when it
 * comes back, it was only out of sight.
 *
 * WHY THE CLASSES AND NOT A WRAPPER COMPONENT. Each editor's two panes sit
 * inside its own grid, with its own column widths and its own header, and a
 * wrapper would have to take all three as props — so the shared thing here
 * is the DECISION (which pane is shown, at which width) and each editor
 * keeps its own layout. One toggle, one pair of class helpers, three
 * editors that still look like themselves.
 */

export type EditorPane = 'edit' | 'preview';

/**
 * Shown on a phone and gone from `lg` up, where both panes are visible and
 * a switch between them would be a control that does nothing.
 */
export function PaneToggle({
  pane,
  onPane,
  className = '',
}: {
  pane: EditorPane;
  onPane: (p: EditorPane) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="تعديل أو معاينة"
      className={`flex gap-0.5 rounded-lg border border-[var(--sys-border)] p-0.5 lg:hidden ${className}`}
    >
      {(
        [
          ['edit', 'تعديل', RiPencilLine],
          ['preview', 'معاينة', RiEyeLine],
        ] as const
      ).map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          // The pair is a single choice, so the one you are on is pressed
          // rather than merely coloured: a seller using a screen reader
          // hears which half of the editor they are in.
          aria-pressed={pane === key}
          onClick={() => onPane(key)}
          // 44px on a phone, which is the only place this is drawn — and
          // `md:min-h-0` for the desk twin the tap-target rule asks for.
          className={`min-h-11 md:min-h-0 flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${
            pane === key
              ? 'bg-[var(--sys-primary)] text-white'
              : 'text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)]'
          }`}
        >
          <Icon className="h-4 w-4" /> {label}
        </button>
      ))}
    </div>
  );
}

/**
 * HIDDEN, NOT UNMOUNTED.
 *
 * `hidden` keeps the pane in the tree, so switching back shows the preview
 * that was already there — the scroll position, the zoom, the block that was
 * open. Rendering it conditionally would rebuild the whole page on every tap
 * and lose all three, which on a phone is the slowest part of the editor.
 */
export function editPaneClass(pane: EditorPane): string {
  return pane === 'edit' ? 'lg:block' : 'hidden lg:block';
}

export function previewPaneClass(pane: EditorPane): string {
  return pane === 'preview' ? 'flex' : 'hidden lg:flex';
}
