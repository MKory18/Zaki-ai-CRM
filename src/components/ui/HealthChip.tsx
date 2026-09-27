'use client';

import React from 'react';
import { healthOf, type Health, type HealthTone } from '@/lib/health';

/**
 * THE VERDICT, RENDERED THE SAME WAY EVERYWHERE.
 *
 * One component for one reason: if «جيّد» is a green pill on the dashboard
 * and an amber label on the couriers screen, a reader learns to check the
 * colour rather than read the word — and then the day one screen gets it
 * backwards, nobody notices.
 *
 * The `why` is a title, not a tooltip nobody finds: it is also printed
 * beside the chip wherever there is room, because a verdict whose reason is
 * hidden is a verdict people argue with. «ضعيف» tells you nothing. «ضعيف —
 * 41% وحدّ المقبول لا يقلّ عن 50%» tells you what to change.
 */

const TONE: Record<HealthTone, string> = {
  good: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success)]/30',
  ok: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/30',
  bad: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]',
  unknown: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
};

export function HealthChip({
  health,
  withWhy = false,
  className,
}: {
  health: Health;
  /** Print the reason beside the chip, where the layout has room for it. */
  withWhy?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <span
        title={health.why}
        className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${TONE[health.tone]}`}
      >
        {health.label}
      </span>
      {withWhy && (
        <span className="text-xs text-[var(--sys-muted-foreground)]">{health.why}</span>
      )}
    </span>
  );
}