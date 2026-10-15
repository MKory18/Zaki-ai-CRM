'use client';

import React, { useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { RiFileCopyLine, RiLoader4Line } from '@remixicon/react';

/**
 * «انسخ رابط التقييم» — the second way a rating is asked for.
 *
 * Owner decision D8 asks for two: offered to the customer on the tracking
 * page once they have proved the phone and the reference, and handed to the
 * seller to send over WhatsApp. This is the second one.
 *
 * ── IT IS ASKED FOR, NOT SHOWN ──
 *
 * The link is a credential: whoever holds it may post one opinion in this
 * shop's name about this product. So it is not a field in the order
 * payload every role reads — it is a press, answered by
 * `/api/orders/[id]/rating-link`, which checks that the goods actually
 * arrived and that this user may read this order at all.
 *
 * ── AND IT SAYS IF IT HAS ALREADY BEEN USED ──
 *
 * The link is derived, so it is the same string whether or not it has been
 * used, and withholding it afterwards would be theatre. What matters is
 * that the seller is told BEFORE he sends it, rather than the customer
 * finding out — the door the link opens refuses the second submission
 * anyway, because the database does.
 */
export function RatingLinkButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [used, setUsed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function fetchLink() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiJson<{ path: string; alreadyRated: boolean }>(
        `/api/orders/${orderId}/rating-link`
      );
      // An ABSOLUTE url only at the moment of copying, built from the
      // browser's own origin. The server deliberately returns a path: a
      // shop may have its own domain, and a link assembled from an env var
      // is a link that is wrong the day somebody moves the deployment.
      const full = `${window.location.origin}${res.path}`;
      setLink(full);
      setUsed(res.alreadyRated);
      try {
        await navigator.clipboard.writeText(full);
        setMsg('نُسخ الرابط. ابعته للزبون بواتساب.');
      } catch {
        // Clipboard refused (an insecure context, or the browser asked and
        // was told no). The link is shown instead, selectable — a copy
        // button that silently does nothing is worse than no button.
        setMsg('انسخ الرابط من تحت.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'تعذّر جلب رابط التقييم');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] px-2.5 py-2">
      <button
        type="button"
        onClick={() => void fetchLink()}
        disabled={busy}
        className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs font-semibold text-[var(--sys-primary)] disabled:opacity-60 md:min-h-0"
      >
        {busy ? (
          <RiLoader4Line className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <RiFileCopyLine className="h-4 w-4" aria-hidden />
        )}
        انسخ رابط التقييم
      </button>
      {msg && <p className="mt-1 text-xs text-[var(--sys-muted-foreground)]">{msg}</p>}
      {used && (
        <p className="mt-1 text-xs text-[var(--sys-warning)]">
          هذا الطلب مقيَّم من قبل — الرابط ما بيقبل رأياً ثانياً.
        </p>
      )}
      {link && (
        <p dir="ltr" className="mt-1 select-all break-all font-mono text-xs text-[var(--sys-muted-foreground)]">
          {link}
        </p>
      )}
    </div>
  );
}
