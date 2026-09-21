'use client';

import React from 'react';
import { PhoneCall, ShieldCheck, UserCog } from 'lucide-react';

/**
 * The confirmation desk, by person, for the span of days chosen above.
 *
 * Rows are grouped by job because the roles are not doing the same work: a
 * supervisor who takes six hard orders and closes five is not behind an
 * agent who took forty easy ones, and ranking them in one list invites
 * exactly that comparison.
 *
 * Every duration is working minutes, so an order held overnight or over a
 * weekend does not read as a slow call, and every typical figure is a
 * median, so one order left open does not rewrite somebody's week. A dash
 * means there was nothing to measure — never a zero, which reads as bad.
 */

export interface TeamRow {
  id: string;
  name: string;
  role: string | null;
  claimed: number;
  confirmed: number;
  rejected: number;
  noAnswer: number;
  decided: number;
  openNow: number;
  confirmationRate: number | null;
  medianConfirmMinutes: number | null;
  medianGapMinutes: number | null;
  medianFirstActionMinutes: number | null;
  attempts: number;
  attemptsPerDecision: number | null;
  daysPresent: number;
  daysLate: number;
  totalLateMinutes: number;
  avgPresentMinutes: number | null;
  daysWithoutWork: number;
  daysLateEstimated: number;
}

/** The jobs on this desk, in the order a manager reads them. */
const GROUPS: { roles: string[]; label: string; icon: React.ReactNode }[] = [
  {
    roles: ['CONFIRMATION_AGENT'],
    label: 'موظفو التأكيد',
    icon: <PhoneCall className="w-3.5 h-3.5 text-[#b8256e]" />,
  },
  {
    roles: ['CONFIRMATION_SUPERVISOR'],
    label: 'مشرفو التأكيد',
    icon: <ShieldCheck className="w-3.5 h-3.5 text-[#b8256e]" />,
  },
];

const OTHERS = {
  label: 'أدوار أخرى لامست طلبات التأكيد',
  icon: <UserCog className="w-3.5 h-3.5 text-[#9aa4b2]" />,
};

/** Minutes as something sayable: ٤٥ د، ٢ س ١٠ د، ١ ي ٣ س. */
function duration(minutes: number | null): string {
  if (minutes === null) return '—';
  // Working minutes are whole, so a call answered on the first ring lands
  // on zero. "0 د" reads as a broken column; say what actually happened.
  if (minutes === 0) return 'أقل من دقيقة';
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  // A working day is eight hours, so "ي" here means a day of work.
  if (hours < 8) return rest ? `${hours} س ${rest} د` : `${hours} س`;
  const days = Math.floor(hours / 8);
  const restHours = hours % 8;
  return restHours ? `${days} ي ${restHours} س` : `${days} ي`;
}

/**
 * Presence and lateness are wall-clock, not working minutes, so they never
 * collapse into "days". Eight hours at the desk is "8 س" — calling it
 * "1 ي" would read as a whole day off.
 */
