'use client';

import React from 'react';
import Link from 'next/link';
import { useMayOpen } from '@/hooks/useMayOpen';

/**
 * «التفاصيل» — THE DASHBOARD'S WAY INTO ITS OWN DETAIL, AND THE WAY BACK.
 *
 * The dashboard and «لوحة الأداء» read the same `/api/analytics` and drew the
 * same rates, the same profit and the same product and team tables, each with
 * its own period picker. They were two answers to «كيف حالي؟» a menu line
 * apart. The owner (24/10): the performance board becomes the DETAIL of the
 * dashboard — one line fewer in the menu for whoever has the dashboard, and
 * this link beside the period buttons for the way in.
 *
 * Nothing moved: `/growth/performance` is the same screen at the same address,
 * guarded by the same permissions. A person who can open the performance board
 * but NOT the dashboard (a bookkeeper with `reports.view`) still has it as a
 * menu line, because the menu only folds it under a dashboard they can open
 * (`RouteDef.foldedUnder`, `menuNav`).
 *
 * Both links are offered only to whoever may open the other end — a link that
 * ends in a refusal is worse than none, and the answer is the one the sidebar
 * gives (`useMayOpen`).
 */

const LINK =
  'inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--sys-border)] px-3 text-xs font-medium text-[var(--sys-foreground)] hover:bg-[var(--sys-surface)] md:h-auto md:py-1.5';

/** On the dashboard: «التفاصيل» → the performance board. (No arrow: which way is «forward» depends on the page direction, and the word says it.) */
export function DetailsLink() {
  const mayOpen = useMayOpen();
  if (!mayOpen('/growth/performance')) return null;
  return (
    <Link href="/growth/performance" className={LINK}>
      التفاصيل
    </Link>
  );
}

/** On the performance board: «لوحة التحكم» ← back to the dashboard it is the detail of. */
export function BackToDashboardLink() {
  const mayOpen = useMayOpen();
  if (!mayOpen('/dashboard')) return null;
  return (
    <Link href="/dashboard" className={LINK}>
      لوحة التحكم
    </Link>
  );
}
