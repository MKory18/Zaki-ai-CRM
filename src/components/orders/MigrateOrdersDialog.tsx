'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { apiFetch, apiJson } from '@/lib/api-client';
import { RiAlertLine, RiCheckLine, RiLoader4Line, RiUploadCloud2Line } from '@remixicon/react';
import { MATCHING_AR, MATCHING_MODES, type MatchingMode } from '@/lib/order-migration';

/**
 * «ترحيل طلبات قديمة» — ملفات طلبات انشحنت فعلاً خارج النظام، تُكتب كما هي (المبلغ، التاريخ، رقم الطلب، شركة الشحن)
 * مؤكّدة ومشحونة. معاينة أولاً بلا كتابة، ثم الترحيل ملفاً ملفاً. الشاشة لا تعرض اسماً ولا هاتفاً: ملف وسطر وسبب.
 * الباب نفسه (`/api/orders/import/migrate`) للمالك وحده؛ هذه الشاشة تظهر له وحده أيضاً.
 */

interface Picked {
  file: File;
  date: string;
}

interface Report {
  applied: boolean;
  matching: MatchingMode;
  summary: {
    total: number;
    counts: { NEW: number; DUPLICATE_IN_FILE: number; IN_SYSTEM: number; REFUSED: number };
    units: Record<string, number>;
    byCourier: Record<string, number>;
  };
  notNew: { file: string; line: number; verdict: string; reasons: string[] }[];
  written?: number;
  shortages?: number;
  failed?: { file: string; line: number; why: string }[];
}

const VERDICT_AR: Record<string, string> = {
  DUPLICATE_IN_FILE: 'مكرّر بالملف',
  IN_SYSTEM: 'موجود بالنظام',
  REFUSED: 'مرفوض',
};

