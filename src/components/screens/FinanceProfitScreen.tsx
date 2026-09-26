'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, KpiCard } from '@/components/ui/Card';
import { Money } from '@/components/ui/Money';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { findRoute, routeLabel } from '@/lib/route-registry';
import { format } from 'date-fns';
import { apiJson } from '@/lib/api-client';
import { ZERO_SUMMARY, type ProfitSummary } from '@/lib/profit-summary';
import { RiAddCircleLine, RiArrowRightDownLine, RiArrowUpCircleLine, RiFileList3Line, RiMoneyDollarCircleLine } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';

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

  /** The wallet the money leaves, and what the server said if it refused. */
  const [walletId, setWalletId] = useState('');
  const [wallets, setWallets] = useState<{ id: string; name: string; currencyCode: string }[]>([]);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  useEffect(() => {
    if (!expenseModalOpen || wallets.length > 0) return;
    apiJson<{ wallets: { id: string; name: string; currencyCode: string }[] }>('/api/finance/wallets')
      .then((d: { wallets: { id: string; name: string; currencyCode: string }[] }) => setWallets(d.wallets ?? []))
      .catch(() => setWallets([]));
  }, [expenseModalOpen, wallets.length]);

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, amount, expenseDate, notes, walletId }),
      });
      if (res.ok) {
        setExpenseModalOpen(false);
        setTitle('');
        setNotes('');
        setExpenseError(null);
        loadFinance();
      } else {
        // Said out loud. A form that closes on a refusal is a form somebody
        // believes worked, and an expense they never record again.
        const body = await res.json().catch(() => ({}));
        setExpenseError(body.error ?? 'تعذّر تسجيل المصروف');
      }
    } catch (e) {
      setExpenseError(e instanceof Error ? e.message : 'تعذّر تسجيل المصروف');
    } finally {
      setModalLoading(false);
    }
  };

  // The server's shape, not a second one written here. The hand-written
  // copy was missing `shippingAndCommissions`, and the line that reads it
  // took the whole screen down whenever the server did not answer.
  const summary: ProfitSummary = data?.summary ?? ZERO_SUMMARY;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader title={routeLabel('/finance/profit')}
            description="الربح من الموصَّل فقط — ناقص كلفة البضاعة والشحن والعمولات والمصاريف"
            actions={
              <><Button
            size="sm"
            onClick={() => setExpenseModalOpen(true)}
            className="flex items-center space-x-1.5"
          >
            <RiAddCircleLine className="w-4 h-4" />
            <span>سجّل مصروفاً</span>
          </Button></>
            }
          />

        {/* Real Profit KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="إيراد الموصَّل"
            value={<Money value={summary.totalRevenue} currency={data?.currency} />}
            subtitle="الطلبات المسلَّمة فعلاً، لا المؤكدة"
            icon={RiArrowUpCircleLine}
          />
          <KpiCard
            title="صافي الربح"
            value={<Money value={summary.netProfit} currency={data?.currency} />}
            subtitle={`هامش ${summary.profitMargin}%`}
            icon={RiMoneyDollarCircleLine}
          />
          <KpiCard
            title="كلفة البضاعة"
            value={<Money value={summary.totalCOGS} currency={data?.currency} />}
            subtitle="من كلفة التشغيلات — تُدخَل من شاشة التصنيع"
            icon={RiFileList3Line}
          />
          <KpiCard
            title="المصاريف التشغيلية"
            value={<Money value={summary.totalOperationalExpenses} currency={data?.currency} />}
            subtitle="إعلانات وشحن ورواتب وما إليها"
            icon={RiArrowRightDownLine}
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
              <div className="bg-[var(--sys-surface)] p-3 rounded-lg">
                <span className="text-xs text-[var(--sys-muted)] block">إيراد الموصَّل</span>
                <span className="text-lg font-bold text-[var(--sys-success)] mt-1 block">
                  +<Money value={summary.totalRevenue} currency={data?.currency} />
                </span>
              </div>
              <div className="bg-[var(--sys-surface)] p-3 rounded-lg">
                <span className="text-xs text-[var(--sys-muted)] block">كلفة البضاعة</span>
                <span className="text-lg font-bold text-[var(--sys-destructive)] mt-1 block">
                  −<Money value={summary.totalCOGS} currency={data?.currency} />
                </span>
              </div>
              <div className="bg-[var(--sys-surface)] p-3 rounded-lg">
                <span className="text-xs text-[var(--sys-muted)] block">شحن وعمولات</span>
                <span className="text-lg font-bold text-[var(--sys-destructive)] mt-1 block">
                  {/* Read, not computed. A total assembled in the browser
                      disagrees with the books the moment a rule changes. */}
                  −<Money value={summary.shippingAndCommissions} currency={data?.currency} />
                </span>
              </div>
              <div className="bg-[var(--sys-surface)] p-3 rounded-lg">
                <span className="text-xs text-[var(--sys-muted)] block">مصاريف</span>
                <span className="text-lg font-bold text-[var(--sys-destructive)] mt-1 block">
                  −<Money value={summary.totalOperationalExpenses} currency={data?.currency} />
                </span>
              </div>
              <div className="bg-[var(--sys-primary)] p-3 rounded-lg">
                <span className="text-xs text-[var(--sys-primary-foreground)]/80 block font-bold">الصافي</span>
                <span className="text-xl font-black text-[var(--sys-primary-foreground)] mt-1 block">
                  <Money value={summary.netProfit} currency={data?.currency} />
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
                <thead className="bg-[var(--sys-surface)] border-b border-[var(--sys-border)] text-[var(--sys-muted-foreground)] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">التاريخ</th>
                    <th className="px-6 py-3.5">البند</th>
                    <th className="px-6 py-3.5">النوع</th>
                    <th className="px-6 py-3.5">المبلغ</th>
                    <th className="px-6 py-3.5">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sys-border)]">
                  {data?.expenses?.map((e: any) => (
                    <tr key={e.id} className="hover:bg-[var(--sys-surface)] transition-colors">
                      <td className="px-6 py-3.5 text-[var(--sys-muted-foreground)] font-mono">
                        {format(new Date(e.expenseDate), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[var(--sys-heading)]">{e.title}</td>
                      <td className="px-6 py-3.5">
                        <Badge variant="purple">{e.category}</Badge>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[var(--sys-destructive)]">
                        <Money value={e.amount} currency={data?.currency} />
                      </td>
                      <td className="px-6 py-3.5 text-[var(--sys-muted-foreground)] max-w-sm truncate">
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
              <p className="p-6 text-sm text-[var(--sys-muted)] text-center">جارٍ التحميل…</p>
            ) : profitability.length === 0 ? (
              <p className="p-6 text-sm text-[var(--sys-muted)] text-center">لا مبيعات مسلَّمة بعد.</p>
            ) : (
              <ul className="divide-y divide-[var(--sys-border)]">
                {profitability.map((p: any) => (
                  <li key={p.id ?? p.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-xs">
                    <span className="font-semibold text-[var(--sys-heading)] min-w-[150px] truncate">{p.name}</span>
                    <span className="text-[var(--sys-muted-foreground)]">
                      طلبات: <span className="tabular-nums text-[var(--sys-heading)] font-semibold">{p.ordersCount}</span>
                    </span>
                    <span className="text-[var(--sys-muted-foreground)]">
                      مسلَّم: <span className="tabular-nums text-[var(--sys-heading)] font-semibold">{p.deliveredOrders}</span>
                    </span>
                    <span className="text-[var(--sys-muted-foreground)]">
                      إيراد: <Money value={p.revenue} currency={data?.currency} className="text-[var(--sys-heading)] font-semibold" />
                    </span>
                    <span className="ms-auto tabular-nums font-bold text-[var(--sys-success)]">
                      <Money value={p.netProfit} currency={data?.currency} />
                      <span className="text-xs text-[var(--sys-muted)] font-normal">
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
            placeholder="مثلاً: حملة تيك توك رقم 4"
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

          {/* WHICH WALLET THE MONEY LEFT.
              Required by the server. An expense with no wallet was money
              gone from the company and absent from the wallet ledger, so
              the daily closing showed a shortfall nobody could explain —
              and somebody wrote an explanation for an expense that was
              already recorded here. */}
          <Select
            label="من محفظة *"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            required
          >
            <option value="">اختر المحفظة…</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.currencyCode})
              </option>
            ))}
          </Select>

          {expenseError && (
            <p className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] p-2.5 text-xs text-[var(--sys-destructive)]">
              {expenseError}
            </p>
          )}

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
