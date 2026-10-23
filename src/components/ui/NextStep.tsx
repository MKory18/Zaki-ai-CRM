'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RiArrowRightLine, RiCheckboxCircleLine } from '@remixicon/react';
import { roadPosition } from '@/lib/next-stop';
import { useMayOpen } from '@/hooks/useMayOpen';
import { EmptyState } from './EmptyState';

/**
 * «الخطوة الجاية ←» — THE BUTTON AT THE END OF A STEP, AND THE ONE A QUEUE
 * LEAVES BEHIND WHEN IT EMPTIES.
 *
 * The owner's plan, المرحلة ١: «زر «الخطوة الجاية ←» آخر كل خطوة بسلسلة الشحن
 * (التجهيز ← إنشاء شحنة ← دفعات ← متابعة ← مرتجعات) و المال (العهدة ←
 * التحصيل ← المطابقة ← الإغلاق). لما يخلص الطابور: «تمّت المهمة!» وزر للخطوة
 * الجاية، بدل جدول فاضي.»
 *
 * ── IT IS DERIVED, NOT WRITTEN NINE TIMES ──
 *
 * The stop after this one is `roadPosition`'s answer, which reads the
 * registry's own `step` numbers and the menu's own order — the same machinery
 * the strip above the screen already carries. Nothing here names a route: a
 * stop added, renumbered or moved changes every screen without one of them
 * being touched, and there is no second list of «chains» to fall out of step
 * with the first.
 *
 * ── AND IT IS A PERMISSION QUESTION, ASKED TWICE ──
 *
 * `useMayOpen` is `canAccessRoute` with the session's own `userCan` — the
 * function the sidebar and the page guard use. It decides whether to DRAW the
 * button; the door behind the next screen decides whether to OPEN it, with
 * `requirePermission` in the same registry entry. Same rule, two places,
 * which is what the product requires: never draw a button its door always
 * refuses, and never rely on the drawing to keep somebody out.
 *
 * A person who may not open the next stop sees NOTHING — not a disabled
 * button, not a greyed one. `roadPosition` already says the immediate next
 * stop or nothing (a warehouse keeper who holds stop 1 and stop 5 is not told
 * that packing leads to returns), so the honest answer here is silence, and
 * the strip above still says which stop they are on.
 *
 * Last stop of a road: no button. There is no step after the returns desk or
 * after the daily close, and inventing «العودة للوحة التحكم» would be a step
 * that is not on the road.
 */

/** What the button is called, in the plan's own words, once. */
export const NEXT_STEP_LABEL = 'الخطوة الجاية';

/**
 * The step after this screen, or `null` — as the browser computes it.
 *
 * Exported because a test (and a screen that needs to say more than a button)
 * must be able to ask without rendering: the same reason `roadPosition` takes
 * its permission check as an argument.
 */
export function useNextStepHref(): { href: string; label: string } | null {
  const pathname = usePathname();
  const mayOpen = useMayOpen();
  const at = roadPosition(pathname, (route) => mayOpen(route));
  if (!at?.next) return null;
  return { href: at.next.path, label: at.next.label };
}

/**
 * The button itself. Rendered at the end of a step's content — after the table
 * it applies to, never above it: the thing you just finished comes first, and
 * the way on is what you reach for when you are done with it.
 */
export function NextStepButton({ className }: { className?: string }) {
  const next = useNextStepHref();
  if (!next) return null;

  return (
    <div className={`mt-4 flex justify-end ${className ?? ''}`}>
      <Link
        href={next.href}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--sys-primary)] px-4 text-sm font-semibold text-[var(--sys-primary)] hover:bg-[var(--sys-primary-soft)] md:min-h-10"
      >
        {NEXT_STEP_LABEL}
        <span className="sr-only"> إلى {next.label}</span>
        <RiArrowRightLine className="icon-mirror h-4 w-4 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * «تمّت المهمة!» — WHAT A QUEUE SAYS WHEN IT IS EMPTY.
 *
 * The empty state already answers three questions (see `EmptyState`): what is
 * missing, why, and the one control that changes it. An emptied queue needs a
 * fourth that no filter-clearing button can give: «you are done, here is the
 * next step». So this is `EmptyState` with the tick, the completion sentence,
 * and the road's own next stop as the action — not a second empty-state
 * component with its own idea of what an empty screen says.
 *
 * `why` keeps the screen's own sentence about WHAT this list was, because
 * «تمّت المهمة» on its own does not tell the next person (or the same person
 * tomorrow) what has just been cleared. `next` is for the two queues that are
 * not a stop of a numbered road — the confirmation pool, whose next step is
 * the packing desk — and is only used when it is given AND the person may
 * open it.
 */
export function MissionDone({
  why,
  next,
}: {
  /** What this list was, in the screen's own words. */
  why?: string;
  /** Overrides the road's next stop, for a queue that is not a stop itself. */
  next?: { label: string; href: string };
}) {
  const onRoad = useNextStepHref();
  const mayOpen = useMayOpen();
  const target = next && mayOpen(next.href) ? next : (onRoad ?? null);

  return (
    <EmptyState
      icon={RiCheckboxCircleLine}
      title="تمّت المهمة!"
      why={why}
      action={target ? { label: `${NEXT_STEP_LABEL} ← ${target.label}`, href: target.href } : undefined}
    />
  );
}
