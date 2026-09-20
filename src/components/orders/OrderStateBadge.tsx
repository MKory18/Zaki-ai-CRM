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
  NEW: { ar: 'جديد', cls: 'bg-blue-50 text-[#1570ef] border-blue-100' },
  CLAIMED: { ar: 'قيد التأكيد', cls: 'bg-purple-50 text-[#7a5af8] border-purple-100' },
  NO_ANSWER: { ar: 'لا يرد', cls: 'bg-amber-50 text-[#c07f2a] border-amber-100' },
  POSTPONED: { ar: 'مؤجل', cls: 'bg-amber-50 text-[#c07f2a] border-amber-100' },
  CONFIRMED: { ar: 'مؤكد', cls: 'bg-emerald-50 text-[#00a344] border-emerald-100' },
  PREPARING: { ar: 'قيد التجهيز', cls: 'bg-[#f8fafc] text-[#364152] border-[#e3e8ef]' },
  READY_TO_SHIP: { ar: 'جاهز للشحن', cls: 'bg-blue-50 text-[#1570ef] border-blue-100' },
  SHIPPED: { ar: 'مشحون', cls: 'bg-purple-50 text-[#7a5af8] border-purple-100' },
  IN_TRANSFER: { ar: 'نقل بين شركات', cls: 'bg-purple-50 text-[#7a5af8] border-purple-100' },
  WAITING_RETURN: { ar: 'بانتظار الإرجاع', cls: 'bg-amber-50 text-[#c07f2a] border-amber-100' },
  DELIVERED: { ar: 'تم التسليم', cls: 'bg-emerald-50 text-[#00a344] border-emerald-100' },
  PARTIALLY_DELIVERED: { ar: 'تسليم جزئي', cls: 'bg-amber-50 text-[#c07f2a] border-amber-100' },
  RETURNED: { ar: 'مرتجع', cls: 'bg-[#feecee] text-[#fb323f] border-[#fecdd1]' },
  CANCELLED: { ar: 'ملغى', cls: 'bg-[#feecee] text-[#fb323f] border-[#fecdd1]' },
  NEEDS_REVIEW: { ar: 'بحاجة مراجعة', cls: 'bg-amber-50 text-[#c07f2a] border-amber-100' },
  VOIDED: { ar: 'مُبطل', cls: 'bg-[#feecee] text-[#fb323f] border-[#fecdd1]' },
};

export function OrderStateBadge({ state }: { state: string }) {
  const cfg = LABELS[state as CoreState];
  return (
    <span
      className={`inline-block text-[11px] px-2 py-0.5 rounded-[6px] border whitespace-nowrap ${
        cfg?.cls ?? 'bg-[#f8fafc] text-[#697586] border-[#e3e8ef]'
      }`}
    >
      {cfg?.ar ?? state}
    </span>
  );
}
