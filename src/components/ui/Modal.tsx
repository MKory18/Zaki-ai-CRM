'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { RiCloseLine } from '@remixicon/react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
  /**
   * WHERE IT COMES FROM. A SHEET IS THIS COMPONENT WITH AN EDGE.
   *
   * `center` is a dialog: a decision, and the page behind it waits.
   * `end` is a side panel: a record you read BESIDE the list you found it
   *   in, so closing it returns you to your place in that list rather than
   *   to the top of a page you have to find your way down again.
   * `bottom` is a phone's sheet, where the thumb already is.
   *
   * It is one prop and not a second component on purpose: a second dialog
   * implementation means a second portal, a second scrim, a second Escape
   * handler and a second focus trap — and one of the two always lags.
   */
  side?: 'center' | 'end' | 'bottom';
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'lg',
  side = 'center',
}: ModalProps) {
  const panel = React.useRef<HTMLDivElement>(null);
  /**
   * ESCAPE CLOSED IT, BUT TAB COULD WALK OUT OF IT.
   *
   * A dialog whose focus is not held is a dialog where the third Tab press
   * lands on a button in the page behind — a page the scrim says is not
   * available, and which the keyboard could reach anyway. And on close,
   * focus went to the top of the document rather than back to the control
   * that opened it, so somebody who opened a modal from row forty resumed
   * at row one.
   */
  useEffect(() => {
    if (!isOpen) return;

    const opener = document.activeElement as HTMLElement | null;
    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      /**
       * No visibility filter here, and that is deliberate.
       *
       * The obvious one — `el.offsetParent !== null` — is wrong in exactly
       * this component: this panel lives inside a `position: fixed` box,
       * and a fixed element's descendants report a null `offsetParent` in
       * real browsers. It would have filtered away every stop in the
       * dialog and quietly turned the trap off altogether.
       *
       * The selector already excludes disabled controls and anything taken
       * out of the tab order, and a dialog renders what it means to show.
       */
      const stops = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const here = document.activeElement;
      if (!e.shiftKey && here === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (here === first || !panel.current.contains(here))) {
        e.preventDefault();
        last.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    // After paint: the panel is not in the document yet on this tick.
    const id = window.setTimeout(() => {
      panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(id);
      // Back to the control that opened it, not to the top of the page.
      opener?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const widthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
  };

  // Rendered through a portal, into <body>. A modal opened from inside a
  // clickable row used to be a DOM child of that row, so every click inside
  // it bubbled up and opened the row behind it — clicking "السجل" landed you
  // in the order instead of the history.
  return createPortal(
    <div
      className={clsx(
        // One scrim for the whole product. It used to be `--sys-sidebar`
        // at 50% — a token that is a LIGHT colour in two of the three
        // themes, so the wash meant to push the page back barely dimmed it.
        'fixed inset-0 z-50 flex bg-[var(--sys-background)]/60 backdrop-blur-xs animate-in fade-in duration-200',
        side === 'center' && 'items-center justify-center p-4',
        side === 'end' && 'items-stretch justify-start',
        side === 'bottom' && 'items-end justify-center'
      )}
      // The portal moves the modal out of the row in the DOM, but a React
      // event still travels up the COMPONENT tree — so a click on a tab
      // inside this modal reached the row's onClick and opened the order
      // behind it. Nothing that happens inside a modal belongs to whatever
      // rendered it.
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative z-10 flex w-full flex-col overflow-hidden bg-[var(--sys-card)] shadow-raised',
          side === 'center' && clsx('max-h-[90vh] rounded-lg', widthStyles[maxWidth]),
          // A record read BESIDE the list it was found in: closing it
          // returns you to your place in that list. Full height on a desk,
          // and on a phone it is simply the screen.
          side === 'end' && clsx('h-full max-h-full sm:rounded-s-lg', widthStyles[maxWidth]),
          side === 'bottom' && clsx('max-h-[85vh] rounded-t-lg', widthStyles[maxWidth]),
          side === 'bottom' && 'pb-[env(safe-area-inset-bottom)]'
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
          <div>
            <h3 className="text-lg font-semibold text-[var(--sys-heading)]">{title}</h3>
            {subtitle && <p className="text-xs text-[var(--sys-muted-foreground)] mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1 rounded-lg text-[var(--sys-muted)] hover:text-[var(--sys-heading)] hover:bg-[var(--sys-border)] transition-colors cursor-pointer"
          >
            <RiCloseLine className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>,
    document.body
  );
}
