'use client';

/**
 * SALESFLOW — Order Responsibility / Claim / Editing-Lock section (Phase C)
 * Displays ownership state + claim button + lock warnings + conflict dialog.
 * All permissions enforced by Phase B APIs — this component only reflects
 * server state and never decides authorization.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useApp } from '@/context/AppContext';
import { apiFetch } from '@/lib/api-client';
import { format } from 'date-fns';
import {
  UserCheck,
  Pencil,
  Lock,
  PenLine,
  Clock,
  ShieldCheck,
  Unlock,
} from 'lucide-react';

interface OwnershipApi {
  actionLoading: 'claim' | 'lock' | 'release' | null;
  message: { type: 'error' | 'success' | 'conflict'; text: string } | null;
  setMessage: (m: { type: 'error' | 'success' | 'conflict'; text: string } | null) => void;
  inEditMode: boolean;
  claim: (orderId: string, onDone?: () => void) => Promise<boolean>;
  acquireLock: (orderId: string) => Promise<{ ok: boolean; lockExpiresAt?: string | null }>;
  releaseLock: (orderId: string) => Promise<void>;
}

interface OwnershipSectionProps {
  order: any;
  ar: boolean;
  isRtl: boolean;
  ownership: OwnershipType;
  /** Shared clock tick from the parent (OrderDetailModal). When provided, this
   *  component does NOT run its own 30s interval — avoids duplicate timers. */
  nowMs?: number;
  onRefreshOrder: () => void | Promise<void>;
}
type OwnershipType = any; // hook instance (useOrderOwnership)

type OwnershipBadge = {
  key: 'AVAILABLE' | 'ASSIGNED' | 'CLAIMED' | 'BEING_EDITED' | 'RELEASED';
  label: string;
  cls: string;
  icon: React.ElementType;
};

