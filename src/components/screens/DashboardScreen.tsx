'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardHeader, CardContent, KpiCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';
import { AiOrderModal } from '@/components/orders/AiOrderModal';
import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { useApp } from '@/context/AppContext';
import { apiFetch } from '@/lib/api-client';
import { productName } from '@/lib/product-name';
import { format } from 'date-fns';
import Link from 'next/link';
import { RiAddCircleLine, RiArrowRightLine, RiArrowUpCircleLine, RiAwardLine, RiCloseCircleLine, RiEqualLine, RiFireLine, RiMoneyDollarCircleLine, RiPercentLine, RiShoppingBagLine, RiSparkling2Line, RiSubtractLine, RiTruckLine, RiWallet3Line } from '@remixicon/react';
import { Money } from '@/components/ui/Money';
import { IntelligenceStrip } from '@/components/growth/IntelligenceStrip';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

const PERIODS = [
  { key: 'today', ar: 'اليوم', en: 'Today' },
  { key: '7d', ar: '7 أيام', en: '7 Days' },
  { key: '30d', ar: '30 يوم', en: '30 Days' },
  { key: 'month', ar: 'هذا الشهر', en: 'This Month' },
  { key: 'all', ar: 'الكل', en: 'All' },
] as const;

export function DashboardScreen() {
  const { t, locale, isRtl, currentUser } = useApp();
  const canFinance =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'COMPANY_ADMIN' ||
    currentUser?.permissions?.includes('finance.view');

  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'month' | 'all'>('all');
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Monotonic request counter — stale (out-of-order) analytics responses are
  // discarded so an older poll can never overwrite a newer result
  const loadAnalyticsSeq = useRef(0);

  const loadAnalytics = useCallback(async () => {
    const seq = ++loadAnalyticsSeq.current;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/analytics?period=${period}`);
      if (seq !== loadAnalyticsSeq.current) return; // stale — discard
      if (res.ok) setAnalytics(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      // Only the latest request may clear the shared loading flag
      if (seq === loadAnalyticsSeq.current) setLoading(false);
    }
  }, [period]);
  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Ref mirror so the 30s polling interval + visibility handler always call
  // the latest loadAnalytics (current period) without re-subscribing
  const loadAnalyticsRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { loadAnalyticsRef.current = loadAnalytics; }, [loadAnalytics]);

  // Light polling (30s) + refetch when the tab becomes visible again
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) loadAnalyticsRef.current();
    }, 30_000);
    const onVisibility = () => {
      if (!document.hidden) loadAnalyticsRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const fin = analytics?.financials ?? {
    deliveredRevenue: 0, costOfGoodsSold: 0, shippingCosts: 0,
    commission: 0, operationalExpenses: 0, netProfit: 0, profitMargin: 0,
  };
  const counts = analytics?.ordersCount ?? {
    total: 0, new: 0, contacting: 0, confirmed: 0,
    postponed: 0, rejected: 0, shipped: 0, delivered: 0,
  };
  const rates = analytics?.rates ?? { confirmationRate: 0, deliveryRate: 0 };


  // Was a hardcoded «$» with a locale's own grouping. The store may be
  // Jordanian or Syrian, and `<Money>` knows which it is.
  const fmt = (n: number) => <Money value={n} />;

  /**
   * THE PREVIOUS PERIOD, SHAPED FOR THE CARD.
   *
   * The card wants a value, a label naming the period, and which way it
   * moved. The DIRECTION is computed here rather than sent, because the
   * server would have to know which way is good for each figure — and
   * `goodWhen` already says that at each call site, once.
   */
  const priorLabel =
    period === 'today' ? 'أمس'
    : period === '7d' ? 'الأسبوع السابق'
    : period === '30d' ? 'الثلاثين السابقة'
    : period === 'month' ? 'الشهر الماضي'
    : 'الفترة السابقة';

  const against = (now: number, before: number | undefined, render: (n: number) => React.ReactNode) => {
    if (before === undefined || before === null) return undefined;
    const direction = now > before ? ('up' as const) : now < before ? ('down' as const) : ('flat' as const);
    // A percentage of a zero base is not a percentage. Say the two figures
    // and let the arrow carry the direction.
    const change =
      before > 0 && now !== before ? `${Math.abs(Math.round(((now - before) / before) * 100))}%` : undefined;
    return { value: render(before), label: priorLabel, direction, change };
  };

  const prevRaw = analytics?.previous ?? null;
  const prev = {
    netProfit: against(fin.netProfit, prevRaw?.netProfit, (n) => fmt(n)),
    deliveredRevenue: against(fin.deliveredRevenue, prevRaw?.deliveredRevenue, (n) => fmt(n)),
    confirmationRate: against(rates.confirmationRate, prevRaw?.confirmationRate, (n) => `${n}%`),
    deliveryRate: against(rates.deliveryRate, prevRaw?.deliveryRate, (n) => `${n}%`),
  };

  const statusTiles = [
    { label: t.NEW, value: counts.new, color: 'text-[var(--sys-primary)]', dot: 'bg-[var(--sys-primary)]' },
    { label: t.CONTACTING, value: counts.contacting, color: 'text-[var(--sys-primary)]', dot: 'bg-[var(--sys-muted-foreground)]' },
    { label: t.CONFIRMED, value: counts.confirmed, color: 'text-[var(--sys-success)]', dot: 'bg-[var(--sys-success)]' },
    { label: t.POSTPONED, value: counts.postponed, color: 'text-[var(--sys-warning)]', dot: 'bg-[var(--sys-warning)]' },
    { label: t.SHIPPED, value: counts.shipped, color: 'text-[var(--sys-primary)]', dot: 'bg-[var(--sys-primary)]' },
    { label: t.DELIVERED, value: counts.delivered, color: 'text-[var(--sys-success)]', dot: 'bg-[var(--sys-success)]' },
    { label: t.REJECTED, value: counts.rejected, color: 'text-[var(--sys-destructive)]', dot: 'bg-[var(--sys-destructive)]' },
  ];

  // The icon is a COMPONENT, not a character. An emoji here was drawn by
  // the operating system: a flat outline on this desk, a gradient sticker
  // on the phone in the warehouse, and neither one the colour of the card
  // it sits in.
  // And each row reuses the icon this screen ALREADY spends on that idea:
  // the bag is an order here and on the orders card, the wallet is profit
  // here and in the net-profit tile, the truck is a delivery in both. Four
  // new drawings would have been four more concepts for the same four.
  const rankings = [
    { icon: RiShoppingBagLine, label: locale === 'ar' ? 'الأكثر طلباً' : 'Most Requested', sub: analytics?.rankings?.mostRequested?.totalOrders ?? 0, subSuffix: locale === 'ar' ? 'طلب' : 'orders', name: analytics?.rankings?.mostRequested?.name, tint: 'bg-[var(--sys-surface)] border-[var(--sys-primary-soft)]', text: 'text-[var(--sys-primary)]' },
    { icon: RiWallet3Line, label: locale === 'ar' ? 'الأكثر ربحاً' : 'Most Profitable', sub: analytics?.rankings?.mostProfitable?.netProfit ?? 0, prefix: '+$', name: analytics?.rankings?.mostProfitable?.name, tint: 'bg-[var(--sys-success-soft)]', text: 'text-[var(--sys-success)]' },
    { icon: RiTruckLine, label: locale === 'ar' ? 'الأكثر توصيلاً' : 'Most Delivered', sub: analytics?.rankings?.mostDelivered?.deliveredOrders ?? 0, subSuffix: locale === 'ar' ? 'توصيل' : 'delivered', name: analytics?.rankings?.mostDelivered?.name, tint: 'bg-[var(--sys-warning-soft)] border-[var(--sys-warning)]/30', text: 'text-[var(--sys-warning)]' },
    { icon: RiCloseCircleLine, label: locale === 'ar' ? 'الأكثر رفضاً' : 'Highest Rejections', sub: analytics?.rankings?.highestRejection?.rejectedOrders ?? 0, subSuffix: locale === 'ar' ? 'رفض' : 'rejected', name: analytics?.rankings?.highestRejection?.name, tint: 'bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)]', text: 'text-[var(--sys-destructive)]' },
  ];

  // `value` is a NODE, not a string. It used to be `` `+${fmt(x)}` `` —
  // and once `fmt` returned a <Money> element instead of a string, the
  // equation row printed «+[object Object]» across the dashboard.
  const profitFlow: { label: string; value: React.ReactNode; cls: string }[] = [
    { label: locale === 'ar' ? 'إيراد التوصيل' : 'Delivered Revenue', value: (<>+{fmt(fin.deliveredRevenue)}</>), cls: 'text-[var(--sys-success)] bg-[var(--sys-success-soft)] border-0' },
    { label: locale === 'ar' ? 'تكلفة البضاعة' : 'COGS', value: (<>−{fmt(fin.costOfGoodsSold)}</>), cls: 'text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)]' },
    { label: locale === 'ar' ? 'الشحن' : 'Shipping', value: (<>−{fmt(fin.shippingCosts)}</>), cls: 'text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)]' },
    { label: locale === 'ar' ? 'العمولات' : 'Commissions', value: (<>−{fmt(fin.commission)}</>), cls: 'text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)]' },
    { label: locale === 'ar' ? 'المصروفات' : 'Expenses', value: (<>−{fmt(fin.operationalExpenses)}</>), cls: 'text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)]' },
  ];

  return (
    <>
      <div className="space-y-6">
        {/* ─── Header ─── */}
        <PageHeader title={t.dashboard}
            description={locale === 'ar'
                ? 'متابعة المبيعات والتكاليف وأداء الفريق والأرباح الحقيقية — لحظة بلحظة'
                : 'Real-time sales, cost analysis, team performance & real net profit'}
            actions={
              <><div className="flex min-w-0 items-center gap-2 flex-wrap">
            {/* Period selector */}
            <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-1 flex text-xs font-medium text-[var(--sys-foreground)] shadow-raised">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`flex h-11 items-center px-3 md:h-auto md:py-1.5 rounded-lg transition-colors cursor-pointer ${
                    // Chosen, not lost. This was the colour that means
                    // "late, or money lost", used to mean "selected".
                    period === p.key ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] font-bold shadow-raised' : 'hover:bg-[var(--sys-surface)]'
                  }`}
                >
                  {locale === 'ar' ? p.ar : p.en}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={() => setAiModalOpen(true)}
              className="items-center gap-1.5 text-[var(--sys-primary)] border-[var(--sys-primary)]/35 hover:bg-[var(--sys-primary-soft)]"
            >
              <RiSparkling2Line className="w-4 h-4" />
              <span>إدخال بالذكاء الاصطناعي</span>
            </Button>

            <Button onClick={() => setCreateModalOpen(true)} className="bg-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/85 items-center">
              <RiAddCircleLine className="w-4 h-4" />
              <span>طلب سريع</span>
            </Button>
          </div></>
            }
          />

        {/* ─── What needs a person, before what merely happened ───
             Above the KPIs on purpose: the tiles say how the month is
             going, and this says what is stuck right now. A dashboard
             that leads with the month is read once a month. */}
        <IntelligenceStrip />

        {/* ─── The four numbers, from the shared card ───
             Each one carries the previous period beside it and opens the
             list behind it. A figure with nothing to compare it against is
             a figure nobody can act on. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {canFinance && (
            <KpiCard
              title={t.netProfit}
              value={fmt(fin.netProfit)}
              subtitle={`${t.profitMargin} ${fin.profitMargin}%`}
              icon={RiWallet3Line}
              previous={prev.netProfit}
              goodWhen="rising"
              href="/finance/profit"
            />
          )}

          {canFinance && (
            <KpiCard
              title={t.deliveredRevenue}
              value={fmt(fin.deliveredRevenue)}
              subtitle={`${counts.delivered} ${locale === 'ar' ? 'طلب موصّل' : 'delivered orders'}`}
              icon={RiArrowUpCircleLine}
              previous={prev.deliveredRevenue}
              goodWhen="rising"
              href="/orders?state=DELIVERED"
            />
          )}

          <KpiCard
            title={t.confirmationRate}
            value={`${rates.confirmationRate}%`}
            subtitle={`${counts.confirmed} / ${counts.decided ?? counts.total} ${t.decidedOrders}`}
            icon={RiPercentLine}
            previous={prev.confirmationRate}
            goodWhen="rising"
            href="/confirmation/queue"
          />

          <KpiCard
            title={t.deliveryRate}
            value={`${rates.deliveryRate}%`}
            subtitle={`${counts.delivered} / ${counts.confirmed} ${t.confirmedOrders}`}
            icon={RiTruckLine}
            previous={prev.deliveryRate}
            goodWhen="rising"
            href="/ops/tracking"
          />
        </div>

        {/* ─── Order Status Tiles ─── */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
          {statusTiles.map((s) => (
            <div key={s.label} className="bg-[var(--sys-card)] rounded-lg border border-[var(--sys-border)]/80 p-4 text-center shadow-raised">
              <span className={`inline-block w-2 h-2 rounded-full ${s.dot} mb-1.5`} />
              <span className="block text-xs font-semibold text-[var(--sys-muted-foreground)] leading-tight">{s.label}</span>
              <span className={`block text-xl font-black mt-1 ${s.value > 0 ? s.color : 'text-[var(--sys-border-strong)]'}`}>
                {s.value}
              </span>
            </div>
          ))}
        </div>

        {/* ─── Rankings + Leaderboard ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <RiFireLine className="w-4 h-4 text-[var(--sys-destructive)]" />
                  {locale === 'ar' ? 'ترتيب المنتجات والأرباح' : 'Product Rankings & Profit'}
                </span>
              }
              action={
                <Link href="/products" className="tap-safe inline-flex items-center gap-1 text-xs text-[var(--sys-destructive)] font-medium hover:underline">
                  {locale === 'ar' ? 'المنتجات' : 'View Products'}
                  {/* The same arrow, from the same set, mirrored the same way
                      as the one at line 219 — not the character ←, whose
                      weight and size are whatever the device's font says. */}
                  <RiArrowRightLine className="icon-mirror h-4 w-4" aria-hidden />
                </Link>
              }
            />
            <CardContent className="space-y-2.5">
              {rankings.map((r) => (
                <div key={r.label} className={`flex items-center justify-between p-3 rounded-lg border ${r.tint}`}>
                  <div className="flex items-center gap-3">
                    <r.icon className={`h-5 w-5 shrink-0 ${r.text}`} aria-hidden />
                    <div>
                      {/* No `uppercase tracking-wide`: the label is Arabic, and
                          spacing a joined script out stops its letters touching. */}
                      <p className={`text-xs font-bold ${r.text}`}>{r.label}</p>
                      <p className="text-sm font-bold text-[var(--sys-heading)] line-clamp-1">
                        {r.name ? productName(r.name, locale) : '—'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-sm font-black ${r.text}`}>
                    {r.prefix ?? ''}
                    {r.sub} {r.subSuffix ?? ''}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <RiAwardLine className="w-4 h-4 text-[var(--sys-warning)]" />
                  {t.moderatorLeaderboard}
                </span>
              }
              action={
                <Link href="/admin/users" className="tap-safe inline-flex items-center gap-1 text-xs text-[var(--sys-destructive)] font-medium hover:underline">
                  {locale === 'ar' ? 'الفريق' : 'View Team'}
                  <RiArrowRightLine className="icon-mirror h-4 w-4" aria-hidden />
                </Link>
              }
            />
            <CardContent className="p-0">
              <div className="divide-y divide-[var(--sys-border)]">
                {analytics?.moderatorLeaderboard?.map((mod: any, idx: number) => (
                  <div key={mod.id} className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${
                          idx === 0
                            ? 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] ring-2 ring-[var(--sys-warning)]/60'
                            : idx === 1
                            ? 'bg-[var(--sys-border)] text-[var(--sys-foreground)]'
                            : 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)]'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-[var(--sys-heading)]">{mod.name}</p>
                        <p className="text-xs text-[var(--sys-muted)]">
                          {mod.totalOrders} {locale === 'ar' ? 'طلب' : 'orders'} • {mod.confirmedOrders}{' '}
                          {locale === 'ar' ? 'مؤكد' : 'confirmed'}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <span className="text-xs font-bold text-[var(--sys-success)] bg-[var(--sys-success-soft)] border-0 px-2 py-0.5 rounded-full">
                        {mod.confirmationRate}%
                      </span>
                      <p className="text-xs font-semibold text-[var(--sys-foreground)] mt-1" dir="ltr">
                        <Money value={mod.sales} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

      <CreateOrderModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={loadAnalytics}
      />
      <AiOrderModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onSuccess={loadAnalytics}
      />
      <OrderDetailModal
        orderId={selectedOrderId}
        isOpen={!!selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        onRefresh={loadAnalytics}
      />
    </>
  );
}
