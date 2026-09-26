'use client';

import React from 'react';
import clsx from 'clsx';
import { StatusChip } from './StatusChip';
import { STATE_LABEL_AR } from '@/lib/order-state';
import type { StateTone } from '@/lib/order-state';

/**
 * A badge is a StatusChip with an older name for its colours.
 *
 * Sixteen call sites pass `variant`, so the names stay — but they no longer
 * carry their own CSS. Two of them, `info` and `purple`, rendered the same
 * grey with a different border and existed only because two screens reached
 * for a colour and got the nearest word; and `info` names a blue the palette
 * deliberately does not have, because the action colour is already blue and
 * a notice in the same family is a notice people try to press.
 *
 * So both resolve to neutral, and there are four tones in the product.
 */
const TONE: Record<string, StateTone> = {
  default: 'neutral',
  info: 'neutral',
  purple: 'neutral',
  success: 'good',
  warning: 'warn',
  danger: 'bad',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  // The one look that is not a tone: no fill at all, for a chip that must
  // sit quietly inside a row that already carries a colour.
  if (variant === 'outline') {
    return (
      <span
        className={clsx(
          'inline-flex items-center whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium',
          'border-[var(--sys-border)] bg-transparent text-[var(--sys-foreground)]',
          className
        )}
      >
        {children}
      </span>
    );
  }

  return (
    <StatusChip tone={TONE[variant]} className={className}>
      {children}
    </StatusChip>
  );
}

/**
 * THE LEGACY COLUMN, AND WHY THIS STILL EXISTS.
 *
 * Three screens — the dashboard, the customers list and the product detail
 * — show `Order.status`, the combined column the schema itself describes as
 * "kept for compatibility but never drives a screen, because it drifts from
 * confirmation/shipping status". Their endpoints select that column and
 * nothing else, so those screens cannot show the DERIVED state without the
 * endpoints returning it. That is an API change, not a colour.
 *
 * What is fixed here is the wording: every value whose name a core state
 * also has now takes that state's word, so a legacy chip and a real one can
 * no longer disagree about what «مسلَّم» is called. The five values with no
 * core equivalent keep their own, and are the only ones written here.
 */
const LEGACY_ONLY: Record<string, { ar: string; tone: StateTone }> = {
  CONTACTING: { ar: 'قيد التواصل', tone: 'neutral' },
  REJECTED: { ar: 'مرفوض', tone: 'bad' },
  READY_FOR_SHIPPING: { ar: 'جاهز للشحن', tone: 'neutral' },
  OUT_FOR_DELIVERY: { ar: 'خرج للتوصيل', tone: 'warn' },
  FAILED_DELIVERY: { ar: 'فشل التوصيل', tone: 'bad' },
};

/** Tones for the legacy names that a core state also carries. */
const SHARED_TONE: Record<string, StateTone> = {
  NEW: 'neutral',
  NO_ANSWER: 'warn',
  CONFIRMED: 'good',
  POSTPONED: 'warn',
  SHIPPED: 'neutral',
  DELIVERED: 'good',
  CANCELLED: 'bad',
  RETURNED: 'bad',
};

export function OrderStatusBadge({ status }: { status: string }) {
  const shared = STATE_LABEL_AR[status as keyof typeof STATE_LABEL_AR];
  if (shared) return <StatusChip tone={SHARED_TONE[status] ?? 'neutral'}>{shared}</StatusChip>;

  const own = LEGACY_ONLY[status];
  if (own) return <StatusChip tone={own.tone}>{own.ar}</StatusChip>;

  return <StatusChip>{status}</StatusChip>;
}
