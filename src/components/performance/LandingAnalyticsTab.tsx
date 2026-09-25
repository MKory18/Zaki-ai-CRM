'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, ShoppingBag, Percent, Info, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * تحليلات صفحات الهبوط — for the screen's one date window.
 *
 * Views, orders and the rate between them; per page, per device and per
 * campaign. This used to be a table in settings showing lifetime totals of
 * the eight newest pages, under a link to "full analytics" that led here to
 * nothing. Setup is in settings; reading is here.
 */

interface Row {
  key: string;
  label: string;
  hint?: string;
  views: number;
  orders: number;
  conversion: number | null;
}

interface Data {
  countingSince: string | null;
  totals: Row;
  byPage: Row[];
  byDevice: Row[];
  byCampaign: Row[];
}

export function LandingAnalyticsTab({ dateQuery, from }: { dateQuery: string; from: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setData(null);
    setFailed(false);
    apiJson<Data>(`/api/growth/landing-analytics?${dateQuery}`)
      .then(setData)
      .catch(() => setFailed(true));
  }, [dateQuery]);

  if (failed) {
    return <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-6 text-center text-xs text-[var(--sys-muted-foreground)]">تعذّر تحميل التحليلات.</p>;
  }
  if (!data) {
    return (
      <div className="flex h-40 items-center justify-center text-[var(--sys-muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  // Views began to be counted by day on the day this shipped. A window that
  // reaches back further — or has no start at all — shows its orders but not
  // the views behind them.
  const partial = !data.countingSince || !from || data.countingSince > from;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-3 gap-3">
        <Tile icon={<Eye className="h-3.5 w-3.5" />} label="المشاهدات" value={fmt(data.totals.views)} />
        <Tile icon={<ShoppingBag className="h-3.5 w-3.5" />} label="الطلبات" value={fmt(data.totals.orders)} />
        <Tile icon={<Percent className="h-3.5 w-3.5" />} label="نسبة التحويل" value={pct(data.totals.conversion)} />
      </div>

      {partial && (
        <p className="flex items-start gap-1.5 rounded-lg bg-[var(--sys-surface-strong)] px-3 py-2 text-[11px] leading-relaxed text-[var(--sys-foreground)]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {data.countingSince
            ? `المشاهدات تُعدّ يومياً منذ ${data.countingSince}. عمود الطلبات يشمل المدة كلها، أما نسبة التحويل فتُحسب من طلبات الأيام التي عُدّت فيها المشاهدات فقط.`
            : 'لم تُسجَّل مشاهدات بعد — تُعدّ من أول زيارة لصفحة منشورة. الطلبات تظهر من الآن.'}
        </p>
      )}

      <Table title="حسب الصفحة" rows={data.byPage} empty="لا زيارات ولا طلبات من صفحات الهبوط في هذه المدة." linkPages />
      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="حسب الجهاز" rows={data.byDevice} empty="لا بيانات." />
        <Table title="حسب الحملة" rows={data.byCampaign} empty="لا حملات لها زيارات أو طلبات في هذه المدة." />
      </div>
      <p className="text-[10px] leading-relaxed text-[var(--sys-muted)]">
        المشاهدة زيارة حقيقية لصفحة منشورة — المعاينة من لوحة التحكم وروابط المعاينة في المحادثات لا تُعدّ. الطلب
        كل طلب جاء من صفحة هبوط خلال المدة، والحملة من رمز ?c= في رابطها.
      </p>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-3">
      <p className="flex items-center gap-1 text-[11px] font-semibold text-[var(--sys-muted-foreground)]">{icon}{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums text-[var(--sys-heading)]" dir="ltr">{value}</p>
    </div>
  );
}

function Table({ title, rows, empty, linkPages }: { title: string; rows: Row[]; empty: string; linkPages?: boolean }) {
  return (
    <section className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
      <h3 className="border-b border-[var(--sys-surface-strong)] px-4 py-2.5 text-sm font-bold text-[var(--sys-heading)]">{title}</h3>
      {rows.length === 0 || rows.every((r) => !r.views && !r.orders) ? (
        <p className="p-4 text-center text-xs text-[var(--sys-muted)]">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-[var(--sys-muted-foreground)]">
                <th className="px-4 py-2 text-start font-semibold">الاسم</th>
                <th className="px-2 py-2 text-end font-semibold">مشاهدات</th>
                <th className="px-2 py-2 text-end font-semibold">طلبات</th>
                <th className="px-4 py-2 text-end font-semibold">التحويل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-[var(--sys-surface-strong)]">
                  <td className="px-4 py-2">
                    <span className="font-semibold text-[var(--sys-heading)]">
                      {linkPages && r.hint?.startsWith('/lp/') ? (
                        <Link href={r.hint} target="_blank" className="hover:text-[var(--sys-primary)] hover:underline">{r.label}</Link>
                      ) : r.label}
                    </span>
                    {r.hint && !r.hint.startsWith('/lp/') && (
                      <span className="ms-1.5 text-[10px] text-[var(--sys-muted)]" dir={r.hint.startsWith('?') ? 'ltr' : undefined}>{r.hint}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums text-[var(--sys-foreground)]" dir="ltr">{fmt(r.views)}</td>
                  <td className="px-2 py-2 text-end tabular-nums text-[var(--sys-foreground)]" dir="ltr">{fmt(r.orders)}</td>
                  <td className="px-4 py-2 text-end font-bold tabular-nums text-[var(--sys-heading)]" dir="ltr">{pct(r.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const fmt = (n: number) => n.toLocaleString('en-US');
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
