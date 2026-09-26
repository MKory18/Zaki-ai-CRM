'use client';

import React from 'react';
import clsx from 'clsx';
import { RiCheckLine, RiLoader4Line } from '@remixicon/react';
import { hapticConfirm, hapticRefuse } from '@/lib/haptics';

/**
 * THE ONE CONTROL, AND THE EIGHT THINGS IT CAN BE.
 *
 * rest · hover · pressed · focus-visible · disabled · loading · success ·
 * error. The first four are answered by rules in system.css, so every
 * button in the product has them whether or not it came through here. The
 * last four need to know what the click is DOING, so they live here.
 *
 * WHY THE BUTTON RUNS THE WORK ITSELF.
 *
 * `onClick` returning a promise is the whole point. A button that only
 * fires an event cannot know when the work has finished, so every caller
 * kept its own `busy` flag — and the ones that forgot are why a second
 * shipment gets dispatched, a second payout recorded, a second deduction
 * charged: somebody pressed again while the first request was in the air.
 *
 * Here the promise IS the flag. While it is pending the button is disabled
 * and the spinner sits inside the button's own width, so the row does not
 * jump and the next control does not slide under a finger already moving
 * towards it. Double submission is not discouraged; it is impossible.
 *
 * Money and state wait for the server. There is no optimistic path in this
 * component and there should not be: a wallet showing a payment that later
 * fails is worse than a wallet that takes a second.
 */

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  /** For the callers that still manage their own flag. */
  loading?: boolean;
  /**
   * Return a promise and the button does the rest: disabled while it runs,
   * a tick when it resolves, a shake when it rejects.
   */
  // `unknown`, not `void | Promise`: plenty of handlers are one-line
  // expressions that happen to evaluate to something, and refusing those
  // would turn a styling change into a hundred edits.
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => unknown;
}

