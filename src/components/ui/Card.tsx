import React from 'react';
import Link from 'next/link';
import { RiArrowDownLine, RiArrowUpLine, type RemixiconComponentType } from '@remixicon/react';
import { Sparkline } from './Sparkline';
import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * A CARD IS A SURFACE WITH AN EDGE, NOT A THING THAT FLOATS.
 *
 * Every card carried `shadow-raised`, so a screen with nine of them was
 * nine objects hovering over the page at the same height — which is the
 * same as none of them being raised, except heavier to look at.
 *
 * Elevation means one thing: THIS IS ABOVE THE PAGE. A dialog is. A card
 * you can press is, while the pointer is on it. A card that is simply a
 * container is not, and it gets a hairline instead — which it needs
 * anyway, since a surface with neither an edge nor a shadow is invisible
 * against the page it sits on.
 */
export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-[var(--sys-card)] rounded-lg border border-[var(--sys-border)] transition-shadow',
        // Raised only where it can be pressed. A card that lifts without
        // being pressable is a card people try to press.
        onClick && 'cursor-pointer hover:shadow-raised',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  /**
   * Rendered inside the card's own <h3>, so pass text — or inline content
   * such as a <span> carrying an icon. A heading or a block element here
   * produces invalid HTML and a hydration error at runtime, which React
   * only reports once the screen is opened.
   */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between px-6 py-4 border-b border-[var(--sys-border)]',
        className
      )}
    >
      <div>
        <h3 className="text-base font-semibold text-[var(--sys-heading)]">{title}</h3>
        {subtitle && <p className="text-xs text-[var(--sys-muted-foreground)] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={clsx('p-6', className)}>{children}</div>;
}

/**
 * A FIGURE, AND THE THREE THINGS THAT MAKE IT MEAN SOMETHING.
 *
 * The old card was a title, a number and a coloured icon. The number is the
 * least useful part on its own: «12,400» is good news after 9,000 and bad
 * news after 20,000, and nothing on the card said which — so every figure
 * was read, believed, and then checked somewhere else anyway.
 *
 *   THE FIGURE, large and tabular, so a row of four cards lines up and the
 *     eye can compare them without reading each one.
 *   THE PREVIOUS PERIOD beside it, named. Not a percentage this card
 *     invented — see below.
 *   THE SHAPE over time, in a centimetre of SVG.
 *   AND A WAY IN. Tapping the card opens the list the figure came from,
 *     because the question after every number is "which ones".
 *
 * THIS CARD DOES NOT COMPUTE A PERCENTAGE.
 *
 * It shows both figures and which way it moved. «الربح ارتفع ١٢٪» is a
 * business claim, and the divisor — what counts as the previous period —
 * belongs to whatever produced the numbers, not to a card that happens to
 * have two of them. A caller that already has the percentage passes it.
 */
export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  previous,
  series,
  goodWhen,
  href,
}: {
  title: string;
  /** Usually a <Money>. Anything that prints as one figure. */
  value: React.ReactNode;
  subtitle?: string;
  icon?: RemixiconComponentType;
  /** The same figure, last period, and what to call that period. */
  previous?: { value: React.ReactNode; label: string; direction?: 'up' | 'down' | 'flat'; change?: string };
  /** The shape over time. Fewer than two points draws nothing. */
  series?: number[];
  goodWhen?: 'rising' | 'falling' | 'neither';
  /** The list behind the number. */
  href?: string;
}) {
  const dir = previous?.direction;
  const Arrow = dir === 'up' ? RiArrowUpLine : dir === 'down' ? RiArrowDownLine : null;
  const good = goodWhen === 'falling' ? dir === 'down' : dir === 'up';

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-note font-medium text-[var(--sys-muted-foreground)]">{title}</span>
        {Icon && <Icon className="w-5 h-5 shrink-0 text-[var(--sys-muted)]" aria-hidden />}
      </div>

      <div className="mt-2 text-display font-bold leading-none tabular-nums text-[var(--sys-heading)]">{value}</div>

      {previous && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--sys-muted-foreground)]">
          {Arrow && (
            <Arrow
              className={clsx('w-4 h-4 shrink-0', good ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]')}
              aria-hidden
            />
          )}
          {previous.change && (
            <span className={clsx('font-semibold tabular-nums', good ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]')}>
              {previous.change}
            </span>
          )}
          <span>{previous.label}</span>
          <span className="tabular-nums">{previous.value}</span>
        </p>
      )}

      {series && series.length >= 2 && (
        <div className="mt-3">
          <Sparkline points={series} goodWhen={goodWhen} />
        </div>
      )}

      {subtitle && <p className="mt-2 text-xs text-[var(--sys-muted-foreground)]">{subtitle}</p>}
    </>
  );

  const shell = 'rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4';

  // Raised only when it can be pressed. A card that lifts off the page
  // without being pressable is a card people try to press.
  if (href) {
    return (
      <Link href={href} className={clsx(shell, 'block transition-shadow hover:shadow-raised')}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
