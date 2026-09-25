'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Save, Wand2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { ScreenTitle } from '@/components/shell/ScreenTitle';

/**
 * /settings/delivery-fees — one row per courier per region: the fee, the
 * late threshold in days, and the courier's return fee. Changing an existing
 * fee asks for a reason, which goes to the audit log. Live orders keep the
 * fee they were shipped with.
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

export function DeliveryFeesScreen() {
  const [data, setData] = useState<{ providers: { id: string; name: string }[]; regions: { id: string; name: string }[]; fees: Fee[] } | null>(null);
  const [courier, setCourier] = useState('');
  const [draft, setDraft] = useState<Record<string, { fee: string; lateThresholdDays: string; returnFee: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  // Changing an existing fee needs a written reason; this holds the request
  // until the dialog collects one, instead of a browser prompt.
  const [reasonFor, setReasonFor] = useState<{ regionId: string; regionName: string } | null>(null);
  const [bulkDone, setBulkDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ providers: { id: string; name: string }[]; regions: { id: string; name: string }[]; fees: Fee[] }>(
        '/api/settings/delivery-fees'
      );
      setData(res);
      if (!courier && res.providers[0]) setCourier(res.providers[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [courier]);

  useEffect(() => {
    void load();
  }, [load]);

  const feeFor = (regionId: string) => data?.fees.find((f) => f.deliveryProviderId === courier && f.regionId === regionId);

  /** Regions this courier has no fee row for — the ones that block orders. */
  const missing = (data?.regions ?? []).filter((r) => !feeFor(r.id));

  const save = async (regionId: string, reason?: string) => {
    const current = feeFor(regionId);
    const d = draft[regionId] ?? {
      fee: String(current?.fee ?? ''),
      lateThresholdDays: String(current?.lateThresholdDays ?? 3),
      returnFee: String(current?.returnFee ?? 0),
    };
    const fee = Number(d.fee);
    if (!Number.isFinite(fee)) {
      setError('أجرة غير صالحة');
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
    setError(null);
    try {
      await apiJson('/api/settings/delivery-fees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryProviderId: courier,
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-3">
      <ScreenTitle />

      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">شركة الشحن</span>
          <select value={courier} onChange={(e) => setCourier(e.target.value)} className="h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm">
            {data.providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[var(--sys-muted-foreground)] pb-2">
          الطلبات المشحونة تحتفظ بالأجرة وقت شحنها؛ التعديل هنا يسري على الشحنات الجديدة فقط.
        </p>

        {missing.length > 0 && (
          <button
            onClick={() => setBulkOpen(true)}
            className="h-10 px-3 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium inline-flex items-center gap-1.5 mr-auto"
          >
            <Wand2 className="w-3.5 h-3.5" /> عبّئ الفارغة ({missing.length})
          </button>
        )}
      </div>

      {/* A region with no fee row cannot be priced, so its orders stop dead
          at the shipment screen. Saying so here is the difference between a
          blank cell and a known cause. */}
      {missing.length > 0 && (
        <p className="text-sm text-[var(--sys-warning)] bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/40 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <b>{missing.length}</b> محافظة بلا أجرة عند هذه الشركة — أي طلب إليها سيتوقف في شاشة إنشاء
            الشحنة برسالة «لا توجد أجرة توصيل لهذه المحافظة».
            {missing.length <= 6 && <span className="block mt-0.5">{missing.map((r) => r.name).join(' · ')}</span>}
          </span>
        </p>
      )}

      {data.providers.length === 0 && (
        <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-6 text-center">
          أضف شركة شحن أولاً من شاشة شركات الشحن.
        </p>
      )}
      {data.regions.length === 0 && (
        <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-6 text-center">
          لا توجد محافظات لهذا البلد. أضفها من البلدان والمتاجر والمحافظ.
        </p>
      )}

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>}

      {data.regions.length > 0 && courier && (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
              <tr>
                <th className="text-right font-medium px-4 py-2">المحافظة</th>
                <th className="text-right font-medium px-4 py-2">الأجرة</th>
                <th className="text-right font-medium px-4 py-2">حد التأخير (أيام)</th>
                <th className="text-right font-medium px-4 py-2">أجرة الإرجاع</th>
                <th className="text-right font-medium px-4 py-2">رمزها عند الشركة</th>
                <th className="text-right font-medium px-4 py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sys-border)]">
              {data.regions.map((r) => {
                const current = feeFor(r.id);
                const d = draft[r.id] ?? {
                  fee: String(current?.fee ?? ''),
                  lateThresholdDays: String(current?.lateThresholdDays ?? 3),
                  returnFee: String(current?.returnFee ?? 0),
                };
                const set = (patch: Partial<typeof d>) => setDraft({ ...draft, [r.id]: { ...d, ...patch } });
                return (
                  <tr key={r.id} className={current ? '' : 'bg-[var(--sys-surface)]/60'}>
                    <td className="px-4 py-2 text-[var(--sys-heading)]">{r.name}</td>
                    <td className="px-4 py-2">
                      <input value={d.fee} onChange={(e) => set({ fee: e.target.value })} type="number" min={0} step="0.001" dir="ltr" className="w-24 h-9 px-2 rounded-lg border border-[var(--sys-border)] text-sm" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={d.lateThresholdDays} onChange={(e) => set({ lateThresholdDays: e.target.value })} type="number" min={0} max={90} dir="ltr" className="w-20 h-9 px-2 rounded-lg border border-[var(--sys-border)] text-sm" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={d.returnFee} onChange={(e) => set({ returnFee: e.target.value })} type="number" min={0} step="0.001" dir="ltr" className="w-24 h-9 px-2 rounded-lg border border-[var(--sys-border)] text-sm" />
                    </td>
                    {/* Read-only: their id, not ours to invent. A blank one
                        means their API will refuse the shipment, and that is
                        better seen here than when a parcel fails to book. */}
                    <td className="px-4 py-2" dir="ltr">
                      {current?.courierCityId ? (
                        <span className="text-xs text-[var(--sys-muted-foreground)]">{current.courierCityId}</span>
                      ) : (
                        /* "We do not have their id" — not "they do not serve
                           it". Those are different claims, and only the
                           courier can make the second one. */
                        <span
                          dir="rtl"
                          title="لا نملك رمز هذه المحافظة لدى الشركة — بدونه لا تُنشأ الشحنة آلياً. اطلبه منهم أو ارفع قائمة مناطقهم."
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--sys-warning)] bg-[var(--sys-warning-soft)] px-2 py-0.5 text-[10px] text-[var(--sys-warning)]"
                        >
                          بلا رمز
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-left">
                      <button
                        onClick={() => save(r.id)}
                        disabled={busy === r.id}
                        className="inline-flex items-center gap-1 text-xs text-[var(--sys-primary)] hover:underline disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {saved === r.id ? 'تم الحفظ' : current ? 'تحديث' : 'إضافة'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {bulkOpen && (
        <BulkFillDialog
          regions={missing}
          onClose={() => setBulkOpen(false)}
          onSaved={async (message) => {
            setBulkOpen(false);
            setError(null);
            setBulkDone(message);
            await load();
          }}
          courier={courier}
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
        <p className="text-xs text-[var(--sys-muted-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-3">
          تُكتب على المحافظات التي <b>لا أجرة لها</b> فقط. المحافظات المسعّرة مسبقاً لا تُلمس — تعديلها
          قرار منفصل يحتاج سبباً مكتوباً. تقدر تعدّل أي محافظة بعدها من الجدول.
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الأجرة</span>
          <input
            type="number" min="0" step="0.001" value={fee} onChange={(e) => setFee(e.target.value)}
            required autoFocus dir="ltr"
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">حد التأخير (أيام)</span>
            <input
              type="number" min="0" max="90" value={days} onChange={(e) => setDays(e.target.value)} dir="ltr"
              className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
            />
          </label>
          <label>
            <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">أجرة الإرجاع</span>
            <input
              type="number" min="0" step="0.001" value={returnFee} onChange={(e) => setReturnFee(e.target.value)} dir="ltr"
              className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
            />
          </label>
        </div>

        <p className="text-[11px] text-[var(--sys-muted)]">
          {regions.map((r) => r.name).join(' · ')}
        </p>

        {saving && (
          <p className="text-xs text-[var(--sys-muted-foreground)] tabular-nums">جارٍ الحفظ… {progress} / {regions.length}</p>
        )}
        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit" disabled={saving || !fee}
            className="h-9 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
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
        <p className="text-xs text-[var(--sys-muted-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-3">
          تغيير أجرة قائمة يُسجَّل في سجل التدقيق باسمك وبالسبب. الشحنات القائمة تحتفظ بأجرتها.
        </p>
        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">السبب (إلزامي)</span>
          <textarea
            value={reason} onChange={(e) => setReason(e.target.value)}
            required minLength={3} rows={3} autoFocus
            placeholder="مثال: اتفاق جديد مع الشركة على هذه المحافظة"
            className="w-full p-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
        </label>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button type="submit" className="h-9 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium">
            حفظ التعديل
          </button>
        </div>
      </form>
    </Modal>
  );
}
