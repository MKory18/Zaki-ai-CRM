'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import type { ScoreResult } from '@/lib/performance-score';
import { RiLoader4Line } from '@remixicon/react';

/**
 * THE SUPERVISOR'S VIEW OF THE SAME NUMBERS.
 *
 * Best first, and there is no column header here that sorts it the other
 * way. That is not squeamishness: a published ranking of the worst changes
 * what people optimise for — they stop trying to raise the number and start
 * trying not to be last — and the number stops describing anything.
 *
 * Somebody who needs to find who to help reads the bottom of this list.
 * What they cannot do is hand out a league table of failures.
 *
 * Each row opens into the same bands the person sees on their own card, so
 * a conversation about a number starts from the same screen on both sides
 * of the desk.
 */

interface Person {
  id: string;
  name: string;
  score: ScoreResult;
  rank: number;
  of: number;
}

interface BoardData {
  window: { start: string; end: string; period: 'WEEKLY' | 'MONTHLY' };
  bars: { deliveryRate: number; issuesRate: number };
  minSample: number;
  roles: { role: string; ar: string; people: Person[] }[];
}

const PERIOD_AR = { WEEKLY: 'هذا الأسبوع', MONTHLY: 'هذا الشهر' };

function Row({ person, bars }: { person: Person; bars: BoardData['bars'] }) {
  const [open, setOpen] = useState(false);
  const s = person.score;
  const unmeasured = s.total === null;

  return (
    <>
      <tr
        onClick={() => !unmeasured && setOpen(!open)}
        className={unmeasured ? '' : 'cursor-pointer hover:bg-[var(--sys-surface)]'}
      >
        <td className="px-3 py-2 tabular-nums text-[var(--sys-muted)]">{unmeasured ? '—' : person.rank}</td>
        <td className="px-3 py-2 font-medium text-[var(--sys-heading)]">{person.name}</td>
        <td className="px-3 py-2">
          {unmeasured ? (
            <span className="text-xs text-[var(--sys-muted)]">
              العيّنة {s.sample} — الحد الأدنى {s.minSample}
            </span>
          ) : (
            <span className="tabular-nums" dir="ltr">
              <span className="font-bold text-[var(--sys-primary)]">{s.total}</span>
              <span className="text-[var(--sys-muted)]"> / {s.possible}</span>
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={3} className="bg-[var(--sys-surface)] px-3 py-2">
            <ul className="space-y-1">
              {s.bands.map((b) => {
                const low =
                  b.value !== null &&
                  ((b.key === 'delivery_rate' && b.value < bars.deliveryRate) ||
                    (b.key === 'issues_rate' && b.value > bars.issuesRate));
                return (
                  <li key={b.key} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className={low ? 'text-[var(--sys-destructive)]' : 'text-[var(--sys-muted-foreground)]'}>{b.ar}</span>
                    <span className="tabular-nums text-[var(--sys-foreground)]">
                      {b.points === null ? 'لا يُقاس' : `${b.points} من ${b.weight}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

export function ScoreBoard() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiJson<BoardData>('/api/performance/team'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <p className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] p-2.5 text-xs text-[var(--sys-destructive)]">{error}</p>;
  }
  if (!data) {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--sys-muted-foreground)]">
        <RiLoader4Line className="h-4 w-4 animate-spin" /> جارٍ الحساب…
      </p>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      <p className="text-xs text-[var(--sys-muted-foreground)]">
        {PERIOD_AR[data.window.period]} · الأعلى أولاً. لا توجد قائمة معلنة للأسوأ، ولا زرّ يقلب
        الترتيب — السكور أداة قياس، ولوحةُ فشلٍ تجعل الناس تتجنّب المركز الأخير بدل أن ترفع الرقم.
      </p>

      {data.roles.map((r) => (
        <section key={r.role} className="overflow-hidden rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
          <h3 className="border-b border-[var(--sys-border)] bg-[var(--sys-surface)] px-3 py-2 text-xs font-bold text-[var(--sys-foreground)]">
            {r.ar}
          </h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--sys-muted)]">
              <tr>
                <th className="w-10 px-3 py-1.5 text-right font-medium">#</th>
                <th className="px-3 py-1.5 text-right font-medium">الموظف</th>
                <th className="px-3 py-1.5 text-right font-medium">السكور</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sys-surface-strong)]">
              {r.people.map((p) => (
                <Row key={p.id} person={p} bars={data.bars} />
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {data.roles.length === 0 && (
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-6 text-center text-sm text-[var(--sys-muted-foreground)]">
          لا موظفين في الأدوار التي يقيسها هذا السكور بهذا المتجر.
        </p>
      )}
    </div>
  );
}
