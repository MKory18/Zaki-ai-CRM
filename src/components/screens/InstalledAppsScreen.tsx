'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Blocks, Loader2, CheckCircle2, XCircle, Clock, RotateCw, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiJson } from '@/lib/api-client';
import { arDateTime } from '@/lib/format';

/**
 * /apps/installed — what is connected, and whether it is hearing us.
 *
 * The second half is the point. A webhook that fails quietly is an
 * integration that stopped quietly: the seller believes the two systems are
 * in step and the developer cannot find out they are not. This screen says
 * what was sent, whether it arrived, and what came back when it did not.
 */

interface Delivery {
  id: string;
  appCode: string;
  event: string;
  url: string;
  status: 'PENDING' | 'OK' | 'FAILED';
  attempts: number;
  responseCode: number | null;
  error: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  payload: string;
}

interface Shelf {
  builtIn: { code: string; name: string; summary: string; settingsPath: string; installed: boolean; enabled: boolean; configured: boolean }[];
  external: { id: string; code: string; name: string; webhookUrl: string | null; events: string[]; installed: boolean; enabled: boolean }[];
}

export function InstalledAppsScreen() {
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [totals, setTotals] = useState({ pending: 0, failed: 0, ok: 0 });
  const [filter, setFilter] = useState<'all' | 'FAILED' | 'PENDING'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        apiJson<Shelf>('/api/apps'),
        apiJson<{ deliveries: Delivery[]; totals: typeof totals }>(
          `/api/apps/deliveries${filter === 'all' ? '' : `?status=${filter}`}`
        ),
      ]);
      setShelf(s);
      setDeliveries(d.deliveries);
      setTotals(d.totals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  if (!shelf || !deliveries) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#697586]">
        <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const installedBuiltIn = shelf.builtIn.filter((a) => a.installed);
  const installedExternal = shelf.external.filter((a) => a.installed);
  const nothing = installedBuiltIn.length === 0 && installedExternal.length === 0;

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[#121926]">
          <Blocks className="h-6 w-6 text-[#b8256e]" />
          التطبيقات المثبتة
        </h1>
        <p className="mt-1 text-xs text-[#697586]">ما هو موصول بشركتك الآن، وسجلّ ما أُرسل إليه.</p>
      </div>

      {error && <p className="rounded-[8px] border border-[#fecdd1] bg-[#feecee] p-3 text-sm text-[#be123c]">{error}</p>}

      {nothing ? (
        <p className="rounded-xl border border-[#e3e8ef] bg-white p-8 text-center text-sm text-[#697586]">
          لا تطبيقات مثبتة.{' '}
          <Link href="/apps/store" className="font-bold text-[#b8256e] hover:underline">افتح متجر التطبيقات</Link>
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {installedBuiltIn.map((a) => (
            <div key={a.code} className="rounded-xl border border-[#e3e8ef] bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#121926]">{a.name}</p>
                  <p className="text-[11px] text-[#697586]">{a.summary}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  a.enabled ? 'bg-[#e6f9ee] text-[#00a651]' : 'bg-[#f1f5f9] text-[#697586]'
                }`}>
                  {a.enabled ? 'مفعَّل' : 'موقوف'}
                </span>
              </div>
              <p className={`mt-2 flex items-center gap-1.5 text-[11px] ${a.configured ? 'text-[#15803d]' : 'text-[#c2410c]'}`}>
                {a.configured ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {a.configured ? 'مهيَّأ' : 'غير مهيَّأ'}
              </p>
              <Link href={a.settingsPath} className="mt-2 inline-block text-[11px] font-bold text-[#b8256e] hover:underline">
                الإعدادات ←
              </Link>
            </div>
          ))}

          {installedExternal.map((a) => (
            <div key={a.id} className="rounded-xl border border-[#e3e8ef] bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#121926]">{a.name}</p>
                  {a.webhookUrl && (
                    <p className="truncate font-mono text-[10.5px] text-[#697586]" dir="ltr">{a.webhookUrl}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  a.enabled ? 'bg-[#e6f9ee] text-[#00a651]' : 'bg-[#f1f5f9] text-[#697586]'
                }`}>
                  {a.enabled ? 'مفعَّل' : 'موقوف'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {a.events.map((e) => (
                  <span key={e} className="rounded-full bg-[#f1f5f9] px-2 py-0.5 font-mono text-[10px] text-[#475467]" dir="ltr">{e}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#697586]">سجل الإرسال</h2>
          <div className="flex items-center gap-1.5">
            {([
              ['all', `الكل`],
              ['FAILED', `فشل ${totals.failed}`],
              ['PENDING', `بالانتظار ${totals.pending}`],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                  filter === k ? 'border-[#b8256e] bg-[#fdf2f7] text-[#b8256e]' : 'border-[#e3e8ef] text-[#697586]'
                }`}
              >
                {label}
              </button>
            ))}
            <Button size="sm" variant="outline" onClick={load}>
              <RotateCw className="h-3.5 w-3.5" /> تحديث
            </Button>
          </div>
        </div>

        {deliveries.length === 0 ? (
          <p className="rounded-xl border border-[#e3e8ef] bg-white p-6 text-center text-xs text-[#697586]">
            لا إرساليات بعد — تظهر هنا عند أول حدث بعد تثبيت تطبيق يستمع إليه.
          </p>
        ) : (
          <ul className="divide-y divide-[#e3e8ef] rounded-xl border border-[#e3e8ef] bg-white">
            {deliveries.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => setOpen(open === d.id ? null : d.id)}
                  className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-3 text-start hover:bg-[#f8fafc]"
                >
                  {d.status === 'OK' && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00a651]" />}
                  {d.status === 'FAILED' && <XCircle className="h-4 w-4 shrink-0 text-[#fb323f]" />}
                  {d.status === 'PENDING' && <Clock className="h-4 w-4 shrink-0 text-[#c2410c]" />}

                  <span className="font-mono text-[11px] font-bold text-[#121926]" dir="ltr">{d.event}</span>
                  <span className="text-[11px] text-[#697586]">{d.appCode}</span>
                  <span className="text-[11px] text-[#9aa4b2]">{arDateTime(d.createdAt)}</span>

                  {d.attempts > 1 && (
                    <span className="text-[11px] text-[#c2410c]">{d.attempts} محاولات</span>
                  )}
                  {d.responseCode !== null && (
                    <span className="font-mono text-[11px] text-[#697586]" dir="ltr">HTTP {d.responseCode}</span>
                  )}
                  {d.status === 'PENDING' && d.nextAttemptAt && (
                    <span className="text-[11px] text-[#9aa4b2]">المحاولة القادمة {arDateTime(d.nextAttemptAt)}</span>
                  )}
                  {d.error && <span className="ms-auto truncate text-[11px] text-[#fb323f]">{d.error}</span>}
                </button>

                {open === d.id && (
                  <div className="border-t border-[#e3e8ef] bg-[#f8fafc] p-3">
                    <p className="mb-1 text-[10px] font-semibold text-[#697586]" dir="ltr">{d.url}</p>
                    <pre className="overflow-x-auto rounded-lg bg-[#121926] p-3 font-mono text-[10.5px] leading-relaxed text-[#c9d1d9]" dir="ltr">
                      {prettyJson(d.payload)}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Readable when it is JSON, verbatim when it is not — never a crash. */
function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
