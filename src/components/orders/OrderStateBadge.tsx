'use client';

import React from 'react';
import type { CoreState } from '@/lib/order-state';

/**
 * The ONE order badge. It renders the DERIVED core state (order-state.ts),
 * so the list, the queue and the detail view can never disagree — the old
 * badge read the legacy `status` column, which drifts from the confirmation
 * and shipping statuses that actually move.
 */

const LABELS: Record<CoreState, { ar: string; cls: string }> = {
  NEW: { ar: 'جديد', cls: 'bg-[var(--sys-surface)] text-[var(--sys-info)] border-blue-100' },
  CLAIMED: { ar: 'قيد التأكيد', cls: 'bg-[var(--sys-surface)] text-[var(--sys-info)] border-purple-100' },
  NO_ANSWER: { ar: 'لا يرد', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/30' },
  POSTPONED: { ar: 'مؤجل', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/30' },
  CONFIRMED: { ar: 'مؤكد', cls: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success)]/30' },
  PREPARING: { ar: 'قيد التجهيز', cls: 'bg-[var(--sys-surface)] text-[var(--sys-foreground)] border-[var(--sys-border)]' },
  READY_TO_SHIP: { ar: 'جاهز للشحن', cls: 'bg-[var(--sys-surface)] text-[var(--sys-info)] border-blue-100' },
  SHIPPED: { ar: 'مشحون', cls: 'bg-[var(--sys-surface)] text-[var(--sys-info)] border-purple-100' },
  IN_TRANSFER: { ar: 'نقل بين شركات', cls: 'bg-[var(--sys-surface)] text-[var(--sys-info)] border-purple-100' },
  WAITING_RETURN: { ar: 'بانتظار الإرجاع', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/30' },
  DELIVERED: { ar: 'تم التسليم', cls: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success)]/30' },
  PARTIALLY_DELIVERED: { ar: 'تسليم جزئي', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/30' },
  RETURNED: { ar: 'مرتجع', cls: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]' },
  CANCELLED: { ar: 'ملغى', cls: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]' },
  NEEDS_REVIEW: { ar: 'بحاجة مراجعة', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/30' },
  VOIDED: { ar: 'مُبطل', cls: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]' },
};

/**
 * `beforeShipping` splits the one word "ملغى" into the two things it means.
 *
 * Cancelled before the parcel left costs nothing and the units go straight
 * back on the shelf. Cancelled after means a parcel is out there, a courier
 * will be paid, and the stock only returns through the returns door. One
 * badge for both hides the only part anybody needs.
 *
 * It is derived, never stored: the core state list stays closed.
 */
export function OrderStateBadge({
  state,
  beforeShipping,
}: {
  state: string;
  beforeShipping?: boolean;
}) {
  const cfg = LABELS[state as CoreState];
  if (state === 'CANCELLED' && beforeShipping !== undefined) {
    return (
      <span
        className={`inline-block text-caption px-2 py-0.5 rounded-md border whitespace-nowrap ${
          beforeShipping
            ? 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/30'
            : 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]'
        }`}
        title={
          beforeShipping
            ? 'أُلغي قبل أن يُشحن — لا طرد خارج المستودع والبضاعة عادت للرف'
            : 'أُلغي بعد الشحن — الطرد خارج المستودع، والبضاعة تعود عند استلام المرتجع'
        }
      >
        {beforeShipping ? 'ملغى قبل الشحن' : 'ملغى بعد الشحن'}
      </span>
    );
  }
  return (
    <span
      className={`inline-block text-caption px-2 py-0.5 rounded-md border whitespace-nowrap ${
        cfg?.cls ?? 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]'
      }`}
    >
      {cfg?.ar ?? state}
    </span>
  );
}
