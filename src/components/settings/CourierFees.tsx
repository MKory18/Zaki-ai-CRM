'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { RiAlertLine, RiLoader4Line, RiMagicLine, RiSaveLine } from '@remixicon/react';
import { useToast } from '@/components/ui/Toast';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * ONE COURIER'S FEES — a row per region: the fee, the late threshold in
 * days, and the courier's return fee.
 *
 * THIS WAS ITS OWN SCREEN, AND THE COURIER IT PRICED WAS A DROPDOWN AT THE
 * TOP OF IT. Two screens, each opening with a link to the other, and the
 * same question asked twice: which courier? Once by the row you tapped, and
 * again by a select that did not know you had.
 *
 * So the courier arrives as a prop and there is no select. The component
 * knows nothing about where it is shown, which is why the same fourteen
 * rows can sit in the courier's panel without the panel owning them.
 *
 * Changing an EXISTING fee asks for a written reason, which goes to the
 * audit log. Live orders keep the fee they were shipped with.
 */

interface Fee {
  id: string;
  deliveryProviderId: string;
  regionId: string;
  fee: number;
  lateThresholdDays: number;
  returnFee: number;
  /** The courier's own id for this region; null until we are told it. */
  courierCityId: number | null;
  isActive: boolean;
}

interface FeesData {
  regions: { id: string; name: string }[];
  fees: Fee[];
}

