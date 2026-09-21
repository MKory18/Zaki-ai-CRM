'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import { TrendingUp, Flame, AlertTriangle, Download, Calendar, PhoneCall, Truck, Bike } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

export function PerformanceScreen() {
  const { t } = useApp();
  const [period, setPeriod] = useState<'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last_month' | 'all'>('all');
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Who is doing the work, and how well. The endpoints behind these were
  // built and never connected: this screen was a second copy of the
  // dashboard's analytics, and neither answered "which agent" or
  // "which courier".
  const [team, setTeam] = useState<any[] | null>(null);
  const [couriers, setCouriers] = useState<any[] | null>(null);

  useEffect(() => {
    loadData();
  }, [period]);

  useEffect(() => {
    apiJson<{ employees: any[] }>('/api/orders/confirmation/team')
      .then((d) => setTeam(d.employees ?? []))
      .catch(() => setTeam([]));
    apiJson<{ providers: any[] }>('/api/orders/shipping/performance')
      .then((d) => setCouriers(d.providers ?? []))
      .catch(() => setCouriers([]));
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?period=${period}`);
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
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">{t.analytics}</h1>
            <p className="text-xs text-[#697586] mt-1">
              Section 18 & 19 In-depth Product Profit Analysis, Rankings & Date Range Performance
            </p>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse flex-wrap gap-y-2">
            <div className="bg-white border border-[#e3e8ef] rounded-lg p-1 flex text-xs font-medium text-[#364152]">
              {(['today', 'yesterday', '7d', '30d', 'month', 'last_month', 'all'] as const).map(
                (p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      period === p ? 'bg-[#fb323f] text-white font-semibold' : 'hover:bg-[#f8fafc]'
                    }`}
                  >
                    {p.replace('_', ' ').toUpperCase()}
                  </button>
                )
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="flex items-center space-x-1"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Section 19 Rankings Showcase */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-[#feecee] border border-[#f5c6cb] p-4 rounded-xl">
            <span className="text-[10px] font-bold text-[#fb323f] uppercase tracking-wider block">
              🏆 Most Requested Product
            </span>
            <p className="font-bold text-[#121926] text-sm mt-1">
              {analytics?.rankings?.mostRequested?.name || 'N/A'}
            </p>
            <p className="text-xs text-[#fb323f] font-semibold mt-0.5">
              {analytics?.rankings?.mostRequested?.totalOrders || 0} Orders
            </p>
          </div>

          <div className="bg-[#feecee] border border-[#f5c6cb] p-4 rounded-xl">
            <span className="text-[10px] font-bold text-[#fb323f] uppercase tracking-wider block">
              💰 Most Profitable Product
            </span>
            <p className="font-bold text-[#121926] text-sm mt-1">
              {analytics?.rankings?.mostProfitable?.name || 'N/A'}
            </p>
            <p className="text-xs text-[#fb323f] font-semibold mt-0.5">
              +${analytics?.rankings?.mostProfitable?.netProfit?.toFixed(2) || '0.00'} Net Yield
            </p>
          </div>

          <div className="bg-[#feecee] border border-[#f5c6cb] p-4 rounded-xl">
            <span className="text-[10px] font-bold text-[#fb323f] uppercase tracking-wider block">
              ✅ Most Confirmed
            </span>
            <p className="font-bold text-[#121926] text-sm mt-1">
              {analytics?.rankings?.mostConfirmed?.name || 'N/A'}
            </p>
            <p className="text-xs text-[#fb323f] font-semibold mt-0.5">
              {analytics?.rankings?.mostConfirmed?.confirmedOrders || 0} Confirmed
            </p>
          </div>

          <div className="bg-amber-50 border border-[#f4dcb8] p-4 rounded-xl">
            <span className="text-[10px] font-bold text-[#c07f2a] uppercase tracking-wider block">
              🚚 Most Delivered
            </span>
            <p className="font-bold text-[#121926] text-sm mt-1">
              {analytics?.rankings?.mostDelivered?.name || 'N/A'}
            </p>
            <p className="text-xs text-[#ffab00] font-semibold mt-0.5">
              {analytics?.rankings?.mostDelivered?.deliveredOrders || 0} Delivered
            </p>
          </div>

          <div className="bg-[#feecee] border border-[#f5c6cb] p-4 rounded-xl">
            <span className="text-[10px] font-bold text-[#fb323f] uppercase tracking-wider block">
              ⚠️ Highest Rejections
            </span>
            <p className="font-bold text-[#121926] text-sm mt-1">
              {analytics?.rankings?.highestRejection?.name || 'N/A'}
            </p>
            <p className="text-xs text-[#fb323f] font-semibold mt-0.5">
              {analytics?.rankings?.highestRejection?.rejectedOrders || 0} Rejected
            </p>
          </div>
        </div>

        {/* Section 18: Product Profit Analysis Table */}
        <Card>
          <CardHeader
            title="Product Profit Analysis Ledger (Section 18)"
            subtitle="Accurate attribution of delivered revenue, batch COGS, shipping deduction, and net margin percentage"
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Product SKU</th>
                    <th className="px-6 py-3.5">Total Orders</th>
                    <th className="px-6 py-3.5">Confirmed</th>
                    <th className="px-6 py-3.5">Delivered</th>
                    <th className="px-6 py-3.5">Rejected</th>
                    <th className="px-6 py-3.5">Delivered Revenue</th>
                    <th className="px-6 py-3.5">COGS</th>
                    <th className="px-6 py-3.5">Shipping Cost</th>
                    <th className="px-6 py-3.5">Net Profit</th>
                    <th className="px-6 py-3.5">Profit Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {analytics?.productStats?.map((prod: any) => (
                    <tr key={prod.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-[#121926] block">{prod.name}</span>
                        <span className="font-mono text-[10px] text-[#9ca3af]">{prod.sku}</span>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[#121926]">{prod.totalOrders}</td>
                      <td className="px-6 py-3.5 font-bold text-[#fb323f]">
                        {prod.confirmedOrders}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[#fb323f]">
                        {prod.deliveredOrders}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[#fb323f]">
                        {prod.rejectedOrders}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[#121926]">
                        ${prod.revenue.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-[#fb323f] font-medium">
                        -${prod.cogs.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-[#fb323f] font-medium">
                        -${prod.shippingCost.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 font-black text-[#fb323f]">
                        ${prod.netProfit.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-[#fb323f] bg-[#feecee] px-2 py-0.5 rounded text-xs">
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
            subtitle="المعالَج = ما وصل إلى مؤكد أو مرفوض؛ ما زال قيد العمل لا يُحسب نجاحاً ولا فشلاً"
          />
          <CardContent className="p-0">
            {team === null ? (
              <p className="p-6 text-sm text-[#9aa4b2] text-center">جارٍ التحميل…</p>
            ) : team.length === 0 ? (
              <p className="p-6 text-sm text-[#9aa4b2] text-center">لا أحد استلم طلبات بعد.</p>
            ) : (
              <ul className="divide-y divide-[#e3e8ef]">
                {team.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#121926] min-w-[130px]">
                      <PhoneCall className="w-3.5 h-3.5 text-[#b8256e]" />
                      {e.name}
                    </span>
                    <Metric label="استلم" value={e.claimed} />
                    <Metric label="أكّد" value={e.confirmed} tone="text-[#00a344]" />
                    <Metric label="رفض" value={e.rejected} tone="text-[#fb323f]" />
                    <Metric label="لا يرد" value={e.noAnswer} />
                    <Metric label="قيد العمل" value={e.open} />
                    <span className="ms-auto tabular-nums font-bold text-[#121926]">
                      {e.confirmationRate === null ? '—' : `${e.confirmationRate}%`}
                      <span className="text-[10px] text-[#9aa4b2] font-normal"> نسبة التأكيد</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Couriers */}
        <Card>
          <CardHeader title="أداء شركات الشحن" subtitle="نسبة النجاح والمرتجعات ومتوسط زمن التوصيل" />
          <CardContent className="p-0">
            {couriers === null ? (
              <p className="p-6 text-sm text-[#9aa4b2] text-center">جارٍ التحميل…</p>
            ) : couriers.length === 0 ? (
              <p className="p-6 text-sm text-[#9aa4b2] text-center">لا شركات شحن بعد.</p>
            ) : (
              <ul className="divide-y divide-[#e3e8ef]">
                {couriers.map((c) => (
                  <li key={c.provider.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#121926] min-w-[130px]">
                      {c.provider.kind === 'AGENT' ? (
                        <Bike className="w-3.5 h-3.5 text-[#b8256e]" />
                      ) : (
                        <Truck className="w-3.5 h-3.5 text-[#9aa4b2]" />
                      )}
                      {c.provider.name}
                    </span>
                    <Metric label="مُسند" value={c.metrics.assigned} />
                    <Metric label="مُسلَّم" value={c.metrics.delivered} tone="text-[#00a344]" />
                    <Metric label="مرتجع" value={c.metrics.returned} tone="text-[#fb323f]" />
                    <Metric
                      label="متوسط التوصيل"
                      value={c.metrics.avgDeliveryHours === null ? '—' : `${c.metrics.avgDeliveryHours} س`}
                    />
                    <span className="ms-auto tabular-nums font-bold text-[#121926]">
                      {c.metrics.successRate ?? '—'}%
                      <span className="text-[10px] text-[#9aa4b2] font-normal"> نجاح</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <span className="text-[#697586]">
      {label}: <span className={`tabular-nums font-semibold ${tone ?? 'text-[#121926]'}`}>{value}</span>
    </span>
  );
}