function clock(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes === 0) return 'أقل من دقيقة';
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} س ${rest} د` : `${hours} س`;
}

function rateTone(rate: number | null): string {
  if (rate === null) return 'text-[#9aa4b2]';
  if (rate >= 70) return 'text-[#00a344]';
  if (rate >= 45) return 'text-[#c07f2a]';
  return 'text-[#fb323f]';
}

const HEADS = [
  { key: 'name', label: 'الموظف', align: 'text-start' },
  { key: 'claimed', label: 'سحب', hint: 'طلبات سحبها من المجمّع خلال المدة' },
  { key: 'confirmed', label: 'أكّد' },
  { key: 'rejected', label: 'رفض', hint: 'مرفوض أو ملغى' },
  { key: 'noAnswer', label: 'لا يرد' },
  { key: 'rate', label: 'نسبة التأكيد', hint: 'المؤكد ÷ ما وصل إلى قرار' },
  { key: 'firstAction', label: 'أول اتصال', hint: 'وسيط دقائق العمل من سحب الطلب حتى أول إجراء عليه' },
  { key: 'confirmTime', label: 'زمن التأكيد', hint: 'وسيط دقائق العمل من السحب حتى التأكيد' },
  { key: 'gap', label: 'بين طلب وطلب', hint: 'وسيط دقائق العمل بين سحب وآخر' },
  { key: 'attempts', label: 'محاولات/قرار', hint: 'اتصالات ورسائل لكل طلب وصل إلى قرار' },
  { key: 'openNow', label: 'مفتوح الآن', hint: 'ما يحمله الآن، بصرف النظر عن المدة' },
  { key: 'daysPresent', label: 'أيام حضور', hint: 'أيام ظهر فيها أثر حضور — دخول أو بصمة أو شغل' },
  { key: 'daysLate', label: 'أيام تأخير', hint: 'أيام وصل فيها بعد بداية الدوام — العطلة لا تُحسب' },
  { key: 'present', label: 'متوسط التواجد', hint: 'متوسط ساعات التواجد في اليوم الواحد' },
];

export function TeamPerformanceTable({ rows, totals }: { rows: TeamRow[] | null; totals?: TeamRow | null }) {
  if (rows === null) {
    return <p className="p-6 text-sm text-[#9aa4b2] text-center">جارٍ التحميل…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="p-6 text-sm text-[#9aa4b2] text-center">
        لا عمل تأكيد مسجَّل في هذه المدة. جرّب مدة أوسع.
      </p>
    );
  }

  const claimedRoles = new Set(GROUPS.flatMap((g) => g.roles));
  const sections = [
    ...GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.role && g.roles.includes(r.role)) })),
    { ...OTHERS, rows: rows.filter((r) => !r.role || !claimedRoles.has(r.role)) },
  ].filter((s) => s.rows.length > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586]">
          <tr>
            {HEADS.map((h) => (
              <th
                key={h.key}
                title={h.hint}
                className={`px-4 py-3 font-semibold whitespace-nowrap ${h.align ?? 'text-center'} ${
                  h.hint ? 'cursor-help' : ''
                }`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>

        {sections.map((section) => (
          <tbody key={section.label} className="divide-y divide-[#e3e8ef]">
            <tr className="bg-[#fdf5fa]/60">
              <td colSpan={HEADS.length} className="px-4 py-1.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#697586]">
                  {section.icon}
                  {section.label}
                </span>
              </td>
            </tr>
            {section.rows.map((r) => (
              <tr key={r.id} className="hover:bg-[#f8fafc] transition-colors">
                <td className="px-4 py-3 font-semibold text-[#121926] whitespace-nowrap">{r.name}</td>
                <Num value={r.claimed} />
                <Num value={r.confirmed} tone="text-[#00a344]" />
                <Num value={r.rejected} tone={r.rejected > 0 ? 'text-[#fb323f]' : undefined} />
                <Num value={r.noAnswer} />
                <td className={`px-4 py-3 text-center tabular-nums font-bold ${rateTone(r.confirmationRate)}`}>
                  {r.confirmationRate === null ? '—' : `${r.confirmationRate}%`}
                </td>
                <Text value={duration(r.medianFirstActionMinutes)} />
                <Text value={duration(r.medianConfirmMinutes)} />
                <Text value={duration(r.medianGapMinutes)} />
                <Text value={r.attemptsPerDecision === null ? '—' : String(r.attemptsPerDecision)} />
                <Num value={r.openNow} tone={r.openNow > 10 ? 'text-[#c07f2a]' : undefined} />
                <td
                  className="px-4 py-3 text-center tabular-nums font-semibold text-[#121926]"
                  title={r.daysWithoutWork > 0 ? `${r.daysWithoutWork} يوم حضور بلا أي إجراء مسجَّل` : undefined}
                >
                  {r.daysPresent === 0 ? <span className="text-[#c3c8d4]">0</span> : r.daysPresent}
                  {r.daysWithoutWork > 0 && (
                    <span className="text-[10px] text-[#c07f2a] font-normal"> ({r.daysWithoutWork} بلا شغل)</span>
                  )}
                </td>
                <td
                  className={`px-4 py-3 text-center tabular-nums font-semibold ${
                    r.daysLate > 0 ? 'text-[#fb323f]' : 'text-[#c3c8d4]'
                  }`}
                  title={
                    r.daysLate > 0
                      ? `مجموع التأخير ${clock(r.totalLateMinutes)}` +
                        (r.daysLateEstimated > 0
                          ? ` · ${r.daysLateEstimated} منها وقت الوصول فيه مُقدَّر من أول إجراء (لم يُسجَّل «استلمت»)`
                          : '')
                      : undefined
                  }
                >
                  {r.daysLate}
                  {r.daysLate > 0 && (
                    <span className="text-[10px] font-normal"> ({clock(r.totalLateMinutes)})</span>
                  )}
                  {r.daysLateEstimated > 0 && (
                    <span className="text-[10px] text-[#9aa4b2] font-normal"> ≈</span>
                  )}
                </td>
                <Text value={clock(r.avgPresentMinutes)} />
              </tr>
            ))}
          </tbody>
        ))}

        {totals && (
          <tfoot className="border-t-2 border-[#e3e8ef] bg-[#f8fafc]">
            <tr>
              <td className="px-4 py-3 font-bold text-[#121926]">الإجمالي</td>
              <Num value={totals.claimed} bold />
              <Num value={totals.confirmed} bold tone="text-[#00a344]" />
              <Num value={totals.rejected} bold />
              <td />
              <td className={`px-4 py-3 text-center tabular-nums font-black ${rateTone(totals.confirmationRate)}`}>
                {totals.confirmationRate === null ? '—' : `${totals.confirmationRate}%`}
              </td>
              <td />
              <Text value={duration(totals.medianConfirmMinutes)} bold />
              <td />
              <td />
              <td />
              <td />
              <td />
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Num({ value, tone, bold }: { value: number; tone?: string; bold?: boolean }) {
  return (
    <td
      className={`px-4 py-3 text-center tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${
        tone ?? (value === 0 ? 'text-[#c3c8d4]' : 'text-[#121926]')
      }`}
    >
      {value}
    </td>
  );
}

function Text({ value, bold }: { value: string; bold?: boolean }) {
  return (
    <td
      className={`px-4 py-3 text-center tabular-nums whitespace-nowrap ${
        bold ? 'font-bold text-[#121926]' : value === '—' ? 'text-[#c3c8d4]' : 'text-[#364152]'
      }`}
    >
      {value}
    </td>
  );
}
