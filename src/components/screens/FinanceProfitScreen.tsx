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
              Section 17 Strict Financial Accounting: Real Delivered Profit, COGS, Shipping & Operational Expense Ledger
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => setExpenseModalOpen(true)}
            className="flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Record Business Expense</span>
          </Button>
        </div>

        {/* Real Profit KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Delivered Gross Revenue"
            value={`$${summary.totalRevenue.toFixed(2)}`}
            subtitle="Verified delivered orders only"
            icon={TrendingUp}
            color="blue"
          />
          <KpiCard
            title="Real Net Profit"
            value={`$${summary.netProfit.toFixed(2)}`}
            subtitle={`${summary.profitMargin}% Net Margin`}
            icon={DollarSign}
            color="emerald"
            trend={{ value: `${summary.profitMargin}%`, positive: summary.netProfit >= 0 }}
          />
          <KpiCard
            title="Product COGS"
            value={`$${summary.totalCOGS.toFixed(2)}`}
            subtitle="Batch-based production cost"
            icon={Receipt}
            color="amber"
          />
          <KpiCard
            title="Operating Expenses"
            value={`$${summary.totalOperationalExpenses.toFixed(2)}`}
            subtitle="Marketing, shipping & overhead"
            icon={ArrowDownRight}
            color="rose"
          />
        </div>

        {/* Financial Flow Equation */}
        <Card>
          <CardHeader
            title="Delivered Cash Flow Reconciliation"
            subtitle="Financial verification matching Section 17 of specification"
          />
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-center">
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-xs text-[#9ca3af] block">Gross Revenue</span>
                <span className="text-lg font-bold text-[#00c853] mt-1 block">
                  +${summary.totalRevenue.toFixed(2)}
                </span>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-xs text-[#9ca3af] block">COGS</span>
                <span className="text-lg font-bold text-[#fb323f] mt-1 block">
                  -${summary.totalCOGS.toFixed(2)}
                </span>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-xs text-[#9ca3af] block">Shipping & Comm.</span>
                <span className="text-lg font-bold text-[#fb323f] mt-1 block">
                  -${(summary.totalShipping + summary.totalCommissions).toFixed(2)}
                </span>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-xs text-[#9ca3af] block">Expenses</span>
                <span className="text-lg font-bold text-[#fb323f] mt-1 block">
                  -${summary.totalOperationalExpenses.toFixed(2)}
                </span>
              </div>
              <div className="bg-[#b8256e] p-3 rounded-xl">
                <span className="text-xs text-white/80 block font-bold">NET CASH PROFIT</span>
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
            title="Business Expenses Ledger"
            subtitle="Marketing campaigns, warehouse packaging supplies, commissions, and overhead"
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Expense Title</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Amount</th>
                    <th className="px-6 py-3.5">Notes</th>
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
      </div>

      {/* Record Expense Modal */}
      <Modal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        title="Record Operating Expense"
        subtitle="Deducted directly from company net profit calculations"
      >
        <form onSubmit={handleRecordExpense} className="space-y-4">
          <Input
            label="Expense Title *"
            placeholder="e.g. TikTok Ads Campaign #4"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Expense Category *"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="MARKETING">MARKETING (Ads, Influencers)</option>
              <option value="PACKAGING">PACKAGING (Boxes, Bubblewrap)</option>
              <option value="SHIPPING">SHIPPING (Courier fees)</option>
              <option value="COMMISSION">COMMISSION</option>
              <option value="SALARIES">SALARIES</option>
              <option value="OFFICE">OFFICE & UTILITIES</option>
              <option value="MANUFACTURING">MANUFACTURING</option>
              <option value="OTHER">OTHER</option>
            </Select>

            <Input
              label="Amount ($) *"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              required
            />
          </div>

          <Input
            label="Expense Date *"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />

          <Textarea
            label="Notes"
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
