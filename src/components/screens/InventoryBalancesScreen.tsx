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
import { findRoute } from '@/lib/route-registry';

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
  const [term, setTerm] = useState('');

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

  const q = term.trim();
  const visible = q
    ? stockSummary.filter((s) => s.name.includes(q) || (s.sku || '').toUpperCase().includes(q.toUpperCase()))
    : stockSummary;

  const selected = stockSummary.find((s) => s.id === productId);
  const systemQty = selected?.remaining ?? 0;
  const difference = countedQuantity - systemQty;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--sys-heading)]">
              {findRoute('/inventory/balances')?.label}
            </h1>
            <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">
              كم بقي من كل منتج، وكم منه محجوز لطلبات لم تخرج بعد.
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

        {/* Every product and what it holds. 105 cards need a way in, so the
            search comes before them rather than after the scroll. */}
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-3">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ابحث باسم المنتج أو رمزه…"
            className="w-full min-w-0 h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
          <p className="mt-1.5 text-[10.5px] text-[var(--sys-muted-foreground)]">
            {visible.length} من {stockSummary.length} منتج
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {visible.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-bold text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] px-2 py-0.5 rounded-lg">
                      {s.sku}
                    </span>
                    <a
                      href={`/products/${s.id}`}
                      className="mt-1 block text-sm font-bold text-[var(--sys-heading)] hover:text-[var(--sys-primary)]"
                    >
                      {s.name}
                    </a>
                    {/* Which door adds to this one — the question you ask
                        the moment you see it is empty. */}
                    <span className="mt-1 inline-block rounded-full bg-[var(--sys-surface-strong)] px-2 py-0.5 text-[10px] font-semibold text-[var(--sys-foreground)]">
                      {s.sourceType === 'PURCHASED' ? 'جاهز — يُستلم' : 'مصنّع — تشغيلة'}
                    </span>
                  </div>
                  <Badge variant={s.remaining > 50 ? 'success' : 'danger'}>
                    {s.remaining > 50 ? 'متوفر' : 'رصيد منخفض'}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                  <div className="bg-[var(--sys-surface)] p-2 rounded-lg">
                    <span className="text-[var(--sys-muted)] block text-[10px]">دخل</span>
                    <span className="font-bold text-[var(--sys-heading)]">{s.produced}</span>
                  </div>
                  <div className="bg-[var(--sys-destructive-soft)] p-2 rounded-lg">
                    <span className="text-[var(--sys-destructive)] block text-[10px]">خرج</span>
                    <span className="font-bold text-[var(--sys-destructive)]">{s.sold}</span>
                  </div>
                  <div className="bg-[var(--sys-destructive-soft)] p-2 rounded-lg">
                    <span className="text-[var(--sys-destructive)] block text-[10px]">متبقٍّ</span>
                    <span className="font-black text-[var(--sys-destructive)]">{s.remaining}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* THE MOVEMENTS LOG IS NOT REDRAWN HERE.
            It was — the whole table, eight columns of it — while
            /inventory/movements existed as its own screen. So the same log
            appeared twice under two names, and nobody could tell which was
            the record. This screen answers "how much is left"; that one
            answers "what happened". */}
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4 text-sm text-[var(--sys-muted-foreground)]">
          تبحث عمّا دخل وما خرج ومن سجّله؟{' '}
          <a href="/inventory/movements" className="font-medium text-[var(--sys-primary)] hover:underline">
            سجل حركات المخزون
          </a>{' '}
          — هذه الشاشة تقول كم بقي، وتلك تقول ماذا حدث.
        </p>
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
              <label className="mb-1.5 block text-xs font-medium text-[var(--sys-heading)]">رصيد النظام</label>
              <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] px-3 py-2 text-sm font-bold tabular-nums text-[var(--sys-muted-foreground)]" dir="ltr">
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
            className={`rounded-lg border p-3 text-center ${
              difference === 0
                ? 'border-[var(--sys-border)] bg-[var(--sys-surface)]'
                : difference > 0
                  ? 'border-[var(--sys-success-soft)] bg-[var(--sys-success-soft)]'
                  : 'border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)]'
            }`}
          >
            <p className="text-[10px] font-medium text-[var(--sys-muted-foreground)]">الفرق الذي سيُسجَّل</p>
            <p
              className={`mt-0.5 text-lg font-black tabular-nums ${
                difference === 0 ? 'text-[var(--sys-muted-foreground)]' : difference > 0 ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'
              }`}
              dir="ltr"
            >
              {difference > 0 ? `+${difference}` : difference}
            </p>
            <p className="mt-0.5 text-[10.5px] text-[var(--sys-muted-foreground)]">
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

          {countError && <p className="text-xs text-[var(--sys-destructive)]">{countError}</p>}

          <p className="rounded-lg bg-[var(--sys-surface)] p-2.5 text-[10.5px] leading-relaxed text-[var(--sys-muted-foreground)]">
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
