'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Hourglass, PhoneCall } from 'lucide-react';

/**
 * A NUMBER IN THE HEADER, FOR THE TWO PEOPLE WHO NEED ONE.
 *
 * The confirmation agent sees how many orders wait in the pool she pulls
 * from; it links to where she pulls. The moderator sees how many of the
 * orders HE brought in are still not confirmed — and that is all he sees.
 * No link: the pool is not his to open, and a counter that led to a list
 * would be the list by another door.
 *
 * The server decides which number a person gets, or none. Same place on
 * every screen, beside the bell, polled at the bell's pace and paused while
 * the tab is hidden.
 */

const POLL_MS = 60_000;

type Counter = { kind: 'POOL' | 'MINE' | null; count: number };

export function ConfirmationCounter() {
  const [counter, setCounter] = useState<Counter | null>(null);

  const load = useCallback(async () => {
    try {
      // Plain fetch, on purpose. apiJson answers a missing store by sending
      // the whole tab to the store picker — right for a click, wrong for a
      // poll that fires on its own every minute and would throw away
      // whatever the person was typing.
      const res = await fetch('/api/confirmation/counter', { credentials: 'same-origin' });
      if (res.ok) setCounter((await res.json()) as Counter);
    } catch {
      // A failed poll is not worth a message; the next one will do.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  if (!counter?.kind) return null;

  const busy = counter.count > 0;
  const chip = `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-semibold tabular-nums ${
    busy ? 'border-[var(--sys-primary-soft)] bg-[var(--sys-primary-soft)] text-[var(--sys-primary)]' : 'border-[var(--sys-border)] bg-[var(--sys-card)] text-[var(--sys-muted-foreground)]'
  }`;

  if (counter.kind === 'POOL') {
    return (
      <Link href="/confirmation/queue" className={`${chip} hover:border-[var(--sys-primary)]`} title="طلبات تنتظر السحب">
        <PhoneCall className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">بانتظار السحب</span>
        {counter.count}
      </Link>
    );
  }

  return (
    <span className={chip} title="طلباتك التي لم تُؤكَّد بعد">
      <Hourglass className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">طلباتك بانتظار التأكيد</span>
      {counter.count}
    </span>
  );
}
