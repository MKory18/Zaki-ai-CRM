'use client';

import React from 'react';
import { Check, Minus } from 'lucide-react';
import { arDateShort } from '@/lib/format';
import { humanMinutes, type Stage } from '@/lib/order-stages';

/**
 * The order's journey.
 *
 * Five boxes side by side gave each about 130 pixels, so every title, date
 * and courier name arrived truncated — "الإغـ…", "Basha …", "1005192…" —
 * and said less than nothing. The steps carry only what fits in a step: a
 * mark, a name and a moment. What happened at each one is read underneath,
 * on full-width lines, where a courier name is a courier name.
 *
 * Nothing here is a control. A passed stage is a record of something that
 * happened, and a record you can edit is not a record — the actions that
 * move an order on live below.
 */

export function OrderStages({ stages }: { stages: Stage[] }) {
  const withFacts = stages.filter((s) => s.status !== 'PENDING' && (s.who || s.facts.length > 0));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
      <h4 className="text-xs font-black text-slate-700 mb-4">مسار الطلب</h4>

      {/* The steps. The connecting line sits behind them so it never pushes
          a label out of its place. */}
      <ol className="flex items-start" dir="rtl">
        {stages.map((stage, i) => {
          const done = stage.status === 'DONE';
          const current = stage.status === 'CURRENT';
          const skipped = stage.status === 'SKIPPED';
          const reached = done || current || skipped;

          return (
            <li key={stage.key} className="flex-1 min-w-0 relative">
              {/* Rail to the previous step — drawn to the right, in RTL. */}
              {i > 0 && (
                <span
                  className={`absolute top-3.5 right-1/2 left-1/2 h-0.5 -z-0 ${
                    reached ? 'bg-[#00a344]/40' : 'bg-[#e3e8ef]'
                  }`}
                  style={{ right: '50%', left: '50%', width: '100%', transform: 'translateX(50%)' }}
                  aria-hidden="true"
                />
              )}

              <div className="relative flex flex-col items-center gap-1.5">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold z-10 ${
                    current
                      ? 'bg-[#b8256e] text-white ring-4 ring-[#b8256e]/15'
                      : done
                        ? 'bg-[#00a344] text-white'
                        : skipped
                          ? 'bg-white text-[#9aa4b2] border border-[#e3e8ef]'
                          : 'bg-white text-[#c3c8d4] border border-dashed border-[#e3e8ef]'
                  }`}
                >
                  {done ? <Check className="w-3.5 h-3.5" /> : skipped ? <Minus className="w-3.5 h-3.5" /> : i + 1}
                </span>

                <span
                  className={`text-[11px] font-bold text-center leading-tight ${
                    current ? 'text-[#b8256e]' : done ? 'text-[#121926]' : 'text-[#9aa4b2]'
                  }`}
                >
                  {stage.title}
                </span>

                <span className="text-[10px] text-[#9aa4b2] text-center leading-tight">
                  {stage.at ? arDateShort(stage.at) : skipped ? 'لم يمر بها' : '—'}
                  {stage.minutes !== null && (
                    <span className={`block ${stage.ongoing ? 'text-[#c2410c]' : 'text-[#9aa4b2]'}`}>
                      {humanMinutes(stage.minutes)}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {/* What happened, on lines wide enough to hold it. */}
      {withFacts.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#e3e8ef] space-y-1.5">
          {withFacts.map((stage) => (
            <p key={stage.key} className="text-[11px] text-[#697586] flex flex-wrap gap-x-1.5">
              <span
                className={`font-bold shrink-0 ${
                  stage.status === 'CURRENT' ? 'text-[#b8256e]' : 'text-[#364152]'
                }`}
              >
                {stage.title}
              </span>
              {stage.who && <span className="text-[#364152]">· {stage.who}</span>}
              {/* How long it took, or how long it is taking. The stage an
                  order is in now is the one worth watching while it is still
                  three days and not after it became a week. */}
              {stage.minutes !== null && (
                <span className={stage.ongoing ? 'font-semibold text-[#c2410c]' : 'text-[#697586]'}>
                  · {stage.ongoing ? 'منذ ' : 'استغرقت '}{humanMinutes(stage.minutes)}
                </span>
              )}
              {stage.facts.map((f) => (
                <span key={f.label} className="min-w-0">
                  <span className="text-[#9aa4b2]">· {f.label}: </span>
                  <span className="text-[#364152]" dir="auto">{f.value}</span>
                </span>
              ))}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
