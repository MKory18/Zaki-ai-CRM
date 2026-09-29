'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { BatchCostDialog, type BatchForCost } from '@/components/production/BatchCostDialog';
import { format } from 'date-fns';
import {
  RiAddCircleLine,
  RiCalculatorLine,
  RiDeleteBinLine,
  RiInboxArchiveLine,
  RiLightbulbLine,
  RiPriceTag3Line,
} from '@remixicon/react';
import { Money } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { batchTotal, batchUnitCost } from '@/lib/product-cost';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { HealthChip } from '@/components/ui/HealthChip';
import { ORIGIN, gradeBatch, readBatches, type BatchOrigin } from '@/lib/batch-grade';

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
  const [currency, setCurrency] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form State
  const [productId, setProductId] = useState('');
  // A batch entered with no cost prices its stock at zero and every
  // margin built on it is gross. This is where that gets fixed.
  const [costing, setCosting] = useState<BatchForCost | null>(null);
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

  /**
   * THE FIGURE ON SCREEN IS THE FIGURE THAT WILL BE STORED.
   *
   * This used to add the buckets and the lines here and divide to two
   * places, while the server records four — so the unit cost somebody
   * watched while typing could differ from the one written down. The same
   * two functions now, which are pure and import only types.
   */
  const { total: totalProductionCost } = batchTotal({
    manufacturingCost,
    packagingCost,
    rawMaterialCost,
    otherCosts,
    costLines,
  });
  const costPerUnit = String(batchUnitCost(totalProductionCost, quantityProduced));

  // This screen is the door for what you MAKE. A bought product listed here
  // would be entered as a run that never happened, with a cost breakdown
  // nobody can trace to any work — and the server refuses it anyway.
  const manufacturedProducts = products.filter((p: any) => p.sourceType !== 'PURCHASED');

  /**
   * WHICH DOOR EACH ROW CAME IN THROUGH, AND WHAT ITS COST ACTUALLY SAYS.
   *
   * The owner's note: «ليش المنتجات الجاهزة موجودة بتشغيلات الإنتاج». They
   * are here because a batch is the only place units live, so every door
   * that puts stock in opens one — receiving ready goods, the opening count,
   * a recount. Measured on this database: of 110 rows, 17 are runs, 4 are
   * receipts of ready goods and 89 are opening balances. So 93 rows on a
   * screen called «تشغيلات الإنتاج» were not production, unlabelled.
   *
   * Nothing is hidden — a hidden row is stock nobody can find. Each row now
   * says which door it came from, and the door's own link is beside it.
   */
  const graded: any[] = useMemo(
    () =>
      batches.map((b: any) => ({
        ...b,
        grade: gradeBatch({
          batchNumber: b.batchNumber,
          openingCountId: b.openingCountId,
          sourceType: b.product?.sourceType,
          quantityProduced: b.quantityProduced,
          costPerUnit: b.costPerUnit,
          totalProductionCost: b.totalProductionCost,
          manufacturingCost: b.manufacturingCost,
          packagingCost: b.packagingCost,
          rawMaterialCost: b.rawMaterialCost,
          otherCosts: b.otherCosts,
          costLines: b.costLines ?? [],
          // What we sell one for. Zero means this product has no price set,
          // and then the margin band is not scored rather than assumed.
          sellingPrice: b.product?.basePrice ?? null,
        }),
      })),
    [batches]
  );

  const reading = useMemo(() => readBatches(graded.map((g: any) => g.grade)), [graded]);

  const [door, setDoor] = useState<'ALL' | BatchOrigin>('ALL');

  // A filter on a door that no longer has rows is a dead end: the tab it
  // points at is not on the strip any more, so the list reads as empty with
  // nothing highlighted to click back out of. It falls back to «الكل».
  const openDoor: 'ALL' | BatchOrigin =
    door !== 'ALL' && !graded.some((g: any) => g.grade.origin === door) ? 'ALL' : door;

  const visible = useMemo(
    () => (openDoor === 'ALL' ? graded : graded.filter((g: any) => g.grade.origin === openDoor)),
    [graded, openDoor]
  );

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
        // The country's currency, from the server that knows which country
        // this store is in.
        if (bData.currency) setCurrency(bData.currency);
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
        <PageHeader title="تشغيلات الإنتاج"
            description="الباب الذي تدخل منه بضاعة المنتجات التي تصنّعها — كل تشغيلة ببنود كلفتها،
              ومنها تُحسب تكلفة الوحدة التي يقرأها الربح."
            actions={
              <>
          {/* The two doors this screen is next to, said out loud rather than
              left in the sidebar: the product itself, and the other door
              stock comes in through. «ضيف زر يوديني على المنتجات». */}
          <Link href="/products">
            <Button size="sm" variant="outline" className="flex items-center space-x-1.5">
              <RiPriceTag3Line className="w-4 h-4" />
              <span>المنتجات</span>
            </Button>
          </Link>
          <Link href="/inventory/receiving">
            <Button size="sm" variant="outline" className="flex items-center space-x-1.5">
              <RiInboxArchiveLine className="w-4 h-4" />
              <span>استلام بضاعة جاهزة</span>
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => {
              setBatchNumber(`BATCH-${new Date().getFullYear()}-${String(batches.length + 1).padStart(3, '0')}`);
              setCreateModalOpen(true);
            }}
            className="flex items-center space-x-1.5"
          >
            <RiAddCircleLine className="w-4 h-4" />
            <span>تشغيلة جديدة</span>
          </Button></>
            }
          />

        {/*
          THE READ OVER THE LIST — «تشغيلات الإنتاج: AI + Score», and there is
          no model behind either half of it.

          Every figure below is a count of the rows on this screen, so the
          owner can check any of them by counting. The alternative — a
          sentence a model wrote about his money — is a sentence he cannot
          check, and this screen decides what stock costs.
        */}
        {reading.headline && (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <RiLightbulbLine className="w-4 h-4 text-[var(--sys-warning)]" />
                  <span>قراءة هذه القائمة</span>
                </span>
              }
              subtitle="عدٌّ محسوب من صفوف هذه الشاشة نفسها — لا تخمين، ولا نموذج يكتبه"
            />
            <CardContent className="space-y-3">
              <p className="text-sm font-semibold leading-relaxed text-[var(--sys-heading)]">
                {reading.headline}
              </p>

              {/* Why a row that is not production is on the production
                  screen — the owner's question, answered per door, with the
                  door's own link so the row can be managed where it belongs. */}
              {reading.byOrigin
                .filter((o) => o.origin !== 'PRODUCED')
                .map((o) => (
                  <div
                    key={o.origin}
                    className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3"
                  >
                    <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--sys-heading)]">
                      <span>{ORIGIN[o.origin].ar}</span>
                      <span className="tabular-nums rounded-full bg-[var(--sys-surface-strong)] px-2 py-0.5">
                        {o.count}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDoor(o.origin)}
                        className="text-xs font-semibold text-[var(--sys-primary)] hover:underline"
                      >
                        اعرضها وحدها
                      </button>
                      {ORIGIN[o.origin].href && (
                        <Link
                          href={ORIGIN[o.origin].href as string}
                          className="text-xs font-semibold text-[var(--sys-primary)] hover:underline"
                        >
                          اذهب إلى بابها
                        </Link>
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
                      {ORIGIN[o.origin].why}
                    </p>
                  </div>
                ))}

              {reading.mismatched > 0 && (
                <p className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] p-3 text-xs leading-relaxed text-[var(--sys-destructive)]">
                  {reading.mismatched} دفعة كلفتها المحفوظة تخالف بنودها — عدّل كلفتها لتتفق الأرقام.
                </p>
              )}

              {reading.ungraded > 0 && (
                <p className="text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
                  {reading.ungraded} دفعة بلا درجة: لم يُقَس منها إلا وجود الكلفة، فلا بنود كلفة فيها
                  ولا سعر بيع للمنتج يُقارن به. درجةٌ مبنيّة على سؤال واحد ليست درجة — فلا تُمنَح.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Batch List Table */}
        <Card>
          <CardHeader
            title="تشغيلات الإنتاج وحساب التكلفة"
            subtitle="كل تشغيلة بكلفتها وكم بِيع منها وكم بقي — وتكلفة الوحدة محسوبة منها"
          />
          {/* The filter is a filter, not a hiding place: «الكل» is the default
              and every count is on the strip, so nothing is out of sight
              without the reader having chosen to put it there. */}
          {graded.length > 0 && reading.byOrigin.length > 1 && (
            <div className="px-3 pt-1">
              <Tabs
                value={openDoor}
                onChange={(k) => setDoor(k as 'ALL' | BatchOrigin)}
                tabs={[
                  { key: 'ALL', label: 'الكل', count: graded.length },
                  ...reading.byOrigin.map((o) => ({
                    key: o.origin,
                    label: ORIGIN[o.origin].ar,
                    count: o.count,
                  })),
                ]}
              />
            </div>
          )}
          <CardContent className="p-0">
            <div className="overflow-x-auto">
                            <Rows
                rows={visible}
                keyOf={(b) => b.id}
                columns={[
                  { key: 'c0', label: "رقم التشغيلة", primary: true,
                    render: (b) => (b.batchNumber) },
                  { key: 'origin', label: "من أي باب دخلت",
                    render: (b) => (
                  <><span
                          title={ORIGIN[b.grade.origin as BatchOrigin].why}
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                            b.grade.origin === 'PRODUCED'
                              ? 'border-[var(--sys-border)] bg-[var(--sys-surface)] text-[var(--sys-foreground)]'
                              : 'border-[var(--sys-warning)]/40 bg-[var(--sys-warning-soft)] text-[var(--sys-warning)]'
                          }`}
                        >
                          {ORIGIN[b.grade.origin as BatchOrigin].ar}
                        </span></>
                ) },
                  { key: 'c1', label: "المنتج", primary: true,
                    render: (b) => (
                  <><span className="font-semibold text-[var(--sys-heading)] block">{b.product?.name}</span>
                        <span className="text-xs text-[var(--sys-muted)] font-mono">{b.product?.sku}</span></>
                ) },
                  { key: 'c2', label: "أُنتج",
                    render: (b) => (
                  <>{b.quantityProduced} قطعة</>
                ) },
                  { key: 'c3', label: "بِيع",
                    render: (b) => (
                  <>{b.quantitySold} قطعة</>
                ) },
                  { key: 'c4', label: "متبقٍّ",
                    render: (b) => (
                  <><span className="font-bold text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] px-2 py-0.5 rounded-full">
                          {b.quantityRemaining} قطعة
                        </span></>
                ) },
                  { key: 'c5', label: "الكلفة الكلية",
                    render: (b) => (
                  <><Money value={b.totalProductionCost} currency={currency} /></>
                ) },
                  { key: 'c6', label: "كلفة الوحدة",
                    render: (b) => (
                  <>{b.costPerUnit > 0 ? (
                          <span className="font-black text-[var(--sys-heading)] bg-[var(--sys-surface)] px-2.5 py-1 rounded-md text-xs tabular-nums">
                            <Money value={b.costPerUnit} currency={currency} />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCosting(b)}
                            title="هذه التشغيلة بلا كلفة، فالربح المحسوب منها إجمالي لا صافي"
                            className="min-h-11 md:min-h-0 inline-flex items-center font-bold text-[var(--sys-warning)] bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/40 px-2.5 py-1 rounded-md text-xs hover:border-[var(--sys-warning)]"
                          >
                            بلا كلفة
                          </button>
                        )}</>
                ) },
                  {
                    key: 'grade',
                    label: 'درجة الكلفة',
                    // The reason is a sentence, so the cell is given a width
                    // to wrap inside rather than pushing a ten-column table
                    // sideways.
                    className: 'max-w-xs',
                    render: (b) => (
                      <>
                        <HealthChip health={b.grade} />
                        {/* The reason is printed, not hidden in a tooltip: a
                            grade nobody can see the arithmetic of is a grade
                            people argue with instead of acting on. */}
                        <span className="mt-1 block text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
                          {b.grade.why}
                        </span>
                        {b.grade.mismatch && (
                          <span className="mt-1 block text-xs font-semibold text-[var(--sys-destructive)]">
                            {b.grade.mismatch}
                          </span>
                        )}
                      </>
                    ),
                  },
                  { key: 'c7', label: "التاريخ",
                    render: (b) => (format(new Date(b.productionDate), 'd MMM yyyy')) },
                ]}
                empty={
                  graded.length > 0 ? (
                    <EmptyState
                      title="لا صفوفَ في هذا الباب"
                      why="المرشِّح أعلاه يعرض باباً واحداً. اختَر «الكل» لترى كل ما دخل المخزون."
                    />
                  ) : (
                    <EmptyState
                      title="لا تشغيلاتِ إنتاجٍ بعد"
                      why="التشغيلة هي ما يُحسب منه سعرُ الوحدة. بلا تشغيلةٍ بكلفة، الربحُ المحسوب إجماليٌّ لا صافٍ."
                    />
                  )
                }
                actions={(b) => (
                  <><button
                          type="button"
                          onClick={() => setCosting(b)}
                          className="text-xs text-[var(--sys-primary)] hover:underline whitespace-nowrap"
                        >
                          عدّل الكلفة
                        </button>
                        {/* From a row straight to the product it belongs to.
                            The stock, the weighted-average cost and the type
                            that decided which door this row came through are
                            all on that page — and reaching it used to mean
                            leaving for the sidebar and searching by name. */}
                        {b.productId && (
                          <Link
                            href={`/products/${b.productId}`}
                            className="text-xs text-[var(--sys-primary)] hover:underline whitespace-nowrap"
                          >
                            المنتج
                          </Link>
                        )}</>
                )}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {costing && (
        <BatchCostDialog batch={costing} onClose={() => setCosting(null)} onSaved={loadData} />
      )}

      {/* Production Batch Modal with Section 5 Live Formula RiCalculatorLine */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="تشغيلة إنتاج جديدة"
        subtitle="تكلفة الوحدة تُحسب تلقائياً من كل بنود الكلفة التي تدخلها"
        maxWidth="xl"
      >
        <form onSubmit={handleCreateBatch} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] text-[var(--sys-destructive)] text-xs rounded-lg">
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
          <div className="border border-[var(--sys-border)] rounded-lg p-4 bg-[var(--sys-surface)]/60 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--sys-foreground)]">
              تفصيل الكلفة المباشرة
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
            <div className="mt-4 border-t border-[var(--sys-border)] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-[var(--sys-foreground)]">بنود كلفة إضافية</p>
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
                <p className="text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
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
                        aria-label="حذف البند" title="حذف البند"
                        onClick={() => setCostLines(costLines.filter((_, n) => n !== i))}
                        className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 mb-1 cursor-pointer rounded-lg p-2 text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive-soft)]"
                      >
                        <RiDeleteBinLine className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 5 Live Real-time RiCalculatorLine Box */}
          <div className="p-4 bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <RiCalculatorLine className="w-5 h-5 text-[var(--sys-destructive)]" />
              <div>
                <p className="font-bold text-[var(--sys-heading)]">الكلفة الكلية: <Money value={totalProductionCost} /></p>
                <p className="text-[var(--sys-muted-foreground)]">
                  المعادلة: تصنيع ({manufacturingCost}) + تغليف ({packagingCost}) + مواد خام ({rawMaterialCost})
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[var(--sys-muted-foreground)] block">تكلفة الوحدة المحسوبة:</span>
              <span className="text-xl font-black text-[var(--sys-destructive)] block">
                <Money value={costPerUnit} />
              </span>
            </div>
          </div>

          <Textarea
            label="ملاحظات الدفعة وفحص الجودة"
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
              احفظ الدفعة وأضفها للمخزون
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
