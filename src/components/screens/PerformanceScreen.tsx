'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import { AlertTriangle, Download, Truck, Bike, Trophy, Coins, CheckCircle2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { DateRange } from '@/components/ui/DateRange';
import { TeamPerformanceTable } from '@/components/performance/TeamPerformanceTable';
import { AttributionTable, type AttributionRow } from '@/components/performance/AttributionTable';
import { LandingAnalyticsTab } from '@/components/performance/LandingAnalyticsTab';
import { userCan } from '@/lib/can';
import { ScoreBoard } from '@/components/performance/ScoreBoard';
import { findRoute } from '@/lib/route-registry';

/** The last thirty days, which is what "how are we doing" nearly always means. */
function lastThirtyDays() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(from), to: iso(to) };
}

type Tab = 'team' | 'landing' | 'scores';

export function PerformanceScreen() {
  const { t, currentUser } = useApp();
  // Two readings of the same window: who did the work, and what the landing
  // pages brought. The second is marketing data and needs its own
  // permission; the tab is simply absent without it (the API refuses too).
  const canLanding = userCan(currentUser, 'landing_pages.view');
  // The score board is its own decision: these are people's numbers, not
  // the shop's, and the key that opens the reports does not open them.
  const canScores = userCan(currentUser, 'team.monitor');
  const [tab, setTab] = useState<Tab>('team');
  // Opened from a link (?tab=landing) — read after mount, so the server
  // render and the first client render agree.
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('tab');
    if (canLanding && asked === 'landing') setTab('landing');
    if (canScores && asked === 'scores') setTab('scores');
  }, [canLanding, canScores]);
  const pickTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'team') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  };
  // ONE date filter for the whole screen. There used to be an English
  // period strip here and no filter at all on the people below it, so the
  // product table and the team table were answering about different spans
  // of time on the same page.
  const [range, setRange] = useState(lastThirtyDays);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Who is doing the work, and how well. The endpoints behind these were
  // built and never connected: this screen was a second copy of the
  // dashboard's analytics, and neither answered "which agent" or
  // "which courier".
  const [team, setTeam] = useState<any[] | null>(null);
  const [totals, setTotals] = useState<any>(null);
  const [couriers, setCouriers] = useState<any[] | null>(null);
  // Who brought the business, and through which door. Same window as
  // everything else on this screen.
  const [moderators, setModerators] = useState<AttributionRow[] | null>(null);
  const [channels, setChannels] = useState<AttributionRow[] | null>(null);
  const [attrTotals, setAttrTotals] = useState<{ moderators: AttributionRow; channels: AttributionRow } | null>(null);

  /** Empty dates mean "the whole window"; the server clamps it to 90 days. */
  const dateQuery = range.from && range.to ? `startDate=${range.from}&endDate=${range.to}` : 'period=all';

  useEffect(() => {
    loadData();
  }, [dateQuery]);

  useEffect(() => {
    setTeam(null);
    apiJson<{ employees: any[]; totals: any }>(`/api/orders/confirmation/team?${dateQuery}`)
      .then((d) => {
        setTeam(d.employees ?? []);
        setAttrTotals(d.totals ?? null);
      })
      .catch(() => setTeam([]));
  }, [dateQuery]);

  useEffect(() => {
    setModerators(null);
    setChannels(null);
    setAttrTotals(null);
    apiJson<{
      moderators: AttributionRow[];
      channels: AttributionRow[];
      totals?: { moderators: AttributionRow; channels: AttributionRow };
    }>(`/api/growth/attribution?${dateQuery}`)
      .then((d) => {
        setModerators(d.moderators ?? []);
        setChannels(d.channels ?? []);
        setTotals(d.totals ?? null);
      })
      .catch(() => {
        setModerators([]);
        setChannels([]);
        setAttrTotals(null);
      });
  }, [dateQuery]);

  useEffect(() => {
    apiJson<{ providers: any[] }>('/api/orders/shipping/performance')
      .then((d) => setCouriers(d.providers ?? []))
      .catch(() => setCouriers([]));
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?${dateQuery}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    window.open('/api/reports/export', '_blank');
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--sys-heading)]">{findRoute('/growth/performance')?.label}</h1>
            <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">
              ربح كل منتج، وترتيب المنتجات، وأداء الفريق — للمدة المختارة
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap gap-y-2">
            <div className="w-56">
              <DateRange value={range} onChange={setRange} label="كل المدة" />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="flex items-center space-x-1"
            >
              <Download className="w-4 h-4" />
              <span>تصدير CSV</span>
            </Button>
          </div>
        </div>

        {(canLanding || canScores) && (
          <div className="flex gap-6 border-b border-[var(--sys-border)] text-sm" role="tablist">
            {([
              ['team', 'المنتجات والفريق والقنوات'],
              ...(canScores ? [['scores', 'سكور الموظفين'] as [Tab, string]] : []),
              ...(canLanding ? [['landing', 'تحليلات صفحات الهبوط'] as [Tab, string]] : []),
            ] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => pickTab(key)}
                className={`-mb-px border-b-2 pb-2.5 font-semibold transition-colors ${
                  tab === key ? 'border-[var(--sys-primary)] text-[var(--sys-primary)]' : 'border-transparent text-[var(--sys-muted-foreground)] hover:text-[var(--sys-foreground)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === 'scores' && canScores ? (
          // Its OWN window — the week or month the owner set in the score
          // settings — not the date range above. The score is comparable
          // across months only if everybody's is measured over the same
          // span, which a free-hand date picker would quietly break.
          <ScoreBoard />
        ) : tab === 'landing' && canLanding ? (
          <LandingAnalyticsTab dateQuery={dateQuery} from={range.from} />
        ) : (
        <>
        {/* The five headlines, read at a glance before any table. */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Rank
            icon={<Trophy className="w-3.5 h-3.5" />}
            label="الأكثر طلباً"
            name={analytics?.rankings?.mostRequested?.name}
            note={`${analytics?.rankings?.mostRequested?.totalOrders || 0} طلب`}
          />
          <Rank
            icon={<Coins className="w-3.5 h-3.5" />}
            label="الأكثر ربحاً"
            name={analytics?.rankings?.mostProfitable?.name}
            note={`صافي ${(analytics?.rankings?.mostProfitable?.netProfit || 0).toFixed(2)}$`}
          />
          <Rank
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            label="الأكثر تأكيداً"
            name={analytics?.rankings?.mostConfirmed?.name}
            note={`${analytics?.rankings?.mostConfirmed?.confirmedOrders || 0} مؤكد`}
          />
          <Rank
            icon={<Truck className="w-3.5 h-3.5" />}
            label="الأكثر توصيلاً"
            name={analytics?.rankings?.mostDelivered?.name}
            note={`${analytics?.rankings?.mostDelivered?.deliveredOrders || 0} موصَّل`}
          />
          <Rank
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="الأكثر رفضاً"
            name={analytics?.rankings?.highestRejection?.name}
            note={`${analytics?.rankings?.highestRejection?.rejectedOrders || 0} مرفوض`}
            warn
          />
        </div>

        {/* Section 18: Product Profit Analysis Table */}
        <Card>
          <CardHeader
            title="ربح كل منتج"
            subtitle="الإيراد من الموصَّل فقط، ناقص كلفة البضاعة من الدفعات وكلفة الشحن"
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[var(--sys-surface)] border-b border-[var(--sys-border)] text-[var(--sys-muted-foreground)] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">المنتج</th>
                    <th className="px-6 py-3.5">الطلبات</th>
                    <th className="px-6 py-3.5">مؤكد</th>
                    <th className="px-6 py-3.5">موصَّل</th>
                    <th className="px-6 py-3.5">مرفوض</th>
                    <th className="px-6 py-3.5">إيراد الموصَّل</th>
                    <th className="px-6 py-3.5">كلفة البضاعة</th>
                    <th className="px-6 py-3.5">كلفة الشحن</th>
                    <th className="px-6 py-3.5">صافي الربح</th>
                    <th className="px-6 py-3.5">هامش الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sys-border)]">
                  {analytics?.productStats?.map((prod: any) => (
                    <tr key={prod.id} className="hover:bg-[var(--sys-surface)] transition-colors">
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-[var(--sys-heading)] block">{prod.name}</span>
                        <span className="font-mono text-caption text-[var(--sys-muted)]">{prod.sku}</span>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[var(--sys-heading)]">{prod.totalOrders}</td>
                      <td className="px-6 py-3.5 font-bold text-[var(--sys-success)]">
                        {prod.confirmedOrders}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[var(--sys-success)]">
                        {prod.deliveredOrders}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[var(--sys-destructive)]">
                        {prod.rejectedOrders}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[var(--sys-heading)]">
                        ${prod.revenue.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-[var(--sys-destructive)] font-medium">
                        -${prod.cogs.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-[var(--sys-destructive)] font-medium">
                        -${prod.shippingCost.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 font-black text-[var(--sys-heading)]">
                        ${prod.netProfit.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-[var(--sys-primary)] bg-[var(--sys-primary-soft)] px-2 py-0.5 rounded-lg text-xs">
                          {prod.profitMargin}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Confirmation agents */}
        <Card>
          <CardHeader
            title="أداء موظفي التأكيد"
            subtitle="الأزمنة بدقائق العمل — خارج الدوام والعطلة لا يُحتسب — والقيم وسيط لا متوسط"
          />
          <CardContent className="p-0">
            <TeamPerformanceTable rows={team as any} totals={totals} />
          </CardContent>
        </Card>

        {/* Who brought it in */}
        <Card>
          <CardHeader
            title="أداء المودريتورية"
            subtitle="ما جلبه كلٌّ منهم وما بقي منه — النسب من الخطوة التي قبلها، لا من أعلى القمع"
          />
          <CardContent className="p-0">
            <AttributionTable rows={moderators} totals={attrTotals?.moderators} empty="لا طلبات منسوبة لمودريتر في هذه المدة." />
          </CardContent>
        </Card>

        {/* Which door it came through */}
        <Card>
          <CardHeader
            title="أداء القنوات"
            subtitle="الباب الذي جاء منه الطلب — وعمود «للطلب الواحد» يفرّق بين مصدر كبير ومصدر جيد"
          />
          <CardContent className="p-0">
            <AttributionTable rows={channels} totals={attrTotals?.channels} empty="لا طلبات مرتبطة بقناة في هذه المدة." />
          </CardContent>
        </Card>

        {/* Couriers */}
        <Card>
          <CardHeader title="أداء شركات الشحن" subtitle="نسبة النجاح والمرتجعات ومتوسط زمن التوصيل" />
          <CardContent className="p-0">
            {couriers === null ? (
              <p className="p-6 text-sm text-[var(--sys-muted)] text-center">جارٍ التحميل…</p>
            ) : couriers.length === 0 ? (
              <p className="p-6 text-sm text-[var(--sys-muted)] text-center">لا شركات شحن بعد.</p>
            ) : (
              <ul className="divide-y divide-[var(--sys-border)]">
                {couriers.map((c) => (
                  <li key={c.provider.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--sys-heading)] min-w-[130px]">
                      {c.provider.kind === 'AGENT' ? (
                        <Bike className="w-3.5 h-3.5 text-[var(--sys-primary)]" />
                      ) : (
                        <Truck className="w-3.5 h-3.5 text-[var(--sys-muted)]" />
                      )}
                      {c.provider.name}
                    </span>
                    <Metric label="مُسند" value={c.metrics.assigned} />
                    <Metric label="مُسلَّم" value={c.metrics.delivered} tone="text-[var(--sys-success)]" />
                    <Metric label="مرتجع" value={c.metrics.returned} tone="text-[var(--sys-destructive)]" />
                    <Metric
                      label="متوسط التوصيل"
                      value={c.metrics.avgDeliveryHours === null ? '—' : `${c.metrics.avgDeliveryHours} س`}
                    />
                    <span className="ms-auto tabular-nums font-bold text-[var(--sys-heading)]">
                      {c.metrics.successRate ?? '—'}%
                      <span className="text-caption text-[var(--sys-muted)] font-normal"> نجاح</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        </>
        )}
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <span className="text-[var(--sys-muted-foreground)]">
      {label}: <span className={`tabular-nums font-semibold ${tone ?? 'text-[var(--sys-heading)]'}`}>{value}</span>
    </span>
  );
}

/**
 * One headline. The five of them used to be red emoji boxes with English
 * capitals — the only place in the system that looked like that.
 */
function Rank({
  icon,
  label,
  name,
  note,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  name?: string;
  note: string;
  warn?: boolean;
}) {
  const tone = warn ? 'text-[var(--sys-warning)]' : 'text-[var(--sys-primary)]';
  return (
    <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] p-3.5 rounded-lg">
      <span className={`text-caption font-bold ${tone} inline-flex items-center gap-1.5`}>
        {icon}
        {label}
      </span>
      <p className="font-bold text-[var(--sys-heading)] text-sm mt-1.5 line-clamp-1" title={name}>
        {name || '—'}
      </p>
      <p className="text-caption text-[var(--sys-muted-foreground)] font-semibold mt-0.5 tabular-nums">{note}</p>
    </div>
  );
}
