'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import { apiJson } from '@/lib/api-client';
import { DateRange } from '@/components/ui/DateRange';
import { TeamPerformanceTable } from '@/components/performance/TeamPerformanceTable';
import { AttributionTable, type AttributionRow } from '@/components/performance/AttributionTable';
import { LandingAnalyticsTab } from '@/components/performance/LandingAnalyticsTab';
import { userCan } from '@/lib/can';
import { ScoreBoard } from '@/components/performance/ScoreBoard';
import { findRoute, routeLabel } from '@/lib/route-registry';
import { RiAlertLine, RiCopperCoinLine, RiDownload2Line, RiEBike2Line, RiInboxUnarchiveLine, RiTrophyLine, RiTruckLine } from '@remixicon/react';
import { Money } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { Rows } from '@/components/ui/Rows';
import { healthOf } from '@/lib/health';
import { HealthChip } from '@/components/ui/HealthChip';
import { rowCostStated, type Trust } from '@/lib/cod-vitals';

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
    // The team endpoint's totals belong to the TEAM table. They were being
    // put into `attrTotals`, which is the attribution tables' state, while
    // the attribution endpoint's totals were being put into `totals`, which
    // is the team table's — so each table's footer was summing the other
    // table's rows. Two states, two endpoints, swapped once.
    apiJson<{ employees: any[]; totals: any }>(`/api/orders/confirmation/team?${dateQuery}`)
      .then((d) => {
        setTeam(d.employees ?? []);
        setTotals(d.totals ?? null);
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
        setAttrTotals(d.totals ?? null);
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

  /**
   * THE VITALS THE SERVER SENT, AND THE VERDICT ON THE COST DATA.
   *
   * Nothing here is recomputed from money. `cost` is not a figure — it is
   * whether the figures that REST on a cost may be printed at all, and it
   * governs three places on this screen: the «الأكثر ربحاً» card, the net
   * profit column, and the margin column. On the measured database it says
   * no: cost of goods is recorded on 4 of 119 delivered orders, and the
   * margins this table printed were 80.7%, 82.3%, 82.2%, 80%, 81.7% and 76%
   * — six products, one number, which is what a missing input looks like
   * when somebody draws a figure over it.
   */
  const vitals = analytics?.vitals as
    | {
        door: { delivered: number; failed: number; returned: number; decided: number; returnRate: number | null };
        cost: Trust;
        returnsByProduct: { productId: string; returned: number; decided: number; rate: number | null }[];
      }
    | undefined;
  const costStated = vitals ? vitals.cost.level !== 'WITHHELD' : false;

  /** Returns per product, by id, for the two columns and the headline card. */
  const returnsOf = new Map((vitals?.returnsByProduct ?? []).map((r) => [r.productId, r]));

  // Already sorted by parcels-back on the server; the name comes from
  // `productStats` in the same payload rather than a second lookup, so the
  // card and the table can never spell one product two ways.
  const topReturnedRow = (vitals?.returnsByProduct ?? []).find((r) => r.returned > 0);
  const topReturned = topReturnedRow
    ? {
        ...topReturnedRow,
        name: (analytics?.productStats ?? []).find((p: any) => p.id === topReturnedRow.productId)?.name as
          | string
          | undefined,
      }
    : null;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader title={routeLabel('/growth/performance')}
            description="ربح كل منتج، وترتيب المنتجات، وأداء الفريق — للمدة المختارة"
            actions={
              <><div className="flex items-center gap-2 flex-wrap gap-y-2">
            <div className="w-56">
              <DateRange value={range} onChange={setRange} label="كل المدة" />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="flex items-center space-x-1"
            >
              <RiDownload2Line className="w-4 h-4" />
              <span>تصدير CSV</span>
            </Button>
          </div></>
            }
          />

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
        {/*
          ─── THE FOUR HEADLINES, AND WHY IT IS FOUR AND NOT FIVE ───

          «الأكثر تأكيداً» is gone. Measured on all three stores in the live
          database, it named the SAME product as «الأكثر طلباً» every time —
          which is what a 97% confirmation rate does to it: confirmed orders
          are very nearly total orders, so the two cards have the same
          argmax and one of them is a second drawing of the other.

          «الأكثر ربحاً» stays, but only when there is a profit to rank. With
          cost of goods recorded on 4 of 119 delivered orders, ranking by
          profit IS ranking by revenue — and measured, it named the same
          product as «الأكثر توصيلاً» in all three stores too. So the card
          says which field is empty rather than crowning the same product a
          third time under a money word.

          «الأكثر إرجاعاً» takes the freed slot. It is the only one of these
          five questions that costs money twice — the outbound fee and the
          fee to bring it back — and nothing in this product answered it.
        */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Rank
            icon={<RiTrophyLine className="w-4 h-4" />}
            label="الأكثر طلباً"
            name={analytics?.rankings?.mostRequested?.name}
            note={`${analytics?.rankings?.mostRequested?.totalOrders || 0} طلب`}
          />
          <Rank
            icon={<RiCopperCoinLine className="w-4 h-4" />}
            label="الأكثر ربحاً"
            name={costStated ? analytics?.rankings?.mostProfitable?.name : undefined}
            note={
              costStated ? (
                <>صافي <Money value={analytics?.rankings?.mostProfitable?.netProfit || 0} /></>
              ) : (
                'كلفة البضاعة غير مسجَّلة'
              )
            }
          />
          <Rank
            icon={<RiTruckLine className="w-4 h-4" />}
            label="الأكثر توصيلاً"
            name={analytics?.rankings?.mostDelivered?.name}
            note={`${analytics?.rankings?.mostDelivered?.deliveredOrders || 0} موصَّل`}
          />
          <Rank
            icon={<RiInboxUnarchiveLine className="w-4 h-4" />}
            label="الأكثر إرجاعاً"
            name={topReturned?.name}
            note={
              topReturned
                ? `${topReturned.returned} من ${topReturned.decided} بتَّ فيه الباب`
                : 'لا مرتجعات في هذه المدة'
            }
            warn
          />
        </div>

        {/*
          THE WHOLE COMPANY'S RETURN RATE, ABOVE THE TABLE THAT BREAKS IT UP.

          It belongs here rather than only on the dashboard because every
          per-product rate below is read against it: a product at 24% in a
          shop at 22% is normal, and the same product in a shop at 6% is the
          problem. Measured: 34 of 153 parcels that reached a verdict came
          back, against a bar of 8% good and 15% acceptable.
        */}
        {vitals && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--sys-heading)]">
              <RiAlertLine className="w-4 h-4 text-[var(--sys-warning)]" aria-hidden />
              الإرجاع في هذه المدة
            </span>
            <span className="text-sm font-black tabular-nums text-[var(--sys-heading)]">
              {vitals.door.returnRate === null ? '—' : `${vitals.door.returnRate}%`}
            </span>
            <span className="text-xs text-[var(--sys-muted-foreground)] tabular-nums">
              {vitals.door.returned} من {vitals.door.decided} طلب بتَّ فيه الباب
            </span>
            <HealthChip
              className="ms-auto"
              withWhy
              health={healthOf('returnRate', vitals.door.returnRate, vitals.door.decided)}
            />
          </div>
        )}

        {/* Section 18: Product Profit Analysis Table */}
        <Card>
          <CardHeader
            title="ربح كل منتج"
            /**
             * THE SUBTITLE SAYS WHETHER THE TABLE'S MONEY COLUMNS MEAN
             * ANYTHING, BEFORE ANYBODY READS THEM.
             *
             * It used to describe the arithmetic — «الإيراد ناقص الكلفة» —
             * which is true and useless: the arithmetic was never the
             * problem, the empty cost field was. Now it names the coverage
             * out loud, and the two profit columns below refuse per row.
             */
            subtitle={
              vitals ? `${vitals.cost.ar} · الإيراد من الموصَّل فقط، ناقص كلفة البضاعة وكلفة الشحن` : undefined
            }
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
                            <Rows
                rows={(analytics?.productStats ?? [])}
                keyOf={(prod: any) => prod.id}
                columns={[
                  { key: 'c0', label: "المنتج", primary: true,
                    render: (prod: any) => (
                  <><span className="font-bold text-[var(--sys-heading)] block">{prod.name}</span>
                        <span className="font-mono text-xs text-[var(--sys-muted)]">{prod.sku}</span></>
                ) },
                  { key: 'c1', label: "الطلبات", primary: true,
                    render: (prod: any) => (prod.totalOrders) },
                  // Hidden from the phone cards, not from the table. With a
                  // 97% confirmation rate «مؤكد» is «الطلبات» again to within
                  // a few orders, and a card that spends a line on it spends
                  // it instead of on what came back.
                  { key: 'c2', label: "مؤكد", hideOnPhone: true,
                    render: (prod: any) => (prod.confirmedOrders) },
                  { key: 'c3', label: "موصَّل",
                    render: (prod: any) => (prod.deliveredOrders) },
                  { key: 'c4', label: "مرفوض على الهاتف", hideOnPhone: true,
                    render: (prod: any) => (prod.rejectedOrders) },
                  /**
                   * AND WHAT CAME BACK FROM THE DOOR, WHICH IS THE OTHER
                   * HALF OF THE SAME QUESTION AND THE EXPENSIVE ONE.
                   *
                   * «مرفوض» beside it is a refusal on the PHONE: nothing was
                   * spent, no parcel moved, no fee was paid. This column is
                   * a refusal AFTER the fee — billed out and billed back —
                   * and the table had no column for it at all, so the
                   * cheapest loss was reported per product and the dearest
                   * one was not reported anywhere.
                   */
                  { key: 'c5', label: "مرتجع من الباب",
                    render: (prod: any) => (returnsOf.get(prod.id)?.returned ?? 0) },
                  { key: 'c6', label: "نسبة الإرجاع",
                    render: (prod: any) => {
                      const r = returnsOf.get(prod.id);
                      // The verdict rather than the bare percentage, because
                      // one parcel back out of two is «50%» and means
                      // nothing — `healthOf` refuses a sample under ten and
                      // says «لا يكفي» instead of dressing it as a rate.
                      return (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="tabular-nums">{r?.rate === null || !r ? '—' : `${r.rate}%`}</span>
                          {r && <HealthChip health={healthOf('returnRate', r.rate, r.decided)} />}
                        </span>
                      );
                    } },
                  { key: 'c7', label: "إيراد الموصَّل",
                    render: (prod: any) => (
                  <><Money value={prod.revenue} /></>
                ) },
                  { key: 'c8', label: "كلفة البضاعة",
                    render: (prod: any) => (
                  rowCostStated(prod)
                    ? <Money value={-prod.cogs} />
                    : <span className="text-[var(--sys-muted)]">غير مسجَّلة</span>
                ) },
                  { key: 'c9', label: "كلفة الشحن", hideOnPhone: true,
                    render: (prod: any) => (
                  <><Money value={-prod.shippingCost} /></>
                ) },
                  /**
                   * THE TWO COLUMNS THAT REFUSE THEMSELVES, ROW BY ROW.
                   *
                   * The table-wide verdict in the subtitle answers «is this
                   * shop's cost data usable». It cannot answer «is THIS
                   * product's margin usable», and on the measured data the
                   * two differ: 5 of the 7 products that sold carry no cost
                   * at all while 2 carry one. Gated only at the top, the two
                   * true rows would be blanked with the five false ones;
                   * gated nowhere, a product whose cost nobody has typed
                   * printed «82%» — the revenue, in a green pill, called a
                   * margin.
                   */
                  { key: 'c10', label: "صافي الربح",
                    render: (prod: any) => (
                  rowCostStated(prod)
                    ? <Money value={prod.netProfit} />
                    : <span className="text-[var(--sys-muted)]">—</span>
                ) },
                  { key: 'c11', label: "هامش الربح",
                    render: (prod: any) => (
                  rowCostStated(prod)
                    ? <span className="font-bold text-[var(--sys-primary)] bg-[var(--sys-primary-soft)] px-2 py-0.5 rounded-lg text-xs">
                          {prod.profitMargin}%
                        </span>
                    : <span className="text-[var(--sys-muted)]" title="لا كلفة مسجَّلة لهذا المنتج — الهامش سيكون الإيراد نفسه">—</span>
                ) },
                ]}
              />
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
              <div className="p-4"><SkeletonRows rows={5} /></div>
            ) : couriers.length === 0 ? (
              <p className="p-6 text-sm text-[var(--sys-muted)] text-center">لا شركات شحن بعد.</p>
            ) : (
              <ul className="divide-y divide-[var(--sys-border)]">
                {couriers.map((c) => (
                  <li key={c.provider.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--sys-heading)] min-w-[130px]">
                      {c.provider.kind === 'AGENT' ? (
                        <RiEBike2Line className="w-4 h-4 text-[var(--sys-primary)]" />
                      ) : (
                        <RiTruckLine className="w-4 h-4 text-[var(--sys-muted)]" />
                      )}
                      {c.provider.name}
                    </span>
                    <Metric label="مُسند" value={c.metrics.assigned} />
                    <Metric label="مسلَّم" value={c.metrics.delivered} tone="text-[var(--sys-success)]" />
                    <Metric label="مرتجع" value={c.metrics.returned} tone="text-[var(--sys-destructive)]" />
                    <Metric
                      label="متوسط التوصيل"
                      value={c.metrics.avgDeliveryHours === null ? '—' : `${c.metrics.avgDeliveryHours} س`}
                    />
                    <span className="ms-auto tabular-nums font-bold text-[var(--sys-heading)]">
                      {c.metrics.successRate ?? '—'}%
                      <span className="text-xs text-[var(--sys-muted)] font-normal"> نجاح</span>
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
  note: React.ReactNode;
  warn?: boolean;
}) {
  const tone = warn ? 'text-[var(--sys-warning)]' : 'text-[var(--sys-primary)]';
  return (
    <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] p-4 rounded-lg">
      <span className={`text-xs font-bold ${tone} inline-flex items-center gap-1.5`}>
        {icon}
        {label}
      </span>
      <p className="font-bold text-[var(--sys-heading)] text-sm mt-1.5 line-clamp-1" title={name}>
        {name || '—'}
      </p>
      <p className="text-xs text-[var(--sys-muted-foreground)] font-semibold mt-0.5 tabular-nums">{note}</p>
    </div>
  );
}
