'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Lightbulb, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /growth/intelligence — what is bleeding, and what to do about it.
 *
 * Not the chat assistant and not a dashboard. A dashboard shows what
 * happened; this names a problem, shows the number it rests on, and says
 * what to do. Every finding carries its evidence so it can be checked —
 * an insight nobody can verify is a guess with confidence.
 *
 * Silence here is a real answer: no findings means nothing crossed a
 * threshold, not that the analysis failed.
 */

interface Finding {
  key: string;
  title: string;
  evidence: string;
  action: string;
  severity: 'ALARM' | 'WATCH' | 'GOOD';
  subject?: { kind: string; id: string; name: string };
  metric?: number;
}

interface Payload {
  findings: Finding[];
  totalOrders: number;
  minSample: number;
  counts: { alarm: number; watch: number };
}

const TONE: Record<string, { border: string; chip: string; label: string }> = {
  ALARM: { border: 'border-[#fecdd1]', chip: 'bg-[#feecee] text-[#fb323f] border-[#fecdd1]', label: 'يحتاج تدخّلاً' },
  WATCH: { border: 'border-amber-200', chip: 'bg-amber-50 text-amber-700 border-amber-200', label: 'راقبه' },
  GOOD: { border: 'border-emerald-200', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'جيد' },
};

export function IntelligenceScreen() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await apiJson<Payload>('/api/growth/intelligence'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحليل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-4xl space-y-3">
      <p className="text-xs text-[#697586] bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-3">
        تحليل مبني على طلباتك الفعلية — كل رقم هنا محسوب من طلبات موجودة، لا تقديرات. وما لا تكفي
        البيانات للإجابة عليه يُقال فيه «لا تكفي البيانات» بدل رقم يبدو معقولاً.
      </p>

      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}

      {!data ? (
        <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحليل…
        </div>
      ) : data.totalOrders < data.minSample ? (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          <Lightbulb className="w-5 h-5 mx-auto mb-2 text-[#9aa4b2]" />
          لا تكفي البيانات بعد — {data.totalOrders} طلباً فقط. التحليل يحتاج {data.minSample} على الأقل
          حتى لا تكون النسب مجرد ضجيج.
        </p>
      ) : data.findings.length === 0 ? (
        <p className="text-sm text-[#00a344] bg-emerald-50 border border-emerald-100 rounded-[8px] p-6 text-center">
          <CheckCircle2 className="w-5 h-5 mx-auto mb-2" />
          لا شيء يتجاوز حدود الإنذار في {data.totalOrders} طلباً. هذا صمت مقصود، لا تحليل فاشل.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            {data.counts.alarm > 0 && (
              <span className={`px-2.5 py-1 rounded-full border ${TONE.ALARM.chip}`}>
                {data.counts.alarm} يحتاج تدخّلاً
              </span>
            )}
            {data.counts.watch > 0 && (
              <span className={`px-2.5 py-1 rounded-full border ${TONE.WATCH.chip}`}>
                {data.counts.watch} للمراقبة
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full border border-[#e3e8ef] text-[#697586]">
              من {data.totalOrders} طلباً
            </span>
          </div>

          <div className="space-y-2">
            {data.findings.map((f) => {
              const tone = TONE[f.severity];
              return (
                <div key={f.key} className={`bg-white border rounded-[8px] p-4 ${tone.border}`}>
                  <div className="flex items-start gap-2">
                    {f.severity === 'ALARM' ? (
                      <AlertTriangle className="w-4 h-4 text-[#fb323f] shrink-0 mt-0.5" />
                    ) : (
                      <Eye className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium text-[#121926]">{f.title}</h3>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${tone.chip}`}>{tone.label}</span>
                      </div>

                      {/* The number it rests on, so the claim can be checked. */}
                      <p className="text-xs text-[#697586] mt-1">{f.evidence}</p>

                      <p className="text-sm text-[#364152] mt-2 bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-2.5">
                        {f.action}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
