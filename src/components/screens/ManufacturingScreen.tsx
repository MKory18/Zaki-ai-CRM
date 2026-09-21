'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { Factory, Plus, Calculator, Calendar, Boxes, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

/**
 * The costs that keep coming back, offered instead of typed.
 *
 * Every run has a handful of the same lines, and typing them by hand each
 * time produces "اجرة عامل", "أجرة العامل" and "اجور عمال" on three batches
 * of the same product — three labels that no report can add together.
 * "أخرى" is still there for the one the list does not have.
 */
const COST_PRESETS = [
  'أجور عمال',
  'قالب',
  'شحن المواد الخام',
  'كهرباء ومحروقات',
  'إيجار ورشة',
  'ملصقات وطباعة',
  'فحص مخبري',
  'هالك وتالف',
  'نقل داخلي',
  'عمولة وسيط',
];

export function ManufacturingScreen() {
  const { t } = useApp();
  const [batches, setBatches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form State
  const [productId, setProductId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [quantityProduced, setQuantityProduced] = useState(1000);
  const [manufacturingCost, setManufacturingCost] = useState(2500);
  const [packagingCost, setPackagingCost] = useState(800);
  const [rawMaterialCost, setRawMaterialCost] = useState(700);
  const [otherCosts, setOtherCosts] = useState(0);
  // Free-form cost lines. Four fixed buckets never matched a real run —
  // they matched whatever fitted into four words — so a batch can name as
  // many costs as the work actually had.
  const [costLines, setCostLines] = useState<{ label: string; amount: number }[]>([]);
  const [notes, setNotes] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Dynamic live calculation
  const totalProductionCost =
    (manufacturingCost || 0) +
    (packagingCost || 0) +
    (rawMaterialCost || 0) +
    (otherCosts || 0) +
    costLines.reduce((sum, l) => sum + (l.amount || 0), 0);

  const costPerUnit =
    quantityProduced > 0 ? (totalProductionCost / quantityProduced).toFixed(2) : '0.00';

  // This screen is the door for what you MAKE. A bought product listed here
  // would be entered as a run that never happened, with a cost breakdown
  // nobody can trace to any work — and the server refuses it anyway.
  const manufacturedProducts = products.filter((p: any) => p.sourceType !== 'PURCHASED');

  const loadData = async () => {
    setLoading(true);
    try {
      const [bRes, pRes] = await Promise.all([
        fetch('/api/production'),
        fetch('/api/products'),
      ]);
      if (bRes.ok) {
        const bData = await bRes.json();
        setBatches(bData.batches || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setProducts(pData.products || []);
        if (pData.products?.length > 0 && !productId) {
          setProductId(pData.products[0].id);
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

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          batchNumber,
          quantityProduced,
          manufacturingCost,
          packagingCost,
          rawMaterialCost,
          otherCosts,
          costLines: costLines.filter((l) => l.label.trim()),
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCreateModalOpen(false);
      setBatchNumber('');
      setNotes('');
      loadData();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">تشغيلات الإنتاج</h1>
            <p className="text-xs text-[#697586] mt-1">
              الباب الذي تدخل منه بضاعة المنتجات التي تصنّعها — كل تشغيلة ببنود كلفتها،
              ومنها تُحسب تكلفة الوحدة التي يقرأها الربح.
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => {
              setBatchNumber(`BATCH-${new Date().getFullYear()}-${String(batches.length + 1).padStart(3, '0')}`);
              setCreateModalOpen(true);
            }}
            className="flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>تشغيلة جديدة</span>
          </Button>
        </div>

        {/* Batch List Table */}
        <Card>
          <CardHeader
            title="تشغيلات الإنتاج وحساب التكلفة"
            subtitle="كل تشغيلة بكلفتها وكم بِيع منها وكم بقي — وتكلفة الوحدة محسوبة منها"
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">رقم التشغيلة</th>
                    <th className="px-6 py-3.5">المنتج</th>
                    <th className="px-6 py-3.5">أُنتج</th>
                    <th className="px-6 py-3.5">بِيع</th>
                    <th className="px-6 py-3.5">متبقٍّ</th>
                    <th className="px-6 py-3.5">الكلفة الكلية</th>
                    <th className="px-6 py-3.5">كلفة الوحدة</th>
                    <th className="px-6 py-3.5">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {batches.map((b) => (
                    <tr key={b.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-6 py-3.5 font-bold font-mono text-[#fb323f]">
                        {b.batchNumber}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-semibold text-[#121926] block">{b.product?.name}</span>
                        <span className="text-[10px] text-[#9ca3af] font-mono">{b.product?.sku}</span>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[#121926]">
                        {b.quantityProduced} قطعة
                      </td>
                      <td className="px-6 py-3.5 text-[#fb323f] font-medium">
                        {b.quantitySold} قطعة
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-[#fb323f] bg-[#feecee] px-2 py-0.5 rounded-full">
                          {b.quantityRemaining} قطعة
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[#121926]">
                        ${b.totalProductionCost.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-black text-[#fb323f] bg-[#feecee] px-2.5 py-1 rounded-md text-xs">
                          ${b.costPerUnit.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-[#9ca3af]">
                        {format(new Date(b.productionDate), 'd MMM yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Production Batch Modal with Section 5 Live Formula Calculator */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="تشغيلة إنتاج جديدة"
        subtitle="تكلفة الوحدة تُحسب تلقائياً من كل بنود الكلفة التي تدخلها"
        maxWidth="xl"
      >
        <form onSubmit={handleCreateBatch} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-[#feecee] border border-[#f5c6cb] text-[#fb323f] text-xs rounded-lg">
              {modalError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="المنتج *"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              {manufacturedProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>

            <Input
              label="رقم التشغيلة *"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
              required
            />
          </div>

          <Input
            label="الكمية المنتَجة (قطعة) *"
            type="number"
            min="1"
            value={quantityProduced}
            onChange={(e) => setQuantityProduced(parseInt(e.target.value, 10) || 0)}
            required
          />

          {/* Cost Items Grid */}
          <div className="border border-[#e3e8ef] rounded-xl p-4 bg-[#f8fafc]/60 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152]">
              Direct Cost Breakdown ($)
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="كلفة التصنيع"
                type="number"
                step="0.01"
                value={manufacturingCost}
                onChange={(e) => setManufacturingCost(parseFloat(e.target.value) || 0)}
              />
              <Input
                label="كلفة التغليف"
                type="number"
                step="0.01"
                value={packagingCost}
                onChange={(e) => setPackagingCost(parseFloat(e.target.value) || 0)}
              />
              <Input
                label="كلفة المواد الخام"
                type="number"
                step="0.01"
                value={rawMaterialCost}
                onChange={(e) => setRawMaterialCost(parseFloat(e.target.value) || 0)}
              />
              <Input
                label="فحص الجودة / أخرى"
                type="number"
                step="0.01"
                value={otherCosts}
                onChange={(e) => setOtherCosts(parseFloat(e.target.value) || 0)}
              />
            </div>

            {/* Whatever else this run actually cost. A mould, a day of
                labour, the courier who brought the raw material — each with
                its own name, so the total can be explained a month later. */}
            <div className="mt-4 border-t border-[#e3e8ef] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-[#364152]">بنود كلفة إضافية</p>
                <div className="flex items-center gap-2">
                  <Select
                    className="text-xs"
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setCostLines([
                        ...costLines,
                        { label: e.target.value === 'أخرى' ? '' : e.target.value, amount: 0 },
                      ]);
                    }}
                    disabled={costLines.length >= 30}
                  >
                    <option value="">+ أضف بنداً…</option>
                    {COST_PRESETS.map((label) => (
                      <option key={label} value={label}>{label}</option>
                    ))}
                    <option value="أخرى">أخرى — أكتب الاسم بنفسي</option>
                  </Select>
                </div>
              </div>

              {costLines.length === 0 ? (
                <p className="text-[10.5px] leading-relaxed text-[#697586]">
                  اختياري — أضف أي كلفة لا تناسبها الخانات الأربع أعلاه: قالب، أجرة عامل،
                  شحن مواد، كهرباء. كل بند باسمه ومبلغه، ويدخل في المجموع وفي تكلفة الوحدة.
                </p>
              ) : (
                <div className="space-y-2">
                  {costLines.map((line, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <Input
                          label={i === 0 ? 'البند' : undefined}
                          placeholder="مثال: أجرة عامل"
                          value={line.label}
                          onChange={(e) =>
                            setCostLines(costLines.map((l, n) => (n === i ? { ...l, label: e.target.value } : l)))
                          }
                        />
                      </div>
                      <div className="w-32 shrink-0">
                        <Input
                          label={i === 0 ? 'كم كلّف' : undefined}
                          type="number"
                          step="0.01"
                          min="0"
                          dir="ltr"
                          value={line.amount}
                          onChange={(e) =>
                            setCostLines(
                              costLines.map((l, n) =>
                                n === i ? { ...l, amount: parseFloat(e.target.value) || 0 } : l
                              )
                            )
                          }
                        />
                      </div>
                      <button
                        type="button"
                        title="حذف البند"
                        onClick={() => setCostLines(costLines.filter((_, n) => n !== i))}
                        className="mb-1 cursor-pointer rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 5 Live Real-time Calculator Box */}
          <div className="p-4 bg-[#feecee] border border-[#f5c6cb] rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <Calculator className="w-5 h-5 text-[#fb323f]" />
              <div>
                <p className="font-bold text-[#121926]">الكلفة الكلية: {totalProductionCost.toFixed(2)}</p>
                <p className="text-[#697586]">
                  Formula: Mfg (${manufacturingCost}) + Packaging (${packagingCost}) + Raw (${rawMaterialCost})
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[#697586] block">تكلفة الوحدة المحسوبة:</span>
              <span className="text-xl font-black text-[#fb323f] block">
                ${costPerUnit}
              </span>
            </div>
          </div>

          <Textarea
            label="Batch Notes & Quality Control"
            placeholder="e.g. Amber glass vials, passed lab leak audit..."
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={modalLoading}>
              Save Batch & Add to Stock
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
