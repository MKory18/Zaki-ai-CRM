'use client';

import React, { useState } from 'react';
import { RiChat3Line, RiLoader4Line } from '@remixicon/react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { noteKindAr, type OrderNote } from '@/lib/order-notes';

/**
 * READ AN ORDER'S NOTES FROM WHEREVER YOU ARE STANDING.
 *
 * The contract puts notes in four places — «settlement exceptions, return
 * receiving, tracking and order detail» — and three of them had them. The
 * settlement screen grew its own button and modal; the RETURNS desk, where
 * the context matters most, had a note INPUT and no way to read what anyone
 * had already written. The clerk with the box open could not see the
 * confirmation agent's «الزبون قال إنّ القطعة مكسورة» from last week.
 *
 * So the settlement screen's pair is here instead of copied: one fetch, one
 * modal, one empty state, and the kinds a screen cares about as a prop.
 * Lazily loaded — nobody pays for notes they do not open — and a failed read
 * shows «لا تعليق» rather than an error, because a missing note must never
 * block the work in front of the person.
 */

export function OrderNotesPeek({
  orderId,
  orderNumber,
  kinds,
  emptyText,
  label = 'التعليقات الداخلية',
  showKind = false,
}: {
  orderId: string | null;
  orderNumber: string | null;
  /** Which kinds to show. Omit for all four. */
  kinds?: readonly string[];
  emptyText: string;
  label?: string;
  /** Print each note's kind — worth it only when more than one is shown. */
  showKind?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<OrderNote[] | null>(null);

  const openNotes = async () => {
    setOpen(true);
    if (notes || !orderId) return;
    try {
      const d = await apiJson<{ notes: OrderNote[] }>(`/api/orders/${orderId}/notes`);
      setNotes(d.notes);
    } catch {
      setNotes([]);
    }
  };

  const shown = kinds ? (notes ?? []).filter((n) => kinds.includes(n.kind)) : (notes ?? []);

  return (
    <>
      <button
        type="button"
        onClick={() => void openNotes()}
        className="min-h-11 md:min-h-0 inline-flex items-center gap-1 rounded-md border border-[var(--sys-border)] px-2 py-1 text-xs font-medium text-[var(--sys-muted-foreground)] transition-colors hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
      >
        <RiChat3Line className="h-4 w-4" />
        {label}
      </button>

      {open && (
        <Modal
          isOpen
          onClose={() => setOpen(false)}
          title={`${label}${orderNumber ? ` — ${orderNumber}` : ''}`}
          maxWidth="sm"
        >
          {notes === null ? (
            <p className="flex items-center gap-1.5 text-xs text-[var(--sys-muted-foreground)]">
              <RiLoader4Line className="h-4 w-4 animate-spin" />
              يقرأ التعليقات…
            </p>
          ) : shown.length === 0 ? (
            <p className="text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{emptyText}</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((n) => (
                <li key={n.id} className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-2.5">
                  <p className="text-xs leading-relaxed text-[var(--sys-foreground)]">{n.body}</p>
                  <p className="mt-1 text-xs text-[var(--sys-muted)]">
                    {showKind ? `${noteKindAr(n.kind)} · ` : ''}
                    {n.authorName ?? 'غير معروف'} · {String(n.createdAt).slice(0, 16).replace('T', ' ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}
