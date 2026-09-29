'use client';

import React, { useState } from 'react';
import { RiChat3Line, RiCheckLine, RiLoader4Line, RiShieldCheckLine } from '@remixicon/react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { RESOLUTION_AR, RESOLUTION_MEANING, RESOLUTIONS, type Resolution } from '@/lib/settlement-difference';

/**
 * WHAT TO DO ABOUT A DIFFERENCE, WHERE THE DIFFERENCE IS.
 *
 * «عند المطابقة في فرق… حط زر أشاهد التعليقات الداخلية، وزر ترحيل على
 * اعتماد. ممكن عادي صار خصم، بس يعتمد رقم الشركة. وإذا غير معتمد أنا رح
 * أتواصل مع الشركة وخط اعتماد رقمنا. بس بضل الطلب معلّم.»
 *
 * The screen used to show the two figures and stop. The reader could see
 * that the courier's number and ours disagreed and could do nothing with
 * it — so the same parcel was argued over again at the next statement, and
 * the commonest cause was never recorded anywhere.
 *
 * ── THE NOTES BUTTON IS NOT A CONVENIENCE ──
 *
 * It is where the answer usually already is. An agent agreed a discount on
 * the phone to save the sale and wrote it in the order's internal notes;
 * finance never reads those, because a note is prose and a statement is a
 * number. One press puts the prose beside the number.
 */

interface Props {
  statementId: string;
  matchId: string;
  orderId: string | null;
  orderNumber: string | null;
  resolution: string | null;
  resolutionNote: string | null;
  onResolved: () => void;
}

interface Note {
  id: string;
  kind: string;
  body: string;
  createdAt: string;
  authorName: string | null;
}

export function DifferenceActions({
  statementId,
  matchId,
  orderId,
  orderNumber,
  resolution,
  resolutionNote,
  onResolved,
}: Props) {
  const [busy, setBusy] = useState<Resolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<Note[] | null>(null);

  const resolve = async (choice: Resolution) => {
    setBusy(choice);
    setError(null);
    try {
      await apiJson(`/api/finance/statements/${statementId}/matches/${matchId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: choice }),
      });
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الحفظ');
    } finally {
      setBusy(null);
    }
  };

  const openNotes = async () => {
    setNotesOpen(true);
    if (notes || !orderId) return;
    try {
      const d = await apiJson<{ notes: Note[] }>(`/api/orders/${orderId}/notes`);
      setNotes(d.notes);
    } catch {
      setNotes([]);
    }
  };

  /**
   * ALREADY ANSWERED — and the order is still marked.
   *
   * The chip does not replace the row or move it out of the difference
   * queue: «بس بضل الطلب معلّم». Recording what was decided is not the same
   * as deciding it never happened, and the count per person is the reason
   * it was written down at all.
   */
  if (resolution) {
    const known = (RESOLUTIONS as readonly string[]).includes(resolution);
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--sys-success)]/40 bg-[var(--sys-success-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--sys-success)]">
          <RiCheckLine className="h-4 w-4" />
          {known ? RESOLUTION_AR[resolution as Resolution] : resolution}
        </span>
        {resolutionNote && <span className="text-xs text-[var(--sys-muted-foreground)]">{resolutionNote}</span>}
        {orderId && <NotesButton onClick={() => void openNotes()} />}
        {notesOpen && <NotesModal orderNumber={orderNumber} notes={notes} onClose={() => setNotesOpen(false)} />}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {RESOLUTIONS.map((r) => (
        <button
          key={r}
          type="button"
          disabled={busy !== null}
          title={RESOLUTION_MEANING[r]}
          onClick={() => void resolve(r)}
          className={`min-h-11 md:min-h-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
            r === 'ACCEPTED_COURIER'
              ? 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:border-[var(--sys-success)] hover:text-[var(--sys-success)]'
              : 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:border-[var(--sys-warning)] hover:text-[var(--sys-warning)]'
          }`}
        >
          {busy === r ? <RiLoader4Line className="h-4 w-4 animate-spin" /> : <RiShieldCheckLine className="h-4 w-4" />}
          {RESOLUTION_AR[r]}
        </button>
      ))}
      {orderId && <NotesButton onClick={() => void openNotes()} />}
      {error && <span className="text-xs text-[var(--sys-destructive)]">{error}</span>}
      {notesOpen && <NotesModal orderNumber={orderNumber} notes={notes} onClose={() => setNotesOpen(false)} />}
    </span>
  );
}

function NotesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 md:min-h-0 inline-flex items-center gap-1 rounded-md border border-[var(--sys-border)] px-2 py-1 text-xs font-medium text-[var(--sys-muted-foreground)] transition-colors hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
    >
      <RiChat3Line className="h-4 w-4" />
      التعليقات الداخلية
    </button>
  );
}

function NotesModal({
  orderNumber,
  notes,
  onClose,
}: {
  orderNumber: string | null;
  notes: Note[] | null;
  onClose: () => void;
}) {
  // INTERNAL ONLY. A note written to the customer is not evidence about a
  // discount somebody agreed, and putting the two in one list would let a
  // reader take one for the other.
  const internal = (notes ?? []).filter((n) => n.kind === 'internal');
  return (
    <Modal isOpen onClose={onClose} title={`التعليقات الداخلية${orderNumber ? ` — ${orderNumber}` : ''}`} maxWidth="sm">
      {notes === null ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--sys-muted-foreground)]">
          <RiLoader4Line className="h-4 w-4 animate-spin" />
          يقرأ التعليقات…
        </p>
      ) : internal.length === 0 ? (
        <p className="text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
          لا تعليق داخليّ على هذا الطلب — فلا خصمَ مكتوبٌ يفسّر الفرق.
        </p>
      ) : (
        <ul className="space-y-2">
          {internal.map((n) => (
            <li key={n.id} className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-2.5">
              <p className="text-xs leading-relaxed text-[var(--sys-foreground)]">{n.body}</p>
              <p className="mt-1 text-xs text-[var(--sys-muted)]">
                {n.authorName ?? 'غير معروف'} · {String(n.createdAt).slice(0, 16).replace('T', ' ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
