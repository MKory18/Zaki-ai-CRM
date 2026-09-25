'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Play, RotateCcw, XCircle } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { ScreenTitle } from '@/components/shell/ScreenTitle';

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
  /** The schedule in words, written by the server that owns it. */
  schedule: string;
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
  /** It stopped trying. Only a person starts it again. */
  parked: boolean;
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
      <ScreenTitle />

      <p className="text-xs text-[var(--sys-muted-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-3">
        المهام تعمل في عملية مستقلة عن المتصفح:{' '}
        <code className="font-mono text-[11px] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg px-1.5 py-0.5" dir="ltr">
          npx tsx scripts/worker.ts
        </code>
        . إن لم تكن تعمل، ستظهر المهام هنا «متأخرة».
      </p>

      {overdue.length > 0 && (
        <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {overdue.length} مهمة تجاوزت موعدها — تحقّق من أن المجدول يعمل.
        </p>
      )}

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>}
      {done && <p className="text-sm text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/30 rounded-lg p-3">{done}</p>}

      {!data ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {data.jobs.map((job) => (
              <div
                key={job.name}
                className={`bg-[var(--sys-card)] border rounded-lg p-4 ${
                  job.parked
                    ? 'border-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)]'
                    : job.alerting
                      ? 'border-[var(--sys-destructive)]'
                      : job.overdue
                        ? 'border-[var(--sys-warning)]/60'
                        : 'border-[var(--sys-border)]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[240px]">
                    <div className="flex items-center gap-2">
                      {job.last?.status === 'FAILED' ? (
                        <XCircle className="w-4 h-4 text-[var(--sys-destructive)]" />
                      ) : job.overdue ? (
                        <Clock className="w-4 h-4 text-[var(--sys-warning)]" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-[var(--sys-success)]" />
                      )}
                      <span className="text-sm font-medium text-[var(--sys-heading)]" dir="ltr">{job.name}</span>
                      <span className="text-[11px] text-[var(--sys-muted)]">{job.schedule}</span>
                    </div>
                    <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">{job.description}</p>
                  </div>

                  <div className="text-xs text-[var(--sys-muted-foreground)] flex-1 min-w-[200px]">
                    <p>
                      آخر نجاح: <span className={job.overdue ? 'text-[var(--sys-destructive)] font-medium' : ''}>{ago(job.lastSuccessAt)}</span>
                    </p>
                    {job.last?.detail && <p className="text-[var(--sys-foreground)] mt-0.5">{job.last.detail}</p>}
                    {job.last?.error && <p className="text-[var(--sys-destructive)] mt-0.5">{job.last.error}</p>}
                    {job.consecutiveFailures > 0 && (
                      <p className="text-[var(--sys-destructive)] mt-0.5">
                        فشلت {job.consecutiveFailures} مرة متتالية
                        {job.alerting && ' — تحتاج تدخّلاً'}
                      </p>
                    )}
                    {/* Parked. Said as a sentence rather than a red border,
                        because the thing a person needs to know is that it
                        has STOPPED — not that it is unwell. */}
                    {job.parked && (
                      <p className="mt-1 rounded-lg bg-[var(--sys-destructive-soft)] px-2 py-1 text-[var(--sys-destructive)]">
                        توقّفت عن المحاولة بعد فشل متكرّر. لن تعمل حتى تُعيد تفعيلها — أصلح السبب
                        أولاً، فإعادة التفعيل بلا إصلاح تعيدها إلى الحائط نفسه.
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
                    className="h-8 px-3 rounded-lg border border-[var(--sys-border)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {running === job.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    شغّلها الآن
                  </button>

                  {job.parked && (
                    <button
                      disabled={running === job.name}
                      onClick={async () => {
                        setRunning(job.name);
                        setError(null);
                        setDone(null);
                        try {
                          await apiJson('/api/admin/jobs', {
                            method: 'POST',
                            body: JSON.stringify({ job: job.name, action: 'unpark' }),
                          });
                          setDone(`${job.name}: أُعيد تفعيلها`);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'تعذّر إعادة التفعيل');
                        } finally {
                          setRunning(null);
                          await load();
                        }
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] px-3 text-xs font-medium text-[var(--sys-destructive)] disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      أعد تفعيلها
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
            <h2 className="text-sm font-medium text-[var(--sys-heading)] px-4 py-3 border-b border-[var(--sys-border)]">آخر التشغيلات</h2>
            {data.recent.length === 0 ? (
              <p className="text-sm text-[var(--sys-muted-foreground)] py-8 text-center">لم تعمل أي مهمة بعد.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
                  <tr>
                    <th className="text-right font-medium px-3 py-2">المهمة</th>
                    <th className="text-right font-medium px-3 py-2">الحالة</th>
                    <th className="text-right font-medium px-3 py-2">البدء</th>
                    <th className="text-right font-medium px-3 py-2">عدد</th>
                    <th className="text-right font-medium px-3 py-2">التفصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sys-border)]">
                  {data.recent.map((run) => (
                    <tr key={run.id}>
                      <td className="px-3 py-2 text-[var(--sys-foreground)]" dir="ltr">{run.jobName}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            run.status === 'SUCCEEDED'
                              ? 'bg-[var(--sys-success-soft)] border-[var(--sys-success)]/40 text-[var(--sys-success)]'
                              : run.status === 'FAILED'
                                ? 'bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)] text-[var(--sys-destructive)]'
                                : 'bg-[var(--sys-warning-soft)] border-[var(--sys-warning)]/40 text-[var(--sys-warning)]'
                          }`}
                        >
                          {run.status === 'SUCCEEDED' ? 'نجحت' : run.status === 'FAILED' ? 'فشلت' : 'تعمل'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)] whitespace-nowrap">
                        {new Date(run.startedAt).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--sys-foreground)]">{run.processed}</td>
                      <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)]">{run.error ?? run.detail ?? '—'}</td>
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
