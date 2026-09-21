'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, KpiCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Plus,
  ArrowDownRight,
  ShieldCheck,
  PieChart,
} from 'lucide-react';
import { format } from 'date-fns';

export function FinanceProfitScreen() {
  const { t } = useApp();
  const [data, setData] = useState<any>(null);
  // Per-product profit, from the endpoint that had no screen.
  const [profitability, setProfitability] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);

  // Expense Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [amount, setAmount] = useState(100);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  const loadFinance = async () => {
    setLoading(true);
    try {
      fetch('/api/finance/profitability?limit=20')
        .then((r) => (r.ok ? r.json() : { products: [] }))
        .then((d) => setProfitability(d.products ?? d ?? []))
        .catch(() => setProfitability([]));
      const res = await fetch('/api/finance');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinance();
  }, []);

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, amount, expenseDate, notes }),
      });
      if (res.ok) {
        setExpenseModalOpen(false);
        setTitle('');
        setNotes('');
        loadFinance();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setModalLoading(false);
    }
  };

  const summary = data?.summary || {
    totalRevenue: 0,
    totalCOGS: 0,
    totalShipping: 0,
    totalCommissions: 0,
    totalOperationalExpenses: 0,
    netProfit: 0,
    profitMargin: 0,
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">{t.finance}</h1>
            <p className="text-xs text-[#697586] mt-1">
              الربح من الموصَّل فقط — ناقص كلفة البضاعة والشحن والعمولات والمصاريف
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => setExpenseModalOpen(true)}
            className="flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>سجّل مصروفاً</span>
          </Button>
        </div>

        {/* Real Profit KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="إيراد الموصَّل"
            value={`$${summary.totalRevenue.toFixed(2)}`}
            subtitle="الطلبات المسلَّمة فعلاً، لا المؤكدة"
            icon={TrendingUp}
            color="blue"
          />
          <KpiCard
            title="صافي الربح"
            value={`$${summary.netProfit.toFixed(2)}`}
            subtitle={`هامش ${summary.profitMargin}%`}
            icon={DollarSign}
            color="emerald"
            trend={{ value: `${summary.profitMargin}%`, positive: summary.netProfit >= 0 }}
          />
          <KpiCard
            title="كلفة البضاعة"
            value={`$${summary.totalCOGS.toFixed(2)}`}
            subtitle="من كلفة التشغيلات — تُدخَل من شاشة التصنيع"
            icon={Receipt}
            color="amber"
          />
          <KpiCard
            title="المصاريف التشغيلية"
            value={`$${summary.totalOperationalExpenses.toFixed(2)}`}
            subtitle="إعلانات وشحن ورواتب وما إليها"
            icon={ArrowDownRight}
            color="rose"
          />
        </div>

        {/* Financial Flow Equation */}
        <Card>
          <CardHeader
            title="من أين جاء الربح"
            subtitle="كل رقم مطروح من الذي قبله — المجموع هو ما بقي فعلاً"
          />
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-center">
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-xs text-[#9ca3af] block">إيراد الموصَّل</span>
                <span className="text-lg font-bold text-[#00c853] mt-1 block">
                  +${summary.totalRevenue.toFixed(2)}
                </span>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-xs text-[#9ca3af] block">كلفة البضاعة</span>
                <span className="text-lg font-bold text-[#fb323f] mt-1 block">
                  -${summary.totalCOGS.toFixed(2)}
                </span>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-xs text-[#9ca3af] block">شحن وعمولات</span>
                <span className="text-lg font-bold text-[#fb323f] mt-1 block">
                  -${(summary.totalShipping + summary.totalCommissions).toFixed(2)}
                </span>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-xs text-[#9ca3af] block">مصاريف</span>
                <span className="text-lg font-bold text-[#fb323f] mt-1 block">
                  -${summary.totalOperationalExpenses.toFixed(2)}
                </span>
              </div>
              <div className="bg-[#b8256e] p-3 rounded-xl">
                <span className="text-xs text-white/80 block font-bold">الصافي</span>
                <span className="text-xl font-black text-white mt-1 block">
                  ${summary.netProfit.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expenses Ledger */}
        <Card>
          <CardHeader
            title="سجل المصاريف"
            subtitle="كل مصروف بتاريخه وبندِه — يُخصم مباشرة من صافي الربح"
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">التاريخ</th>
                    <th className="px-6 py-3.5">البند</th>
                    <th className="px-6 py-3.5">النوع</th>
                    <th className="px-6 py-3.5">المبلغ</th>
                    <th className="px-6 py-3.5">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {data?.expenses?.map((e: any) => (
                    <tr key={e.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-6 py-3.5 text-[#697586] font-mono">
                        {format(new Date(e.expenseDate), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[#121926]">{e.title}</td>
                      <td className="px-6 py-3.5">
                        <Badge variant="purple">{e.category}</Badge>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[#fb323f]">
                        ${e.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-[#697586] max-w-sm truncate">
                        {e.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Which products actually make money. The endpoint behind this was
            built and never connected, so the profit screen could say what the
            shop earned but not what earned it. */}
        <Card>
          <CardHeader title="ربحية المنتجات" subtitle="من الطلبات المسلَّمة — الإيراد ناقص كلفة البضاعة والشحن" />
          <CardContent className="p-0">
            {profitability === null ? (
              <p className="p-6 text-sm text-[#9aa4b2] text-center">جارٍ التحميل…</p>
            ) : profitability.length === 0 ? (
              <p className="p-6 text-sm text-[#9aa4b2] text-center">لا مبيعات مسلَّمة بعد.</p>
            ) : (
              <ul className="divide-y divide-[#e3e8ef]">
                {profitability.map((p: any) => (
                  <li key={p.id ?? p.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-xs">
                    <span className="font-semibold text-[#121926] min-w-[150px] truncate">{p.name}</span>
                    <span className="text-[#697586]">
                      طلبات: <span className="tabular-nums text-[#121926] font-semibold">{p.ordersCount}</span>
                    </span>
                    <span className="text-[#697586]">
                      مسلَّم: <span className="tabular-nums text-[#121926] font-semibold">{p.deliveredOrders}</span>
                    </span>
                    <span className="text-[#697586]">
                      إيراد: <span className="tabular-nums text-[#121926] font-semibold">{Number(p.revenue).toFixed(2)}</span>
                    </span>
                    <span className="ms-auto tabular-nums font-bold text-[#00a344]">
                      {Number(p.netProfit).toFixed(2)}
                      <span className="text-[10px] text-[#9aa4b2] font-normal">
                        {' '}صافي · {p.profitMargin ?? 0}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Record Expense Modal */}
      <Modal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        title="مصروف جديد"
        subtitle="يُخصم مباشرة من صافي ربح الشركة"
      >
        <form onSubmit={handleRecordExpense} className="space-y-4">
          <Input
            label="البند *"
            placeholder="مثلاً: حملة تيك توك رقم ٤"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="النوع *"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="MARKETING">تسويق وإعلانات</option>
              <option value="PACKAGING">تغليف</option>
              <option value="SHIPPING">شحن وتوصيل</option>
              <option value="COMMISSION">عمولات</option>
              <option value="SALARIES">رواتب</option>
              <option value="OFFICE">مكتب وخدمات</option>
              <option value="MANUFACTURING">تصنيع</option>
              <option value="OTHER">أخرى</option>
            </Select>

            <Input
              label="المبلغ *"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              required
            />
          </div>

          <Input
            label="التاريخ *"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />

          <Textarea
            label="ملاحظات"
            placeholder="e.g. Targeting Cairo/Alexandria campaign"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setExpenseModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={modalLoading}>
              Save Expense
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
