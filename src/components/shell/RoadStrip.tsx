'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RiArrowRightLine } from '@remixicon/react';
import { useMayOpen } from '@/hooks/useMayOpen';
import { roadPosition } from '@/lib/next-stop';

/**
 * «الشحن · الخطوة 2 من 5» — AND THE STOP AFTER IT, AT THE TOP.
 *
 * On the nine screens that are stops of a road, and on no others. At the
 * TOP and not under the content: the tracking list is two hundred rows
 * long, and a button beneath it is a button nobody scrolls to — which is
 * how a road that is numbered in the menu would still have been walked by
 * being taught.
 *
 * It says where you are even when there is nothing to offer, because
 * knowing «this is stop 1 of 5» is most of what a person on a long road
 * needs; the link is the other part, and it is shown only when the very
 * next stop is one this person may open. See `roadPosition` for why it is
 * never the next stop THEY can open.
 *
 * The check is `useMayOpen` — the client's `userCan` through the registry's
 * own `canAccessRoute`, the same answer the toasts and the dashboard's cards
 * ask. It decides whether to OFFER; the door behind every screen decides
 * whether to open it.
 */
export function RoadStrip() {
  const pathname = usePathname();
  // The one question «may this person open that screen?», asked the one way.
  // This was its own copy of it until the toast needed the same answer.
  const mayOpen = useMayOpen();

  const at = roadPosition(pathname, mayOpen);
  if (!at) return null;

  return (
    <nav aria-label="مسار العمل" className="mb-3 flex items-center justify-between gap-3 text-xs">
      <span className="text-[var(--sys-muted-foreground)]">
        {at.road} · الخطوة <span className="tabular-nums">{at.here.step}</span> من{' '}
        <span className="tabular-nums">{at.of}</span>
      </span>
      {at.next && (
        <Link
          href={at.next.path}
          className="inline-flex min-h-11 items-center gap-1 font-medium text-[var(--sys-primary)] hover:underline md:min-h-0"
        >
          التالي: {at.next.label}
          {/* «Forward» is drawn the way it reads in LTR and turned by
              `icon-mirror`, like every directional glyph in the product: the
              arrow that LOOKS left here is the Right one, flipped. Writing
              the Left one would turn it twice — pointing back. */}
          <RiArrowRightLine className="icon-mirror h-4 w-4 shrink-0" aria-hidden />
        </Link>
      )}
    </nav>
  );
}
