'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Play, XCircle } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /admin/jobs — is anything quietly not running?
 *
 * That is the whole point of the screen. A job with nothing to do and a job
 * that stopped firing produce the same silence, so what is shown is the last
 * SUCCESS against the job's own interval: red when it has missed its window,
 * and louder still after three failures in a row.
 */

interface JobRow {
  name: string;
  description: string;
  everySeconds: number;
  last: {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    processed: number;
    detail: string | null;
    error: string | null;
  } | null;
  lastSuccessAt: string | null;
  overdue: boolean;
  consecutiveFailures: number;
  alerting: boolean;
}

interface RunRow {
  id: string;
  jobName: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  processed: number;
  detail: string | null;
  error: string | null;
}

function every(seconds: number): string {
  if (seconds >= 86_400) return `كل ${Math.round(seconds / 86_400)} يوم`;
  if (seconds >= 3600) return `كل ${Math.round(seconds / 3600)} ساعة`;
  return `كل ${Math.round(seconds / 60)} دقيقة`;
}

function ago(iso: string | null): string {
  if (!iso) return 'لم تعمل بعد';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  return `قبل ${Math.floor(hours / 24)} يوم`;
}

export function JobsScreen() {
  const [data, setData] = useState<{ jobs: JobRow[]; recent: RunRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiJson<{ jobs: JobRow[]; recent: RunRow[] }>('/api/admin/jobs'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overdue = (data?.jobs ?? []).filter((j) => j.overdue);

  return (
    <div className="max-w-5xl space-y-3">
      <p className="text-xs text-[#697586] bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-3">
        المهام تعمل في عملية مستقلة عن المتصفح:{' '}
        <code className="font-mono text-[11px] bg-white border border-[#e3e8ef] rounded px-1.5 py-0.5" dir="ltr">
          npx tsx scripts/worker.ts
        </code>
        . إن لم تكن تعمل، ستظهر المهام هنا «متأخرة».
      </p>

      {overdue.length > 0 && (
        <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {overdue.length} مهمة تجاوزت موعدها — تحقّق من أن المجدول يعمل.
        </p>
      )}

      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}
      {done && <p className="text-sm text-[#00a344] bg-emerald-50 border border-emerald-100 rounded-[8px] p-3">{done}</p>}

      {!data ? (
        <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {data.jobs.map((job) => (
              <div
                key={job.name}
                className={`bg-white border rounded-[8px] p-4 ${
                  job.alerting ? 'border-[#fb323f]' : job.overdue ? 'border-amber-300' : 'border-[#e3e8ef]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[240px]">
                    <div className="flex items-center gap-2">
                      {job.last?.status === 'FAILED' ? (
                        <XCircle className="w-4 h-4 text-[#fb323f]" />
                      ) : job.overdue ? (
                        <Clock className="w-4 h-4 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-[#00a344]" />
                      )}
                      <span className="text-sm font-medium text-[#121926]" dir="ltr">{job.name}</span>
                      <span className="text-[11px] text-[#9aa4b2]">{every(job.everySeconds)}</span>
                    </div>
                    <p className="text-xs text-[#697586] mt-1">{job.description}</p>
                  </div>

                  <div className="text-xs text-[#697586] flex-1 min-w-[200px]">
                    <p>
                      آخر نجاح: <span className={job.overdue ? 'text-[#fb323f] font-medium' : ''}>{ago(job.lastSuccessAt)}</span>
                    </p>
                    {job.last?.detail && <p className="text-[#364152] mt-0.5">{job.last.detail}</p>}
                    {job.last?.error && <p className="text-[#fb323f] mt-0.5">{job.last.error}</p>}
                    {job.consecutiveFailures > 0 && (
                      <p className="text-[#fb323f] mt-0.5">
                        فشلت {job.consecutiveFailures} مرة متتالية
                        {job.alerting && ' — تحتاج تدخّلاً'}
                      </p>
                    )}
                  </div>

                  <button
                    disabled={running === job.name}
                    onClick={async () => {
                      setRunning(job.name);
                      setError(null);
                      setDone(null);
                      try {
                        const res = await apiJson<{ processed: number; detail?: string }>('/api/admin/jobs', {
                          method: 'POST',
                          body: JSON.stringify({ job: job.name }),
                        });
                        setDone(`${job.name}: ${res.detail ?? res.processed}`);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'فشلت المهمة');
                      } finally {
                        setRunning(null);
                        await load();
                      }
                    }}
                    className="h-8 px-3 rounded-[8px] border border-[#e3e8ef] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {running === job.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    شغّلها الآن
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
            <h2 className="text-sm font-medium text-[#121926] px-4 py-3 border-b border-[#e3e8ef]">آخر التشغيلات</h2>
            {data.recent.length === 0 ? (
              <p className="text-sm text-[#697586] py-8 text-center">لم تعمل أي مهمة بعد.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#f8fafc] text-[#697586] text-xs">
                  <tr>
                    <th className="text-right font-medium px-3 py-2">المهمة</th>
                    <th className="text-right font-medium px-3 py-2">الحالة</th>
                    <th className="text-right font-medium px-3 py-2">البدء</th>
                    <th className="text-right font-medium px-3 py-2">عدد</th>
                    <th className="text-right font-medium px-3 py-2">التفصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {data.recent.map((run) => (
                    <tr key={run.id}>
                      <td className="px-3 py-2 text-[#364152]" dir="ltr">{run.jobName}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            run.status === 'SUCCEEDED'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : run.status === 'FAILED'
                                ? 'bg-[#feecee] border-[#fecdd1] text-[#fb323f]'
                                : 'bg-amber-50 border-amber-200 text-amber-700'
                          }`}
                        >
                          {run.status === 'SUCCEEDED' ? 'نجحت' : run.status === 'FAILED' ? 'فشلت' : 'تعمل'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-[#697586] whitespace-nowrap">
                        {new Date(run.startedAt).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[#364152]">{run.processed}</td>
                      <td className="px-3 py-2 text-xs text-[#697586]">{run.error ?? run.detail ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