/** Long enough to be seen, short enough to stay out of the way. */
const SUCCESS_MS = 1100;
const SHAKE_MS = 300;

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const alive = React.useRef(true);

  React.useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );

  const handle = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Two locks, and the outer one is the guarantee: `disabled` below
      // means a second press never reaches this function at all. This
      // check is the inner lock, for the day somebody removes `disabled`
      // to style the button differently. Button.test.tsx proves the
      // guarantee; it cannot isolate this line, because the first lock
      // already stopped the click.
      if (!onClick || busy) return;
      const result = onClick(e);
      if (!result || typeof (result as Promise<unknown>).then !== 'function') return;

      setBusy(true);
      setFailed(false);
      void (result as Promise<unknown>)
        .then(() => {
          if (!alive.current) return;
          // A second channel, never the only one: the tick below says the
          // same thing, and half the warehouse is on iPhones that cannot
          // feel this at all.
          hapticConfirm();
          setDone(true);
          setTimeout(() => {
            if (alive.current) setDone(false);
          }, SUCCESS_MS);
        })
        .catch(() => {
          if (!alive.current) return;
          hapticRefuse();
          setFailed(true);
          setTimeout(() => {
            if (alive.current) setFailed(false);
          }, SHAKE_MS);
        })
        .finally(() => {
          if (alive.current) setBusy(false);
        });
    },
    [onClick, busy]
  );

  /**
   * A HEIGHT, NOT A GUESS AT ONE.
   *
   * These used to be padding alone, so the height came out of whatever font
   * size the size carried — and a toolbar ended up with an input at 34px, a
   * button at 30, a second at 32 and a dropdown at 36, all in one row.
   * Nobody chose four heights; four heights were arithmetic.
   *
   *   sm  32px  a control inside a row — a row action, a chip
   *   md  40px  everything else: toolbars, forms, dialogs
   *   lg  48px  the one action a screen is for, big enough for a thumb
   *
   * AND 44px ON A PHONE, WHICH IS THE SAME DECISION MADE TWICE.
   *
   * Those three heights are a typographic rhythm for a DESK, where the
   * pointer is a mouse and 32px is a comfortable row action. A thumb is
   * not a mouse: measuring the screens at 360px found the export button at
   * 32 and the toolbar at 40, both under the 44px gate.
   *
   * The first attempt kept the heights and grew an invisible hit area
   * underneath. It worked, and it was wrong: in a toolbar that wraps, two
   * rows sit 8px apart, so the areas overlapped and the point below
   * «تصدير CSV» belonged to «إدخال طلب سريع». A press that fires the wrong
   * action is worse than a press that misses — a miss is repeated, a wrong
   * action is discovered later.
   *
   * So the height itself changes, and only where the pointer is a finger.
   * On a phone the dense-row rhythm is not in play anyway: `Rows` draws
   * cards there, not a table.
   */
  /**
   * A TOOLTIP IS NOT A NAME.
   *
   * Row actions across this product are an icon and a `title`: a pencil, a
   * bin, an arrow, each with «تعديل المنتج» or «حذف المنتج» on hover. The
   * hover text is for a mouse. A screen reader announces «زر» and stops,
   * and `title` is not a reliable accessible name — some readers read it,
   * some ignore it, and none of them should have to guess.
   *
   * So when a button has NO text of its own and the caller gave a title,
   * the title is the name too. One rule here instead of an `aria-label`
   * remembered on a hundred buttons — and a caller that passes its own
   * `aria-label` still wins.
   */
  const wordless = !React.Children.toArray(children).some(
    (c) => typeof c === 'string' || typeof c === 'number'
  );
  const named =
    props['aria-label'] ??
    (wordless && typeof props.title === 'string' ? props.title : undefined);

  const sizeStyles = {
    sm: 'h-11 md:h-8 px-3 text-xs',
    md: 'h-11 md:h-10 px-4 text-sm',
    lg: 'h-12 px-5 text-base',
  };

  /**
   * AND 44 WIDE, NOT JUST 44 TALL.
   *
   * A row's icon actions pass `className="p-2"`, which competes with the
   * size's own `px-3`: same specificity, so the winner is whichever appears
   * later in the stylesheet, not in the class list. The three buttons on a
   * product row came out 42px wide — tall enough, two pixels short across.
   *
   * A square is also simply what an icon button is.
   */
  const squareOnPhone = wordless ? 'min-w-11 md:min-w-0' : '';

  const variantStyles: Record<Variant, string> = {
    primary:
      'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-primary-hover)] border border-transparent',
    secondary:
      'bg-[var(--sys-surface)] text-[var(--sys-heading)] hover:bg-[var(--sys-border)] border border-[var(--sys-border)]',
    outline:
      'bg-[var(--sys-card)] text-[var(--sys-heading)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)]',
    danger:
      'bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-destructive)]/85 border border-transparent',
    ghost:
      'bg-transparent text-[var(--sys-foreground)] hover:bg-[var(--sys-surface)] border border-transparent',
    success:
      'bg-[var(--sys-success)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-success)]/85 border border-transparent',
  };

  const working = busy || loading;

  return (
    <button
      disabled={disabled || working}
      aria-busy={working || undefined}
      aria-label={named}
      onClick={handle}
      className={clsx(
        // `rounded` with no step is Tailwind's 4px, and it put the one
        // coloured button in a filter bar on tighter corners than every
        // input beside it. Controls are surfaces too.
        'relative inline-flex items-center justify-center gap-1.5 font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
        sizeStyles[size],
        squareOnPhone,
        variantStyles[variant],
        failed && 'sys-shake',
        className
      )}
      {...props}
    >
      {/*
        The label keeps its place while the spinner or the tick sits over
        it. Swapping the content would change the button's width mid-click,
        and a button that resizes under a finger is one that gets pressed
        twice by accident.
      */}
      <span className={clsx('inline-flex items-center gap-1.5', (working || done) && 'invisible')}>
        {children}
      </span>

      {working && <RiLoader4Line className="absolute w-4 h-4 animate-spin" aria-hidden />}
      {done && !working && <RiCheckLine className="absolute w-4 h-4" aria-hidden />}
    </button>
  );
}
