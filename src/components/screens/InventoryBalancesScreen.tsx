'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { Boxes, ArrowDownUp, Plus, History } from 'lucide-react';
import { format } from 'date-fns';

export function InventoryBalancesScreen() {
  const { t } = useApp();
  const [stockSummary, setStockSummary] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);

  // Stock count. NOT a way to add stock: goods come in through production
  // or receiving, where they carry a cost. This is for when the shelf and
  // the system disagree, and you enter what you COUNTED — never a delta.
  // Typing a difference means doing the subtraction in your head at the one
  // moment you are already unsure of the number.
  const [productId, setProductId] = useState('');
  const [countedQuantity, setCountedQuantity] = useState(0);
  const [reason, setReason] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory');
      if (res.ok) {
        const data = await res.json();
        setStockSummary(data.stockSummary || []);
        setMovements(data.movements || []);
        if (data.stockSummary?.length > 0 && !productId) {
          setProductId(data.stockSummary[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setCountError(null);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recount', productId, countedQuantity, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذر تسجيل الجرد');
      setAdjustModalOpen(false);
      setReason('');
      loadData();
    } catch (e: any) {
      setCountError(e.message || 'تعذر تسجيل الجرد');
    } finally {
      setModalLoading(false);
    }
  };

  const selected = stockSummary.find((s) => s.id === productId);
  const systemQty = selected?.remaining ?? 0;
  const difference = countedQuantity - systemQty;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">{t.inventory}</h1>
            <p className="text-xs text-[#697586] mt-1">
              Section 6 Movement tracking: Production additions, delivery deductions, returns & adjustments
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => setAdjustModalOpen(true)}
            className="flex items-center space-x-1.5"
          >
            <ArrowDownUp className="w-4 h-4" />
            <span>جرد مخزون</span>
          </Button>
        </div>

        {/* Stock Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stockSummary.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#fb323f] bg-[#feecee] px-2 py-0.5 rounded">
                      {s.sku}
                    </span>
                    <h3 className="font-bold text-[#121926] text-sm mt-1">{s.name}</h3>
                  </div>
                  <Badge variant={s.remaining > 50 ? 'success' : 'danger'}>
                    {s.remaining > 50 ? 'In Stock' : 'Low Stock'}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                  <div className="bg-[#f8fafc] p-2 rounded-lg">
                    <span className="text-[#9ca3af] block text-[10px]">دخل</span>
                    <span className="font-bold text-[#121926]">{s.produced}</span>
                  </div>
                  <div className="bg-[#feecee] p-2 rounded-lg">
                    <span className="text-[#fb323f] block text-[10px]">خرج</span>
                    <span className="font-bold text-[#fb323f]">{s.sold}</span>
                  </div>
                  <div className="bg-[#feecee] p-2 rounded-lg">
                    <span className="text-[#fb323f] block text-[10px]">متبقٍّ</span>
                    <span className="font-black text-[#fb323f]">{s.remaining}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Inventory Movements Audit Table */}
        <Card>
          <CardHeader
            title="سجل حركات المخزون"
            subtitle="كل حركة: ما دخل، وما خرج مع تسليم، وما عاد مرتجعاً، وما صحّحه الجرد"
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">التاريخ</th>
                    <th className="px-6 py-3.5">المنتج</th>
                    <th className="px-6 py-3.5">الدفعة</th>
                    <th className="px-6 py-3.5">نوع الحركة</th>
                    <th className="px-6 py-3.5">التغيير</th>
                    <th className="px-6 py-3.5">الرصيد بعدها</th>
                    <th className="px-6 py-3.5">السبب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-6 py-3.5 text-[#697586] font-mono">
                        {format(new Date(m.createdAt), 'MMM d, h:mm a')}
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-[#121926]">
                        {m.product?.name}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-[#697586]">
                        {m.batch?.batchNumber || '—'}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge
                          variant={
                            m.type === 'PRODUCTION'
                              ? 'success'
                              : m.type === 'SALE'
                              ? 'info'
                              : 'purple'
                          }
                        >
                          {m.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 font-bold">
                        <span className={m.quantity > 0 ? 'text-[#fb323f]' : 'text-[#fb323f]'}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-[#121926]">
                        {m.balanceAfter}
                      </td>
                      <td className="px-6 py-3.5 text-[#697586] max-w-xs truncate">
                        {m.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock count. Adding stock is not possible here — goods enter
          through production or receiving, where they carry a cost. */}
      <Modal
        isOpen={adjustModalOpen}
        onClose={() => setAdjustModalOpen(false)}
        title="جرد مخزون"
        subtitle="عندما يختلف الرف عن النظام — تُدخل ما عددته، والفرق يُحسب ويُسجَّل"
      >
        <form onSubmit={handleAdjustStock} className="space-y-4">
          <Select
            label="المنتج *"
            value={productId}
            onChange={(e) => { setProductId(e.target.value); setCountedQuantity(0); }}
            required
          >
            {stockSummary.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.sku}) — النظام يقول {s.remaining}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#121926]">رصيد النظام</label>
              <div className="rounded-[8px] border border-[#e3e8ef] bg-[#f8fafc] px-3 py-2 text-sm font-bold tabular-nums text-[#697586]" dir="ltr">
                {systemQty}
              </div>
            </div>
            <Input
              label="الكمية المعدودة *"
              type="number"
              min="0"
              dir="ltr"
              value={countedQuantity}
              onChange={(e) => setCountedQuantity(parseInt(e.target.value, 10) || 0)}
              required
            />
          </div>

          {/* The difference is shown, not typed: it is the number that will
              actually be written, so it should be read before it is. */}
          <div
            className={`rounded-xl border p-3 text-center ${
              difference === 0
                ? 'border-[#e3e8ef] bg-[#f8fafc]'
                : difference > 0
                  ? 'border-[#bbf7d0] bg-[#f0fdf4]'
                  : 'border-[#fecdd1] bg-[#feecee]'
            }`}
          >
            <p className="text-[10px] font-medium text-[#697586]">الفرق الذي سيُسجَّل</p>
            <p
              className={`mt-0.5 text-lg font-black tabular-nums ${
                difference === 0 ? 'text-[#697586]' : difference > 0 ? 'text-[#15803d]' : 'text-[#be123c]'
              }`}
              dir="ltr"
            >
              {difference > 0 ? `+${difference}` : difference}
            </p>
            <p className="mt-0.5 text-[10.5px] text-[#697586]">
              {difference === 0
                ? 'الجرد مطابق — لن يُسجَّل شيء.'
                : difference > 0
                  ? 'وُجد أكثر مما يعرفه النظام — يدخل بتكلفة المخزون الحالي لا بصفر.'
                  : 'ناقص عن النظام — يُخصم من أقدم دفعة.'}
            </p>
          </div>

          <Textarea
            label="سبب الفرق *"
            placeholder="مثال: جرد نهاية الشهر، تالف أثناء التخزين، خطأ في تسجيل سابق…"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />

          {countError && <p className="text-xs text-rose-600">{countError}</p>}

          <p className="rounded-lg bg-[#f8fafc] p-2.5 text-[10.5px] leading-relaxed text-[#697586]">
            إضافة بضاعة جديدة لا تتم من هنا: ما تصنعه يدخل من «تشغيلات الإنتاج»
            ببنود كلفته، وما تشتريه جاهزاً من «استلام بضاعة جاهزة» بسعر شرائه.
            البضاعة التي تدخل بلا تكلفة تخفض متوسط التكلفة وتُظهر ربحاً لم يتحقق.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAdjustModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={modalLoading} disabled={difference === 0 || reason.trim().length < 3}>
              سجّل الجرد
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
