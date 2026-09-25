'use client';

import React, { useEffect, useState } from 'react';
import { UserCheck, UserMinus, ArrowLeftRight, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { arDateShort } from '@/lib/format';

/**
 * Whose hands the order is in.
 *
 * This box used to list six fields — current owner, assigned to, claimed by,
 * claimed at, formally signed, signed at — of which five read "—" on almost
 * every order, and it offered nothing to do about any of them. The one fact
 * anybody opens it for is who is holding the order right now, and the two
 * things they want are to take it back or to hand it to a colleague.
 *
 * The colleague list comes from the server and holds only people of the same
 * role, because that is exactly what the transfer endpoint will accept: a
 * name can never appear here and then be refused on save.
 */

interface Props {
  order: {
    id: string;
    claimedById: string | null;
    claimedAt: string | null;
    claimer?: { id: string; name: string } | null;
    owner?: { id: string; name: string } | null;
  };
  currentUserId?: string;
  onChanged: () => void;
}

interface Candidate { id: string; name: string; email?: string }

export function OrderResponsibility({ order, currentUserId, onChanged }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [mayTransfer, setMayTransfer] = useState(false);
  const [open, setOpen] = useState<'transfer' | 'release' | null>(null);
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holder = order.claimer ?? order.owner ?? null;
  const heldByMe = holder?.id === currentUserId;

  useEffect(() => {
    setOpen(null);
    setError(null);
    apiJson<{ mayTransfer: boolean; candidates: Candidate[] }>(`/api/orders/${order.id}/transfer`)
      .then((d) => {
        setMayTransfer(d.mayTransfer);
        setCandidates(d.candidates ?? []);
      })
      .catch(() => {
        setMayTransfer(false);
        setCandidates([]);
      });
  }, [order.id, order.claimedById]);

  async function run(action: 'transfer' | 'release') {
    if (!reason.trim() || reason.trim().length < 3) {
      setError('اكتب السبب — يُسجَّل في سجل الطلب.');
      return;
    }
    if (action === 'transfer' && !targetId) {
      setError('اختر الزميل الذي سيستلم الطلب.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (action === 'transfer') {
        await apiJson(`/api/orders/${order.id}/transfer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: targetId, reason: reason.trim() }),
        });
      } else {
        await apiJson(`/api/orders/${order.id}/claim?reason=${encodeURIComponent(reason.trim())}`, {
          method: 'DELETE',
        });
      }
      setOpen(null);
      setReason('');
      setTargetId('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تنفيذ الإجراء');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full h-9 px-3 rounded-lg border border-[var(--sys-border)] text-sm focus:outline-none focus:border-[var(--sys-primary)]';

  return (
    <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 shadow-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <UserCheck className="w-4 h-4 text-[var(--sys-primary)] shrink-0" />
          {holder ? (
            <p className="text-sm text-[var(--sys-heading)]">
              <span className="text-[var(--sys-muted-foreground)] text-xs">بين يدي </span>
              <span className="font-bold">{holder.name}</span>
              {heldByMe && <span className="text-xs text-[var(--sys-success)]"> (أنت)</span>}
              {order.claimedAt && (
                <span className="text-[11px] text-[var(--sys-muted)]"> · منذ {arDateShort(order.claimedAt)}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-[var(--sys-muted-foreground)]">
              لم يستلمه أحد بعد — <span className="text-[var(--sys-foreground)]">متاح في الطابور</span>
            </p>
          )}
        </div>

        {holder && mayTransfer && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setOpen(open === 'release' ? null : 'release'); setError(null); }}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-destructive)] inline-flex items-center gap-1.5"
            >
              <UserMinus className="w-3.5 h-3.5" />
              سحبه منه
            </button>
            <button
              onClick={() => { setOpen(open === 'transfer' ? null : 'transfer'); setError(null); }}
              disabled={candidates.length === 0}
              title={candidates.length === 0 ? 'لا يوجد زميل بنفس الرتبة' : undefined}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              تحويل لزميل
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3 space-y-2">
          {open === 'transfer' && (
            <label className="block">
              <span className="block text-xs font-medium text-[var(--sys-muted-foreground)] mb-1">
                يُحوَّل إلى (زملاء بنفس الرتبة فقط)
              </span>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={inputClass}>
                <option value="">— اختر الزميل —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="block text-xs font-medium text-[var(--sys-muted-foreground)] mb-1">
              السبب {open === 'release' ? '(لماذا يُسحب منه)' : ''}
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
              placeholder={open === 'release' ? 'انتهى دوامه، لم يتابعه…' : 'إجازة، توزيع الحمل…'}
              className={inputClass}
            />
          </label>

          {error && <p className="text-[11px] text-[var(--sys-destructive)]">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => run(open)}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              {open === 'release' ? 'أعِده للطابور' : 'حوّل الطلب'}
            </button>
            <button
              onClick={() => { setOpen(null); setError(null); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)]"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
