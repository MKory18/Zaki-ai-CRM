'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
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
import {
  DollarSign,
  TrendingUp,
  CheckCircle,
  Truck,
  Plus,
  Sparkles,
  Award,
  AlertTriangle,
  Flame,
  ArrowRight,
  Wallet,
  Boxes,
  Percent,
  ShoppingBag,
  Clock,
  XCircle,
  PackageCheck,
  Send,
  Minus,
  Plus as PlusIcon,
  Equal,
} from 'lucide-react';
import Link from 'next/link';

const PERIODS = [
  { key: 'today', ar: 'اليوم', en: 'Today' },
  { key: '7d', ar: '7 أيام', en: '7 Days' },
  { key: '30d', ar: '30 يوم', en: '30 Days' },
  { key: 'month', ar: 'هذا الشهر', en: 'This Month' },
  { key: 'all', ar: 'الكل', en: 'All' },
] as const;

export default function DashboardPage() {
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
    moderatorCommissions: 0, operationalExpenses: 0, netProfit: 0, profitMargin: 0,
  };
  const counts = analytics?.ordersCount ?? {
    total: 0, new: 0, contacting: 0, confirmed: 0,
    postponed: 0, rejected: 0, shipped: 0, delivered: 0,
  };
  const rates = analytics?.rates ?? { confirmationRate: 0, deliveryRate: 0 };

  const fmt = (n: number) =>
    `$${n.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const statusTiles = [
    { label: t.NEW, value: counts.new, color: 'text-[#b8256e]', dot: 'bg-[#b8256e]' },
    { label: t.CONTACTING, value: counts.contacting, color: 'text-[#b8256e]', dot: 'bg-[#13b5fe]' },
    { label: t.CONFIRMED, value: counts.confirmed, color: 'text-[#00c853]', dot: 'bg-[#00c853]' },
    { label: t.POSTPONED, value: counts.postponed, color: 'text-[#ffab00]', dot: 'bg-[#ffab00]' },
    { label: t.SHIPPED, value: counts.shipped, color: 'text-[#b8256e]', dot: 'bg-[#b8256e]' },
    { label: t.DELIVERED, value: counts.delivered, color: 'text-[#00c853]', dot: 'bg-[#00c853]' },
    { label: t.REJECTED, value: counts.rejected, color: 'text-[#fb323f]', dot: 'bg-[#fb323f]' },
  ];

  const rankings = [
    { icon: '🏆', label: locale === 'ar' ? 'الأكثر طلباً' : 'Most Requested', sub: analytics?.rankings?.mostRequested?.totalOrders ?? 0, subSuffix: locale === 'ar' ? 'طلب' : 'orders', name: analytics?.rankings?.mostRequested?.name, tint: 'bg-blue-50 border-[#f2c9dd]', text: 'text-[#b8256e]' },
    { icon: '💰', label: locale === 'ar' ? 'الأكثر ربحاً' : 'Most Profitable', sub: analytics?.rankings?.mostProfitable?.netProfit ?? 0, prefix: '+$', name: analytics?.rankings?.mostProfitable?.name, tint: 'bg-emerald-100', text: 'text-[#00c853]' },
    { icon: '🚚', label: locale === 'ar' ? 'الأكثر توصيلاً' : 'Most Delivered', sub: analytics?.rankings?.mostDelivered?.deliveredOrders ?? 0, subSuffix: locale === 'ar' ? 'توصيل' : 'delivered', name: analytics?.rankings?.mostDelivered?.name, tint: 'bg-amber-50 border-amber-100', text: 'text-[#c07f2a]' },
    { icon: '⚠️', label: locale === 'ar' ? 'الأكثر رفضاً' : 'Highest Rejections', sub: analytics?.rankings?.highestRejection?.rejectedOrders ?? 0, subSuffix: locale === 'ar' ? 'رفض' : 'rejected', name: analytics?.rankings?.highestRejection?.name, tint: 'bg-[#feecee] border-[#f5c6cb]', text: 'text-[#fb323f]' },
  ];

  const profitFlow = [
    { label: locale === 'ar' ? 'إيراد التوصيل' : 'Delivered Revenue', value: `+${fmt(fin.deliveredRevenue)}`, cls: 'text-[#00c853] bg-emerald-100 border-0' },
    { label: locale === 'ar' ? 'تكلفة البضاعة' : 'COGS', value: `-${fmt(fin.costOfGoodsSold)}`, cls: 'text-[#fb323f] bg-[#feecee] border-[#f5c6cb]' },
    { label: locale === 'ar' ? 'الشحن' : 'Shipping', value: `-${fmt(fin.shippingCosts)}`, cls: 'text-[#fb323f] bg-[#feecee] border-[#f5c6cb]' },
    { label: locale === 'ar' ? 'العمولات' : 'Commissions', value: `-${fmt(fin.moderatorCommissions)}`, cls: 'text-[#fb323f] bg-[#feecee] border-[#f5c6cb]' },
    { label: locale === 'ar' ? 'المصروفات' : 'Expenses', value: `-${fmt(fin.operationalExpenses)}`, cls: 'text-[#fb323f] bg-[#feecee] border-[#f5c6cb]' },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* ─── Header ─── */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">{t.dashboard}</h1>
            <p className="text-xs text-[#697586] mt-1">
              {locale === 'ar'
                ? 'متابعة المبيعات والتكاليف وأداء الفريق والأرباح الحقيقية — لحظة بلحظة'
                : 'Real-time sales, cost analysis, team performance & real net profit'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Period selector */}
            <div className="bg-white border border-[#e3e8ef] rounded-xl p-1 flex text-xs font-medium text-[#364152] shadow-xs">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    period === p.key ? 'bg-[#fb323f] text-white font-bold shadow-sm' : 'hover:bg-[#f8fafc]'
                  }`}
                >
                  {locale === 'ar' ? p.ar : p.en}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={() => setAiModalOpen(true)}
              className="items-center bg-emerald-50 text-[#00c853] border-[#bfe8d0] hover:bg-emerald-100"
            >
              <Sparkles className="w-4 h-4" />
              <span>إدخال بالذكاء الاصطناعي</span>
            </Button>

            <Button onClick={() => setCreateModalOpen(true)} className="bg-[#fb323f] hover:bg-[#fb323f]/85 items-center">
              <Plus className="w-4 h-4" />
              <span>طلب سريع</span>
            </Button>
          </div>
        </div>

        {/* ─── AI Executive Banner ─── */}
        {canFinance && (
          <div className="relative overflow-hidden bg-gradient-to-l rtl:bg-gradient-to-r from-[#b8256e] to-[#121926] rounded-2xl p-5 text-white shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-white/10 border border-white/15 shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                      {locale === 'ar' ? 'الملخص التنفيذي الذكي' : 'AI Business Intelligence'}
                    </span>
                    <span className="text-[10px] bg-white/15 px-2 py-0.5 rounded-full font-mono">
                      {locale === 'ar' ? 'مبني على بيانات حقيقية' : 'Grounded on real data'}
                    </span>
                  </div>
                  <p className="text-sm mt-1.5 max-w-3xl leading-relaxed text-white/90">
                    {locale === 'ar' ? (
                      <>
                        إيراد التوصيل <strong className="text-white">{fmt(fin.deliveredRevenue)}</strong> — صافي ربح حقيقي{' '}
                        <strong className="text-white">{fmt(fin.netProfit)}</strong> بهامش{' '}
                        <strong className="text-white">{fin.profitMargin}%</strong>. المنتج الأعلى ربحاً:{' '}
                        <strong className="text-white">{productName(analytics?.rankings?.mostProfitable, locale) || '—'}</strong>
                      </>
                    ) : (
                      <>
                        Delivered revenue <strong className="text-white">{fmt(fin.deliveredRevenue)}</strong> — real net profit{' '}
                        <strong className="text-white">{fmt(fin.netProfit)}</strong> at{' '}
                        <strong className="text-white">{fin.profitMargin}%</strong> margin. Top yield:{' '}
                        <strong className="text-white">{productName(analytics?.rankings?.mostProfitable, locale) || '—'}</strong>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <Link href="/ai-assistant" className="shrink-0">
                <Button size="sm" variant="secondary" className="bg-white text-[#b8256e] hover:bg-blue-50 border-0">
                  {locale === 'ar' ? 'المستشار الذكي' : 'AI Advisor'}
                  <ArrowRight className={`w-3.5 h-3.5 ${isRtl ? '' : 'rotate-180'}`} />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ─── KPI Cards ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {canFinance && (
            <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#697586]">{t.netProfit}</span>
                <div className="h-14 w-14 rounded-[8px] bg-emerald-100 text-[#00c853] flex items-center justify-center">
                  <Wallet className="w-6 h-6" />
                </div>
              </div>
              <div className="mt-2.5 text-2xl font-black text-[#121926]">{fmt(fin.netProfit)}</div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-[#00c853] border-0">
                  {fin.profitMargin}%
                </span>
                <span className="text-[11px] text-[#9ca3af]">{t.profitMargin}</span>
              </div>
            </div>
          )}

          {canFinance && (
            <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#697586]">{t.deliveredRevenue}</span>
                <div className="h-14 w-14 rounded-[8px] bg-blue-100 text-[#b8256e] flex items-center justify-center">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
              <div className="mt-2.5 text-2xl font-black text-[#121926]">{fmt(fin.deliveredRevenue)}</div>
              <p className="mt-1.5 text-[11px] text-[#9ca3af]">
                {counts.delivered} {locale === 'ar' ? 'طلب موصّل' : 'delivered orders'}
              </p>
            </div>
          )}

          <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#697586]">{t.confirmationRate}</span>
              <div className="h-14 w-14 rounded-[8px] bg-[#13b5fe]/10 text-[#13b5fe] flex items-center justify-center">
                <Percent className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-2.5 text-2xl font-black text-[#121926]">{rates.confirmationRate}%</div>
            <p className="mt-1.5 text-[11px] text-[#9ca3af]">
              {counts.confirmed} / {counts.total} {t.totalOrders}
            </p>
          </div>

          <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#697586]">{t.deliveryRate}</span>
              <div className="h-14 w-14 rounded-[8px] bg-amber-100 text-[#ffab00] flex items-center justify-center">
                <Truck className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-2.5 text-2xl font-black text-[#121926]">{rates.deliveryRate}%</div>
            <p className="mt-1.5 text-[11px] text-[#9ca3af]">
              {counts.delivered} / {counts.confirmed} {t.confirmedOrders}
            </p>
          </div>
        </div>

        {/* ─── Real Profit Flow (finance only) ─── */}
        {canFinance && (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#fb323f]" />
                  {locale === 'ar' ? 'معادلة صافي الربح الحقيقي' : 'Real Net Profit Breakdown'}
                </span>
              }
              subtitle={
                locale === 'ar'
                  ? 'محسوب من الطلبات الموصّلة فقط — مطروحاً منها التكاليف والشحن والعمولات والمصروفات'
                  : 'Delivered orders only — minus COGS, shipping, commissions and expenses'
              }
            />
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                {profitFlow.map((f, i) => (
                  <React.Fragment key={f.label}>
                    <div className={`flex-1 min-w-[110px] px-3 py-2.5 rounded-xl border text-center ${f.cls}`}>
                      <span className="block text-[10px] font-semibold opacity-75">{f.label}</span>
                      <span className="block text-sm font-black mt-0.5" dir="ltr">{f.value}</span>
                    </div>
                    {i < profitFlow.length - 1 && (
                      <Minus className="w-3.5 h-3.5 text-[#c3c8d4] shrink-0" />
                    )}
                  </React.Fragment>
                ))}
                <Equal className="w-4 h-4 text-[#9ca3af] shrink-0" />
                <div className="px-4 py-2.5 rounded-xl bg-[#b8256e] text-center">
                  <span className="block text-[10px] font-bold text-white/80">
                    {locale === 'ar' ? 'صافي الربح' : 'NET PROFIT'}
                  </span>
                  <span className="block text-base font-black text-white mt-0.5" dir="ltr">{fmt(fin.netProfit)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Order Status Tiles ─── */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
          {statusTiles.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-[#e3e8ef]/80 p-3.5 text-center shadow-xs">
              <span className={`inline-block w-2 h-2 rounded-full ${s.dot} mb-1.5`} />
              <span className="block text-[10px] font-semibold text-[#697586] leading-tight">{s.label}</span>
              <span className={`block text-xl font-black mt-1 ${s.value > 0 ? s.color : 'text-[#c3c8d4]'}`}>
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
                  <Flame className="w-4 h-4 text-[#fb323f]" />
                  {locale === 'ar' ? 'ترتيب المنتجات والأرباح' : 'Product Rankings & Profit'}
                </span>
              }
              action={
                <Link href="/products" className="text-xs text-[#fb323f] font-medium hover:underline">
                  {locale === 'ar' ? 'المنتجات ←' : 'View Products →'}
                </Link>
              }
            />
            <CardContent className="space-y-2.5">
              {rankings.map((r) => (
                <div key={r.label} className={`flex items-center justify-between p-3 rounded-xl border ${r.tint}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{r.icon}</span>
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-wide ${r.text}`}>{r.label}</p>
                      <p className="text-sm font-bold text-[#121926] line-clamp-1">
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
                  <Award className="w-4 h-4 text-[#ffab00]" />
                  {t.moderatorLeaderboard}
                </span>
              }
              action={
                <Link href="/moderators" className="text-xs text-[#fb323f] font-medium hover:underline">
                  {locale === 'ar' ? 'الفريق ←' : 'View Team →'}
                </Link>
              }
            />
            <CardContent className="p-0">
              <div className="divide-y divide-[#e3e8ef]">
                {analytics?.moderatorLeaderboard?.map((mod: any, idx: number) => (
                  <div key={mod.id} className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${
                          idx === 0
                            ? 'bg-amber-100 text-[#c07f2a] ring-2 ring-amber-300'
                            : idx === 1
                            ? 'bg-[#e8eaef] text-[#364152]'
                            : 'bg-[#f8fafc] text-[#697586]'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-[#121926]">{mod.name}</p>
                        <p className="text-[11px] text-[#9ca3af]">
                          {mod.totalOrders} {locale === 'ar' ? 'طلب' : 'orders'} • {mod.confirmedOrders}{' '}
                          {locale === 'ar' ? 'مؤكد' : 'confirmed'}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <span className="text-[11px] font-bold text-[#00c853] bg-emerald-100 border-0 px-2 py-0.5 rounded-full">
                        {mod.confirmationRate}%
                      </span>
                      <p className="text-[11px] font-semibold text-[#364152] mt-1" dir="ltr">
                        ${mod.sales.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Recent Orders ─── */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#fb323f]" />
                {t.recentOrders}
              </span>
            }
            action={
              <Link href="/orders">
                <Button variant="outline" size="sm">{t.orders}</Button>
              </Link>
            }
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3 text-start">{t.thOrderNumber}</th>
                    <th className="px-6 py-3 text-start">{t.thProduct}</th>
                    <th className="px-6 py-3 text-start">{t.thTotal}</th>
                    <th className="px-6 py-3 text-start">{t.status}</th>
                    <th className="px-6 py-3 text-start">{t.thModerator}</th>
                    <th className="px-6 py-3 text-start">{t.thDate}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {analytics?.orders?.slice(0, 8).map((order: any) => (
                    <tr
                      key={order.id}
                      className="hover:bg-[#f8fafc] transition-colors cursor-pointer"
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <td className="px-6 py-3 font-bold text-[#fb323f]">{order.orderNumber}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          <ProductThumb
                            src={order.productImageSnapshot || order.product?.image}
                            alt={order.productNameSnapshot || order.product?.name}
                            size="sm"
                          />
                          <div>
                            <p className="font-semibold text-[#121926] line-clamp-1 max-w-[200px]">
                              {order.productNameSnapshot || order.product?.name}
                            </p>
                            <p className="text-[11px] text-[#9ca3af]">
                              {order.customer?.fullName} • {order.quantity} {t.units}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 font-bold text-[#121926]" dir="ltr">
                        {fmt(order.totalAmount)}
                      </td>
                      <td className="px-6 py-3"><OrderStatusBadge status={order.status} /></td>
                      <td className="px-6 py-3 text-[#364152]">{order.moderator?.name || '—'}</td>
                      <td className="px-6 py-3 text-[#9ca3af] whitespace-nowrap">
                        {format(new Date(order.createdAt), 'MMM d, HH:mm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
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
    </AppLayout>
  );
}
