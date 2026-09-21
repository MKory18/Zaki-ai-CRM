'use client';

import React from 'react';
import { Check, Minus, CircleDot, PackagePlus, PhoneCall, PackageCheck, Truck, Flag } from 'lucide-react';
import { arDateShort } from '@/lib/format';
import type { Stage, StageKey } from '@/lib/order-stages';

/**
 * The order's journey, as five cards.
 *
 * It replaced a wall of emoji buttons and two separate history lists that
 * between them never said the one thing anybody opens an order to learn:
 * how far it has got, when each step happened, and who did it.
 *
 * Nothing here is a control. A passed stage is a record of something that
 * happened, and a record you can edit is not a record — the actions that
 * move an order on live below, where they belong.
 */

const ICONS: Record<StageKey, React.ElementType> = {
  INTAKE: PackagePlus,
  CONFIRMATION: PhoneCall,
  WAREHOUSE: PackageCheck,
  TRANSIT: Truck,
  CLOSED: Flag,
};

export function OrderStages({ stages }: { stages: Stage[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
      <h4 className="text-xs font-black text-slate-700 mb-3">مسار الطلب</h4>

      <ol className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {stages.map((stage, i) => {
          const Icon = ICONS[stage.key];
          const done = stage.status === 'DONE';
          const current = stage.status === 'CURRENT';
          const skipped = stage.status === 'SKIPPED';

          return (
            <li
              key={stage.key}
              className={`relative rounded-xl border p-3 transition-colors ${
                current
                  ? 'border-[#b8256e] bg-[#fdf5fa]'
                  : done
                    ? 'border-[#c8f2d8] bg-[#f6fdf9]'
                    : skipped
                      ? 'border-[#e3e8ef] bg-[#f8fafc]'
                      : 'border-dashed border-[#e3e8ef] bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    current
                      ? 'bg-[#b8256e] text-white'
                      : done
                        ? 'bg-[#00a344] text-white'
                        : skipped
                          ? 'bg-[#e3e8ef] text-[#9aa4b2]'
                          : 'bg-[#f1f5f9] text-[#c3c8d4]'
                  }`}
                >
                  {done ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : current ? (
                    <CircleDot className="w-3.5 h-3.5" />
                  ) : skipped ? (
                    <Minus className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </span>

                <span className="min-w-0">
                  <span
                    className={`block text-xs font-bold truncate ${
                      current ? 'text-[#b8256e]' : done ? 'text-[#121926]' : 'text-[#9aa4b2]'
                    }`}
                  >
                    {stage.title}
                  </span>
                  <span className="block text-[10px] text-[#9aa4b2]">
                    {stage.at ? arDateShort(stage.at) : skipped ? 'لم يمر بها' : '—'}
                  </span>
                </span>

                <span className="ms-auto text-[10px] text-[#c3c8d4] tabular-nums">{i + 1}</span>
              </div>

              {(stage.who || stage.facts.length > 0) && (
                <dl className="mt-2 space-y-0.5 border-t border-[#e3e8ef] pt-2">
                  {stage.who && (
                    <div className="flex justify-between gap-2 text-[10px]">
                      <dt className="text-[#9aa4b2]">بيد</dt>
                      <dd className="text-[#364152] truncate">{stage.who}</dd>
                    </div>
                  )}
                  {stage.facts.map((f) => (
                    <div key={f.label} className="flex justify-between gap-2 text-[10px]">
                      <dt className="text-[#9aa4b2]">{f.label}</dt>
                      <dd className="text-[#364152] truncate" dir="auto">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