export function CourierFees({
  courierId,
  /**
   * Told when a fee is written, because the list behind this panel shows
   * «٨ من ١٢ محافظة» per courier. A coverage number that stays stale while
   * the fee it counts is being edited in front of it is worse than none.
   */
  onChanged,
}: {
  courierId: string;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<FeesData | null>(null);
  const [draft, setDraft] = useState<Record<string, { fee: string; lateThresholdDays: string; returnFee: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  // Changing an existing fee needs a written reason; this holds the request
  // until the dialog collects one, instead of a browser prompt.
  const [reasonFor, setReasonFor] = useState<{ regionId: string; regionName: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ regions: { id: string; name: string }[]; fees: Fee[] }>(
        '/api/settings/delivery-fees'
      );
      setData({ regions: res.regions, fees: res.fees });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A different courier is a different set of fees: keeping the typed
  // drafts would show one courier's unsaved numbers under another's name.
  useEffect(() => {
    setDraft({});
    setSaved(null);
  }, [courierId]);

  const feeFor = (regionId: string) =>
    data?.fees.find((f) => f.deliveryProviderId === courierId && f.regionId === regionId);

  /**
   * The row's draft, and one setter for it. A card's cells are separate
   * render functions, so this lives here — one definition read by five of
   * them, rather than five copies of the same defaults.
   */
  const draftFor = (id: string) => {
    const current = feeFor(id);
    return (
      draft[id] ?? {
        fee: String(current?.fee ?? ''),
        lateThresholdDays: String(current?.lateThresholdDays ?? 3),
        returnFee: String(current?.returnFee ?? 0),
      }
    );
  };
  const setField = (id: string, patch: Partial<ReturnType<typeof draftFor>>) =>
    setDraft({ ...draft, [id]: { ...draftFor(id), ...patch } });

  /** Regions this courier has no fee row for — the ones that block orders. */
  const missing = (data?.regions ?? []).filter((r) => !feeFor(r.id));

  const save = async (regionId: string, reason?: string) => {
    const current = feeFor(regionId);
    const d = draftFor(regionId);
    const fee = Number(d.fee);
    if (!Number.isFinite(fee) || d.fee.trim() === '') {
      toast.failed('أجرة غير صالحة');
      return;
    }

    // Changing an existing fee is an override: the API demands a reason, and
    // it is collected in a real dialog rather than a browser prompt.
    if (current && current.fee !== fee && !reason) {
      const region = data?.regions.find((r) => r.id === regionId);
      setReasonFor({ regionId, regionName: region?.name ?? '' });
      return;
    }

    setBusy(regionId);
    try {
      await apiJson('/api/settings/delivery-fees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryProviderId: courierId,
          regionId,
          fee,
          lateThresholdDays: Number(d.lateThresholdDays) || 0,
          returnFee: Number(d.returnFee) || 0,
          reason,
        }),
      });
      setSaved(regionId);
      setTimeout(() => setSaved(null), 2000);
      await load();
      onChanged?.();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--sys-muted-foreground)]">
        <RiLoader4Line className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--sys-muted-foreground)]">
          الطلبات المشحونة تحتفظ بالأجرة وقت شحنها؛ التعديل هنا يسري على الشحنات الجديدة فقط.
        </p>
        {missing.length > 0 && (
          <button
            onClick={() => setBulkOpen(true)}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[var(--sys-primary)] px-3 text-xs font-medium text-[var(--sys-primary-foreground)] md:h-10"
          >
            <RiMagicLine className="h-4 w-4" /> عبّئ الفارغة ({missing.length})
          </button>
        )}
      </div>

      {/* A region with no fee row cannot be priced, so its orders stop dead
          at the shipment screen. Saying so here is the difference between a
          blank cell and a known cause. */}
      {missing.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--sys-warning)]/40 bg-[var(--sys-warning-soft)] p-3 text-sm text-[var(--sys-warning)]">
          <RiAlertLine className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>{missing.length}</b> محافظة بلا أجرة عند هذه الشركة — أي طلب إليها سيتوقف في شاشة إنشاء
            الشحنة برسالة «لا توجد أجرة توصيل لهذه المحافظة».
            {missing.length <= 6 && <span className="mt-0.5 block">{missing.map((r) => r.name).join(' · ')}</span>}
          </span>
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] p-3 text-sm text-[var(--sys-destructive)]">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
        {/* A table somebody fills in from a courier's price list. Six
            columns of inputs on a phone is one row per screen; as cards
            each governorate is a labelled little form. */}
        <Rows
          rows={data.regions}
          keyOf={(r) => r.id}
          alert={(r) => !feeFor(r.id)}
          columns={[
            {
              key: 'region',
              label: 'المحافظة',
              primary: true,
              render: (r) => <span className="text-[var(--sys-heading)]">{r.name}</span>,
            },
            {
              key: 'fee',
              label: 'الأجرة',
              render: (r) => (
                <input
                  value={draftFor(r.id).fee}
                  onChange={(e) => setField(r.id, { fee: e.target.value })}
                  aria-label={`أجرة ${r.name}`}
                  type="number"
                  min={0}
                  step="0.001"
                  dir="ltr"
                  className="h-11 w-24 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-2 text-sm md:h-10"
                />
              ),
            },
            {
              key: 'late',
              label: 'حد التأخير (أيام)',
              render: (r) => (
                <input
                  value={draftFor(r.id).lateThresholdDays}
                  onChange={(e) => setField(r.id, { lateThresholdDays: e.target.value })}
                  aria-label={`حد التأخير في ${r.name}`}
                  type="number"
                  min={0}
                  max={90}
                  dir="ltr"
                  className="h-11 w-20 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-2 text-sm md:h-10"
                />
              ),
            },
            {
              key: 'return',
              label: 'أجرة الإرجاع',
              render: (r) => (
                <input
                  value={draftFor(r.id).returnFee}
                  onChange={(e) => setField(r.id, { returnFee: e.target.value })}
                  aria-label={`أجرة إرجاع ${r.name}`}
                  type="number"
                  min={0}
                  step="0.001"
                  dir="ltr"
                  className="h-11 w-24 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-2 text-sm md:h-10"
                />
              ),
            },
            {
              key: 'courierId',
              label: 'رمزها عند الشركة',
              // Read-only: their id, not ours to invent. A blank one means
              // their API will refuse the shipment, and that is better seen
              // here than when a parcel fails to book.
              render: (r) =>
                feeFor(r.id)?.courierCityId ? (
                  <span className="text-xs text-[var(--sys-muted-foreground)]" dir="ltr">
                    {feeFor(r.id)!.courierCityId}
                  </span>
                ) : (
                  // «We do not have their id» — not «they do not serve it».
                  // Those are different claims, and only the courier can
                  // make the second one.
                  <span
                    title="لا نملك رمز هذه المحافظة لدى الشركة — بدونه لا تُنشأ الشحنة آلياً. اطلبه منهم أو ارفع قائمة مناطقهم."
                    className="inline-flex items-center gap-1 rounded-sm border border-[var(--sys-warning)] bg-[var(--sys-warning-soft)] px-2 py-0.5 text-xs text-[var(--sys-warning)]"
                  >
                    بلا رمز
                  </span>
                ),
            },
          ]}
          actions={(r) => (
            <button
              onClick={() => save(r.id)}
              disabled={busy === r.id}
              className="inline-flex items-center gap-1 text-xs text-[var(--sys-primary)] hover:underline disabled:opacity-50"
            >
              <RiSaveLine className="h-4 w-4" />
              {saved === r.id ? 'تم الحفظ' : feeFor(r.id) ? 'تحديث' : 'إضافة'}
            </button>
          )}
          empty={
            <EmptyState
              title="لا محافظات في هذا البلد"
              why="أجرةُ التوصيل تُسعَّر بالمحافظة. عرّف المحافظات من «الإعدادات ← البلدان والمتاجر» ثمّ عُد لتسعيرها."
            />
          }
        />
      </div>

      {bulkOpen && (
        <BulkFillDialog
          regions={missing}
          courier={courierId}
          onClose={() => setBulkOpen(false)}
          onSaved={async () => {
            setBulkOpen(false);
            setError(null);
            await load();
            onChanged?.();
          }}
        />
      )}

      {reasonFor && (
        <ReasonDialog
          regionName={reasonFor.regionName}
          onClose={() => setReasonFor(null)}
          onConfirm={async (reason) => {
            const id = reasonFor.regionId;
            setReasonFor(null);
            await save(id, reason);
          }}
        />
      )}
    </div>
  );
}