/** «طلبات سوريا 24-10.xlsx» → this year's 24 October; a name with no day leaves the date for the person to pick. */
export function dateFromName(name: string, year = new Date().getFullYear()): string {
  const m = name.match(/(\d{1,2})-(\d{1,2})/);
  if (!m) return '';
  const [d, mo] = [Number(m[1]), Number(m[2])];
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return '';
  return `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formOf(files: Picked[], matching: MatchingMode, courier: string, apply: boolean) {
  const body = new FormData();
  for (const p of files) {
    body.append('files', p.file);
    body.append('dates', p.date);
  }
  body.append('matching', matching);
  if (courier) body.append('defaultCourierId', courier);
  body.append('apply', apply ? '1' : '0');
  return body;
}

async function send(body: FormData): Promise<Report> {
  const res = await apiFetch('/api/orders/import/migrate', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'تعذّر الطلب');
  return data as Report;
}

export function MigrateOrdersDialog({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [matching, setMatching] = useState<MatchingMode>('ref_and_phone');
  const [courier, setCourier] = useState('');
  const [couriers, setCouriers] = useState<{ id: string; name: string }[]>([]);
  const [preview, setPreview] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ written: number; shortages: number; failed: { file: string; line: number; why: string }[] } | null>(null);

  useEffect(() => {
    void apiJson<{ providers?: { id: string; name: string }[]; deliveryProviders?: { id: string; name: string }[] }>('/api/delivery-providers')
      .then((d) => setCouriers(d.providers ?? d.deliveryProviders ?? []))
      .catch(() => undefined);
  }, []);

  const ready = picked.length > 0 && picked.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date));
  const changed = () => {
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const look = async () => {
    setBusy(true);
    changed();
    try {
      setPreview(await send(formOf(picked, matching, courier, false)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّرت المعاينة');
    } finally {
      setBusy(false);
    }
  };

  /** One file per request, in order: a later file's repeat of an earlier one is then «موجود بالنظام», never written twice. */
  const run = async () => {
    setBusy(true);
    setError(null);
    let written = 0;
    let shortages = 0;
    const failed: { file: string; line: number; why: string }[] = [];
    try {
      for (const [i, p] of picked.entries()) {
        setProgress({ done: i, total: picked.length });
        const r = await send(formOf([p], matching, courier, true));
        written += r.written ?? 0;
        shortages += r.shortages ?? 0;
        failed.push(...(r.failed ?? []));
      }
      setProgress({ done: picked.length, total: picked.length });
      setResult({ written, shortages, failed });
      setPreview(null);
      if (!failed.length) onDone(written);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الترحيل');
      setResult({ written, shortages, failed });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const c = preview?.summary.counts;

  return (
    <Modal isOpen onClose={onClose} title="ترحيل طلبات قديمة (مشحونة)">
      <div className="space-y-3 text-sm">
        <p className="text-[var(--sys-foreground)]">
          ملفات طلبات انشحنت فعلاً: تُكتب كما هي — المبلغ، التاريخ، رقم الطلب، وشركة الشحن — مؤكّدة ومشحونة، وتحجز وحداتها من
          المخزون مرة واحدة. معاينة أولاً بلا كتابة.
        </p>

        <label className="block">
          <span className="block text-xs font-medium mb-1">الملفات (xlsx)</span>
          <input
            type="file"
            multiple
            accept=".xlsx"
            aria-label="ملفات الطلبات"
            onChange={(e) => {
              changed();
              setPicked([...(e.target.files ?? [])].map((file) => ({ file, date: dateFromName(file.name) })));
            }}
          />
        </label>

        {picked.length > 0 && (
          <ul className="space-y-1.5">
            {picked.map((p, i) => (
              <li key={p.file.name + i} className="flex flex-wrap items-center gap-2">
                <span className="text-xs">{p.file.name}</span>
                <input
                  type="date"
                  aria-label={`تاريخ شحن ${p.file.name}`}
                  value={p.date}
                  onChange={(e) => {
                    changed();
                    setPicked((all) => all.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)));
                  }}
                  className="rounded-lg border border-[var(--sys-border-input)] px-2 py-1 text-xs"
                />
              </li>
            ))}
          </ul>
        )}

        <label className="block">
          <span className="block text-xs font-medium mb-1">آلية المطابقة — متى يُعتبر الصف طلباً موجوداً فيُتخطّى</span>
          <select
            aria-label="آلية المطابقة"
            value={matching}
            onChange={(e) => {
              changed();
              setMatching(e.target.value as MatchingMode);
            }}
            className="w-full rounded-lg border border-[var(--sys-border-input)] px-2 py-1.5 text-sm"
          >
            {MATCHING_MODES.map((m) => (
              <option key={m} value={m}>
                {MATCHING_AR[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium mb-1">صف بلا شركة شحن يُسجَّل على</span>
          <select
            aria-label="شركة الشحن الافتراضية"
            value={courier}
            onChange={(e) => {
              changed();
              setCourier(e.target.value);
            }}
            className="w-full rounded-lg border border-[var(--sys-border-input)] px-2 py-1.5 text-sm"
          >
            <option value="">الباشا (افتراضي)</option>
            {couriers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p className="flex items-start gap-1.5 text-[var(--sys-destructive)]">
            <RiAlertLine className="w-4 h-4 shrink-0" aria-hidden /> {error}
          </p>
        )}

        {preview && c && (
          <div className="space-y-2 rounded-lg border border-[var(--sys-border)] p-3" data-testid="migration-preview">
            <p className="font-medium">
              من {preview.summary.total} صف: جديد {c.NEW} · مكرّر بالملف {c.DUPLICATE_IN_FILE} · موجود بالنظام {c.IN_SYSTEM} · مرفوض {c.REFUSED}
            </p>
            <p className="text-xs">
              الوحدات اللي رح تنحجز:{' '}
              {Object.entries(preview.summary.units).map(([name, n]) => `${name} ${n}`).join(' · ') || '—'}
            </p>
            <p className="text-xs">
              حسب شركة الشحن: {Object.entries(preview.summary.byCourier).map(([name, n]) => `${name} ${n}`).join(' · ') || '—'}
            </p>
            {preview.notNew.length > 0 && (
              <ul className="max-h-48 overflow-y-auto text-xs space-y-0.5">
                {preview.notNew.map((r) => (
                  <li key={`${r.file}-${r.line}`}>
                    «{r.file}» سطر {r.line} — {VERDICT_AR[r.verdict] ?? r.verdict}: {r.reasons.join('، ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-[var(--sys-border)] p-3 space-y-1" data-testid="migration-result">
            <p className="flex items-center gap-1.5 font-medium">
              <RiCheckLine className="w-4 h-4" aria-hidden /> رُحّل {result.written} طلب
              {result.shortages > 0 ? ` · ${result.shortages} بلا مخزون كافٍ للحجز` : ''}
            </p>
            {result.failed.length > 0 && (
              <ul className="text-xs space-y-0.5">
                {result.failed.map((f) => (
                  <li key={`${f.file}-${f.line}`}>«{f.file}» سطر {f.line} — {f.why}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {progress && (
          <p className="flex items-center gap-1.5 text-xs">
            <RiLoader4Line className="w-4 h-4 animate-spin" aria-hidden /> ملف {Math.min(progress.done + 1, progress.total)} من {progress.total}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--sys-border)] px-4 py-1.5 text-sm">
            إغلاق
          </button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => void look()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--sys-border)] px-4 py-1.5 text-sm disabled:opacity-50"
          >
            <RiUploadCloud2Line className="w-4 h-4" aria-hidden /> معاينة
          </button>
          <button
            type="button"
            disabled={!preview || !c || c.NEW === 0 || busy}
            onClick={() => void run()}
            className="rounded-lg bg-[var(--sys-primary)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            ترحيل {c?.NEW ?? 0} طلب
          </button>
        </div>
      </div>
    </Modal>
  );
}
