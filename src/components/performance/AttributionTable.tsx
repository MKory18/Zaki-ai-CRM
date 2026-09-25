'use client';

import React from 'react';

/**
 * Who brought the business, and what became of it.
 *
 * The same table for moderators and for channels, because the question is
 * the same and two tables would drift apart. It reads left to right as the
 * funnel actually runs — brought, confirmed, delivered, collected — so the
 * eye lands last on the only number the business keeps.
 *
 * Bringing a hundred orders is not an achievement on its own, which is why
 * "ما يساويه الطلب" sits at the end: it is the column that tells a big
 * noisy source from a good one.
 */

export interface AttributionRow {
  id: string;
  name: string;
  kind: string | null;
  brought: number;
  confirmed: number;
  rejected: number;
  decided: number;
  delivered: number;
  returned: number;
  confirmationRate: number | null;
  deliveryRate: number | null;
  revenue: number;
  revenuePerOrder: number | null;
}

const KIND_AR: Record<string, string> = {
  LANDING_PAGE: 'صفحة هبوط',
  FACEBOOK: 'فيسبوك',
  INSTAGRAM: 'إنستغرام',
  TIKTOK: 'تيك توك',
  WHATSAPP: 'واتساب',
  TELEGRAM: 'تيليغرام',
  PHONE: 'هاتف',
  SHEET: 'ملف',
  WEBSITE: 'موقع',
  OTHER: 'أخرى',
  MODERATOR: 'مودريتر',
  MANAGER: 'مدير مبيعات',
  COMPANY_ADMIN: 'مدير الشركة',
  SUPER_ADMIN: 'المالك',
};

function rateTone(rate: number | null): string {
  if (rate === null) return 'text-[#c3c8d4]';
  if (rate >= 70) return 'text-[#00a344]';
  if (rate >= 45) return 'text-[#c07f2a]';
  return 'text-[#fb323f]';
}

const HEADS = [
  { label: 'الاسم', align: 'text-start' },
  { label: 'جلب', hint: 'الطلبات المنسوبة إليه خلال المدة' },
  { label: 'أكّد', hint: 'ما وصل إلى التأكيد' },
  { label: 'رفض', hint: 'مرفوض أو ملغى' },
  { label: 'نسبة التأكيد', hint: 'المؤكد ÷ ما وصل إلى قرار' },
  { label: 'وصل', hint: 'ما استلمه الزبون فعلاً' },
  { label: 'مرتجع' },
  { label: 'نسبة التوصيل', hint: 'الموصَّل ÷ المؤكد — طلب لم يُؤكَّد لم يكن للمندوب أن يوصّله' },
  { label: 'المحصَّل', hint: 'نفس تعريف شاشة الأرباح' },
  { label: 'للطلب الواحد', hint: 'المحصَّل ÷ ما جلبه — الفرق بين مصدر كبير ومصدر جيد' },
];

export function AttributionTable({
  rows,
  totals,
  empty,
}: {
  rows: AttributionRow[] | null;
  /** The totals line, computed on the server beside the rows. */
  totals?: AttributionRow | null;
  empty: string;
}) {
  if (rows === null) return <p className="p-6 text-sm text-[#9aa4b2] text-center">جارٍ التحميل…</p>;
  if (rows.length === 0) return <p className="p-6 text-sm text-[#9aa4b2] text-center">{empty}</p>;


  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586]">
          <tr>
            {HEADS.map((h) => (
              <th
                key={h.label}
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
        <tbody className="divide-y divide-[#e3e8ef]">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-[#f8fafc] transition-colors">
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="font-semibold text-[#121926]">{r.name}</span>
                {r.kind && (
                  <span className="text-[10px] text-[#9aa4b2] block">{KIND_AR[r.kind] ?? r.kind}</span>
                )}
              </td>
              <Num value={r.brought} />
              <Num value={r.confirmed} tone="text-[#00a344]" />
              <Num value={r.rejected} tone={r.rejected > 0 ? 'text-[#fb323f]' : undefined} />
              <Rate value={r.confirmationRate} />
              <Num value={r.delivered} tone="text-[#00a344]" />
              <Num value={r.returned} tone={r.returned > 0 ? 'text-[#c07f2a]' : undefined} />
              <Rate value={r.deliveryRate} />
              <td className="px-4 py-3 text-center tabular-nums font-bold text-[#121926]" dir="ltr">
                {r.revenue.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-center tabular-nums font-semibold text-[#b8256e]" dir="ltr">
                {r.revenuePerOrder === null ? '—' : r.revenuePerOrder.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-[#e3e8ef] bg-[#f8fafc]">
          <tr>
            <td className="px-4 py-3 font-bold text-[#121926]">الإجمالي</td>
            <Num value={totals?.brought ?? 0} bold />
            <Num value={totals?.confirmed ?? 0} bold tone="text-[#00a344]" />
            <Num value={totals?.rejected ?? 0} bold />
            {/* Both rates come from the server (attributionTotals): the
                screen recomputed their denominators from the row list, and
                a displayed rate is not frontend code's to work out. */}
            <Rate value={totals?.confirmationRate ?? null} bold />
            <Num value={totals?.delivered ?? 0} bold tone="text-[#00a344]" />
            <Num value={totals?.returned ?? 0} bold />
            <Rate value={totals?.deliveryRate ?? null} bold />
            <td className="px-4 py-3 text-center tabular-nums font-black text-[#121926]" dir="ltr">
              {(totals?.revenue ?? 0).toFixed(2)}
            </td>
            <td className="px-4 py-3 text-center tabular-nums font-bold text-[#b8256e]" dir="ltr">
              {totals?.revenuePerOrder != null ? totals.revenuePerOrder.toFixed(2) : '—'}
            </td>
          </tr>
        </tfoot>
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

function Rate({ value, bold }: { value: number | null; bold?: boolean }) {
  return (
    <td className={`px-4 py-3 text-center tabular-nums ${bold ? 'font-black' : 'font-bold'} ${rateTone(value)}`}>
      {value === null ? '—' : `${value}%`}
    </td>
  );
}
