'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import { TrendingUp, Flame, AlertTriangle, Download, Calendar } from 'lucide-react';

export default function AnalyticsPage() {
  const { t } = useApp();
  const [period, setPeriod] = useState<'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last_month' | 'all'>('all');
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [period]);

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
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.analytics}</h1>
            <p className="text-xs text-slate-500 mt-1">
              Section 18 & 19 In-depth Product Profit Analysis, Rankings & Date Range Performance
            </p>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse flex-wrap gap-y-2">
            <div className="bg-white border border-slate-200 rounded-lg p-1 flex text-xs font-medium text-slate-600">
              {(['today', 'yesterday', '7d', '30d', 'month', 'last_month', 'all'] as const).map(
                (p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      period === p ? 'bg-red-600 text-white font-semibold' : 'hover:bg-slate-100'
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
          <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
            <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">
              🏆 Most Requested Product
            </span>
            <p className="font-bold text-slate-900 text-sm mt-1">
              {analytics?.rankings?.mostRequested?.name || 'N/A'}
            </p>
            <p className="text-xs text-red-600 font-semibold mt-0.5">
              {analytics?.rankings?.mostRequested?.totalOrders || 0} Orders
            </p>
          </div>

          <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
            <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">
              💰 Most Profitable Product
            </span>
            <p className="font-bold text-slate-900 text-sm mt-1">
              {analytics?.rankings?.mostProfitable?.name || 'N/A'}
            </p>
            <p className="text-xs text-red-600 font-semibold mt-0.5">
              +${analytics?.rankings?.mostProfitable?.netProfit?.toFixed(2) || '0.00'} Net Yield
            </p>
          </div>

          <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
            <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">
              ✅ Most Confirmed
            </span>
            <p className="font-bold text-slate-900 text-sm mt-1">
              {analytics?.rankings?.mostConfirmed?.name || 'N/A'}
            </p>
            <p className="text-xs text-red-600 font-semibold mt-0.5">
              {analytics?.rankings?.mostConfirmed?.confirmedOrders || 0} Confirmed
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
              🚚 Most Delivered
            </span>
            <p className="font-bold text-slate-900 text-sm mt-1">
              {analytics?.rankings?.mostDelivered?.name || 'N/A'}
            </p>
            <p className="text-xs text-amber-600 font-semibold mt-0.5">
              {analytics?.rankings?.mostDelivered?.deliveredOrders || 0} Delivered
            </p>
          </div>

          <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl">
            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
              ⚠️ Highest Rejections
            </span>
            <p className="font-bold text-slate-900 text-sm mt-1">
              {analytics?.rankings?.highestRejection?.name || 'N/A'}
            </p>
            <p className="text-xs text-rose-600 font-semibold mt-0.5">
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
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
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
                <tbody className="divide-y divide-slate-100">
                  {analytics?.productStats?.map((prod: any) => (
                    <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-slate-900 block">{prod.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">{prod.sku}</span>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-slate-800">{prod.totalOrders}</td>
                      <td className="px-6 py-3.5 font-bold text-red-600">
                        {prod.confirmedOrders}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-red-600">
                        {prod.deliveredOrders}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-rose-600">
                        {prod.rejectedOrders}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-slate-900">
                        ${prod.revenue.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-rose-600 font-medium">
                        -${prod.cogs.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-rose-600 font-medium">
                        -${prod.shippingCost.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 font-black text-red-700">
                        ${prod.netProfit.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded text-xs">
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
      </div>
    </AppLayout>
  );
}