export function OwnershipSection({ order, ar, isRtl, ownership, nowMs: nowMsProp, onRefreshOrder }: OwnershipSectionProps) {
  const { currentUser } = useApp();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);
  // Cached clock read on a 30s interval (never during render) so lock expiry
  // comparisons stay pure and expired locks eventually clear from the UI.
  // Lazy default keeps the component backwards compatible when no nowMs prop
  // is passed; the interval only runs when the parent does not supply nowMs.
  const [fallbackNowMs, setFallbackNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (nowMsProp !== undefined) return;
    const interval = setInterval(() => setFallbackNowMs(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [nowMsProp]);
  const nowMs = nowMsProp ?? fallbackNowMs;

  if (!order) return null;

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const lockActive = !!order.lockedById && !!order.lockExpiresAt && new Date(order.lockExpiresAt).getTime() > nowMs;
  const claimed = !!order.claimedById;
  const signed = order.signatureStatus === 'SIGNED';

  // Badge state machine
  const badge: OwnershipBadge = lockActive
    ? { key: 'BEING_EDITED', cls: 'bg-amber-50 text-amber-700 border-amber-300', icon: Lock, label: ar ? 'قيد التحرير' : 'Being Edited' }
    : signed
    ? { key: 'CLAIMED', cls: 'bg-blue-50 text-blue-700 border-blue-300', icon: UserCheck, label: ar ? 'مستلم' : 'Claimed' }
    : claimed
    ? { key: 'ASSIGNED', cls: 'bg-yellow-50 text-yellow-700 border-yellow-300', icon: Clock, label: ar ? 'مسند' : 'Assigned' }
    : { key: 'AVAILABLE', cls: 'bg-green-50 text-green-700 border-green-300', icon: CheckIcon, label: ar ? 'متاح' : 'Available' };
  const BadgeIcon = badge.icon;

  const claimDisabled = claimed || ownership.actionLoading === 'claim';

  /** POST claim — Phase B atomic API (claim's onDone already refreshes) */
  const handleClaim = async () => {
    await ownership.claim(order.id, onRefreshOrder as () => void);
  };

  /** SUPER_ADMIN override (reason required — server enforces permission) */
  const handleOverride = async () => {
    setOverrideLoading(true);
    try {
      const res = await apiFetch(`/api/orders/${order.id}/claim?mode=override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: overrideReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOverrideOpen(false);
        setOverrideReason('');
        ownership.setMessage({
          type: 'success',
          text: ar ? 'تم تنفيذ التجاوز الإداري بنجاح.' : 'Administrative override applied successfully.',
        });
        await onRefreshOrder();
      } else {
        ownership.setMessage({ type: 'error', text: data.errorAr || data.error || (ar ? 'فشل الإجراء. حاول مرة أخرى.' : 'Action failed. Please try again.') });
      }
    } finally {
      setOverrideLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-red-600" />
          {ar ? 'مسؤولية الطلب' : 'Order Responsibility'}
        </h4>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 text-[11px] font-bold ${badge.cls}`}
        >
          <BadgeIcon className="w-3.5 h-3.5" />
          {badge.label}
        </span>
      </div>

      {/* Ownership grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <Field label={ar ? 'المسؤول الحالي' : 'Current Owner'} value={order.owner?.name || '—'} highlight />
        <Field label={ar ? 'مسند إليه' : 'Assigned To'} value={order.assignee?.name || '—'} />
        <Field label={ar ? 'استلمه' : 'Claimed By'} value={order.claimer?.name || '—'} />
        <Field
          label={ar ? 'وقت الاستلام' : 'Claimed At'}
          value={order.claimedAt ? format(new Date(order.claimedAt), 'd MMM — h:mm a') : '—'}
        />
        <Field
          label={ar ? 'وقّع رسمياً' : 'Signed By'}
          value={signed ? order.signer?.name || '—' : ar ? 'غير موقّع' : 'Not signed'}
        />
        <Field
          label={ar ? 'وقت التوقيع' : 'Signed At'}
          value={order.signedAt ? format(new Date(order.signedAt), 'd MMM — h:mm a') : '—'}
        />
      </div>

      {/* Editing lock warning */}
      {lockActive && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
          <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-amber-800">
              {ar ? 'يتم تعديل هذا الطلب حالياً بواسطة:' : 'This order is currently being edited by:'}{' '}
              <span className="font-black">{order.lockHolder?.name ?? '—'}</span>
            </p>
            <p className="text-amber-700 mt-0.5">
              {ar ? 'بدأ التعديل:' : 'Started:'}{' '}
              {order.lockedAt ? format(new Date(order.lockedAt), 'h:mm a') : '—'}
              {' • '}
              {ar ? 'ينتهي القفل:' : 'Lock expires:'}{' '}
              {order.lockExpiresAt ? format(new Date(order.lockExpiresAt), 'h:mm a') : '—'}
            </p>
          </div>
        </div>
      )}

      {/* My active edit session banner */}
      {lockActive && order.lockedById && !order.lockHolder && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex items-center gap-2">
          <Pencil className="w-3.5 h-3.5" />
          {ar ? 'أنت تقوم الآن بتعديل هذا الطلب.' : 'You are now editing this order.'}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!claimed && (
          <Button size="sm" onClick={handleClaim} loading={ownership.actionLoading === 'claim'} className="bg-red-600 hover:bg-red-700">
            <PenLine className="w-3.5 h-3.5" />
            {ar ? '✍️ استلام الطلب' : '✍️ Claim Order'}
          </Button>
        )}
        {claimed && !signed && (
          <span className="text-[11px] text-slate-500">{ar ? 'بانتظار التوقيع الرقمي' : 'Awaiting digital signature'}</span>
        )}
        {signed && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
            <CheckIcon className="w-3 h-3" />
            {ar ? `موقّع رقمياً بواسطة ${order.claimer?.name ?? '—'}` : `Digitally signed by ${order.claimer?.name ?? '—'}`}
          </span>
        )}

        {/* SUPER_ADMIN override — server enforces permission; hidden unless the
            current user is explicitly SUPER_ADMIN */}
        {isSuperAdmin && (
          <button
            onClick={() => setOverrideOpen(true)}
            className="ms-auto text-[11px] text-slate-400 hover:text-rose-600 transition-colors inline-flex items-center gap-1 cursor-pointer"
            title={ar ? 'تجاوز إداري (يتطلب سبباً)' : 'Administrative override (reason required)'}
          >
            <Unlock className="w-3 h-3" />
            {ar ? 'تجاوز إداري' : 'Admin Override'}
          </button>
        )}
      </div>

      {/* Claim explanation */}
      {!claimed && (
        <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
          {ar
            ? 'عند استلام الطلب سيتم تسجيل أنك المسؤول الحالي عنه.'
            : 'Claiming this order will register you as the current responsible employee.'}
        </p>
      )}

      {/* Feedback (success / error / conflict) */}
      {ownership.message && (
        <div
          className={`mt-3 rounded-xl border p-3 text-xs flex items-start justify-between gap-2 ${
            ownership.message.type === 'conflict'
              ? 'border-orange-300 bg-orange-50 text-orange-800'
              : ownership.message.type === 'success'
              ? 'border-green-300 bg-green-50 text-green-800'
              : 'border-rose-300 bg-rose-50 text-rose-800'
          }`}
        >
          <span className="leading-relaxed">{ownership.message.text}</span>
          {ownership.message.type === 'conflict' && (
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" variant="outline" onClick={async () => { ownership.setMessage(null); await onRefreshOrder(); }}>
                {ar ? 'تحديث البيانات' : 'Refresh'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => ownership.setMessage(null)}>
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          )}
          {ownership.message.type !== 'conflict' && (
            <button onClick={() => ownership.setMessage(null)} className="text-current opacity-60 hover:opacity-100 cursor-pointer">
              ✕
            </button>
          )}
        </div>
      )}

      {/* Ownership history */}
      {order.claimHistory?.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            {ar ? 'سجل الملكية' : 'Ownership History'}
          </p>
          <div className="space-y-1.5">
            {order.claimHistory.slice(0, 5).map((h: any) => (
              <div key={h.id} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600">
                  <span className="font-semibold text-slate-800">{h.user?.name}</span>
                  {' — '}
                  {ar ? ({ CLAIMED: 'استلام', RELEASED: 'تحرير', TRANSFERRED: 'نقل', OVERRIDDEN: 'تجاوز إداري', UNLOCKED: 'إلغاء قفل' } as Record<string,string>)[h.action] ?? h.action
                    : h.action.toLowerCase()}
                  {h.reason ? ` (${h.reason})` : ''}
                </span>
                <span className="text-slate-400">{format(new Date(h.createdAt), 'd MMM, h:mm a')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Override modal */}
      <Modal
        isOpen={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title={ar ? 'تجاوز إداري — استلام القوة' : 'Administrative Override'}
        maxWidth="md"
      >
        <div className="space-y-3" dir={isRtl ? 'rtl' : 'ltr'}>
          <p className="text-xs text-slate-600 leading-relaxed">
            {ar
              ? 'هذا الإجراء سيسجل تجاوزاً إدارياً في سجل التدقيق مع اسمك والسبب ووقت التنفيذ. لا يمكن التراجع عنه بصمت.'
              : 'This action will be recorded in the audit log with your name, reason, and timestamp. Silent overrides are never allowed.'}
          </p>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            rows={3}
            placeholder={ar ? 'سبب التجاوز (إلزامي)…' : 'Reason for override (required)…'}
            className="w-full px-3 py-2 text-xs border-2 border-slate-200 rounded-xl focus:border-red-500 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOverrideOpen(false)}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              size="sm"
              onClick={handleOverride}
              loading={overrideLoading}
              disabled={overrideReason.trim().length < 5}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {ar ? 'تأكيد التجاوز' : 'Confirm Override'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={highlight ? 'rounded-xl bg-red-50 border border-red-200 px-2.5 py-2' : 'rounded-xl bg-slate-50 px-2.5 py-2'}>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-xs font-bold ${highlight ? 'text-red-700' : 'text-slate-800'} truncate`}>{value}</p>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