/**
 * Filling every empty region at once.
 *
 * Writes only the regions that have NO fee yet. An existing fee is an
 * override that needs its own reason, so a bulk pass must never quietly
 * reprice what somebody already decided.
 */
function BulkFillDialog({
  regions,
  courier,
  onClose,
  onSaved,
}: {
  regions: { id: string; name: string }[];
  courier: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [fee, setFee] = useState('');
  const [days, setDays] = useState('3');
  const [returnFee, setReturnFee] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  return (
    <Modal isOpen onClose={onClose} title={`تعبئة ${regions.length} محافظة`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          let done = 0;
          try {
            for (const region of regions) {
              await apiJson('/api/settings/delivery-fees', {
                method: 'PUT',
                body: JSON.stringify({
                  deliveryProviderId: courier,
                  regionId: region.id,
                  fee: Number(fee),
                  lateThresholdDays: Number(days) || 0,
                  returnFee: Number(returnFee) || 0,
                }),
              });
              done++;
              setProgress(done);
            }
            onSaved(`عُبِّئت ${done} محافظة`);
          } catch (err) {
            setError(
              `${err instanceof Error ? err.message : 'تعذر الحفظ'} — حُفظت ${done} من ${regions.length}`
            );
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3 text-xs text-[var(--sys-muted-foreground)]">
          تُكتب على المحافظات التي <b>لا أجرة لها</b> فقط. المحافظات المسعّرة مسبقاً لا تُلمس — تعديلها
          قرار منفصل يحتاج سبباً مكتوباً. تقدر تعدّل أي محافظة بعدها من الجدول.
        </p>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--sys-foreground)]">الأجرة</span>
          <input
            type="number" min="0" step="0.001" value={fee} onChange={(e) => setFee(e.target.value)}
            required autoFocus dir="ltr"
            className="h-11 w-full rounded-lg border border-[var(--sys-border)] px-3 text-sm md:h-10"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="mb-1 block text-xs font-medium text-[var(--sys-foreground)]">حد التأخير (أيام)</span>
            <input
              type="number" min="0" max="90" value={days} onChange={(e) => setDays(e.target.value)} dir="ltr"
              className="h-11 w-full rounded-lg border border-[var(--sys-border)] px-3 text-sm md:h-10"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-[var(--sys-foreground)]">أجرة الإرجاع</span>
            <input
              type="number" min="0" step="0.001" value={returnFee} onChange={(e) => setReturnFee(e.target.value)} dir="ltr"
              className="h-11 w-full rounded-lg border border-[var(--sys-border)] px-3 text-sm md:h-10"
            />
          </label>
        </div>

        <p className="text-xs text-[var(--sys-muted)]">{regions.map((r) => r.name).join(' · ')}</p>

        {saving && (
          <p className="text-xs tabular-nums text-[var(--sys-muted-foreground)]">
            جارٍ الحفظ… {progress} / {regions.length}
          </p>
        )}
        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-lg border border-[var(--sys-border)] px-4 text-sm md:h-10">
            إلغاء
          </button>
          <button
            type="submit" disabled={saving || !fee}
            className="h-11 rounded-lg bg-[var(--sys-primary)] px-4 text-sm font-medium text-[var(--sys-primary-foreground)] disabled:opacity-50 md:h-10"
          >
            {saving ? 'جارٍ…' : `عبّئ ${regions.length}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The written reason an existing fee change needs, for the audit log. */
function ReasonDialog({
  regionName,
  onClose,
  onConfirm,
}: {
  regionName: string;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');

  return (
    <Modal isOpen onClose={onClose} title={`تعديل أجرة ${regionName}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onConfirm(reason.trim());
        }}
        className="space-y-3"
      >
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3 text-xs text-[var(--sys-muted-foreground)]">
          تغيير أجرة قائمة يُسجَّل في سجل التدقيق باسمك وبالسبب. الشحنات القائمة تحتفظ بأجرتها.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--sys-foreground)]">السبب (إلزامي)</span>
          <textarea
            value={reason} onChange={(e) => setReason(e.target.value)}
            required minLength={3} rows={3} autoFocus
            placeholder="مثال: اتفاق جديد مع الشركة على هذه المحافظة"
            className="w-full rounded-lg border border-[var(--sys-border)] p-3 text-sm"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-lg border border-[var(--sys-border)] px-4 text-sm md:h-10">
            إلغاء
          </button>
          <button type="submit" className="h-11 rounded-lg bg-[var(--sys-primary)] px-4 text-sm font-medium text-[var(--sys-primary-foreground)] md:h-10">
            حفظ التعديل
          </button>
        </div>
      </form>
    </Modal>
  );
}
