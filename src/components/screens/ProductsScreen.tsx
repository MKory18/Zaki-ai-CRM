'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { useConfirm, useTell } from '@/components/ui/Confirm';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { useApp } from '@/context/AppContext';
import { productName } from '@/lib/product-name';
import Link from 'next/link';
import { RiAddCircleLine, RiArrowRightUpLine, RiCloseLine, RiDeleteBinLine, RiFoldersLine, RiImageAddLine, RiMedalLine, RiPencilLine, RiSearchLine, RiStarLine } from '@remixicon/react';
import { Money } from '@/components/ui/Money';
import { CategoryPicker } from '@/components/products/CategoryPicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Rows } from '@/components/ui/Rows';
import { HealthChip } from '@/components/ui/HealthChip';
import type { CatalogueReadiness, ProductGrade } from '@/lib/product-grade';

/**
 * What the grades route answers with, so the screen never guesses a shape.
 */
interface GradeAnswer {
  window: { start: string | null; end: string | null; days: number | null };
  minSample: number;
  salesVisible: boolean;
  costVisible: boolean;
  grades: ProductGrade[];
  readiness: CatalogueReadiness;
}

export function ProductsScreen() {
  const { t, locale } = useApp();
  const router = useRouter();
  const ask = useConfirm();
  const tell = useTell();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  /**
   * THE GRADE, FETCHED — NEVER COMPUTED HERE.
   *
   * Not one number in this column is worked out on this side: the delivery
   * rate, the margin, the value of a delivered order and every sentence
   * printed under them arrive from `/api/products/grades`, which reads the
   * orders and calls `product-grade.ts`. A screen that recomputed any of
   * them would be a second answer to the same question, which is how this
   * page came to print two different «متوسط تكلفة الوحدة» a fortnight ago.
   */
  const [gradeData, setGradeData] = useState<GradeAnswer | null>(null);

  /**
   * Whether this viewer was given costs at all — asked of the DATA, not of
   * the permissions. The server decides who may see what a thing cost
   * (src/lib/cost-visibility.ts); a copy of that rule here would be a
   * second answer to the same question, and one of the two would drift.
   */
  const showsCost = products.some((p) => p.analytics?.avgCostPerUnit !== undefined);

  // Create form state
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState(20);
  const [sourceType, setSourceType] = useState<'MANUFACTURED' | 'PURCHASED'>('MANUFACTURED');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [status, setStatus] = useState('ACTIVE');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // RiSearchLine
  const [search, setSearch] = useState('');
  /** Show only the products with no category — the backlog, one click away. */
  const [onlyUnfiled, setOnlyUnfiled] = useState(false);
  const uncategorised = products.filter((p) => !p.categoryId).length;

  const filteredProducts = products.filter((p) => {
    if (onlyUnfiled && p.categoryId) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.nameEn || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q)
    );
  });

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', nameEn: '', sku: '', description: '', descriptionEn: '', basePrice: 0, status: 'ACTIVE' , categoryId: null as string | null });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEdit = (p: any) => {
    setEditProduct(p);
    setEditForm({
      name: p.name || '',
      nameEn: p.nameEn || '',
      sku: p.sku || '',
      description: p.description || '',
      descriptionEn: p.descriptionEn || '',
      basePrice: p.basePrice || 0,
      categoryId: p.categoryId ?? null,
      status: p.status || 'ACTIVE',
    });
    setEditError(null);
    setEditOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProduct) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/products/${editProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditOpen(false);
      loadProducts();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (p: any) => {
    const ok = await ask({
      title: `حذف المنتج «${productName(p, locale)}» نهائياً؟`,
      body: 'ستُحذف صوره أيضاً، ولا يمكن التراجع.',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/products/${p.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        void tell({ title: 'تعذر حذف المنتج', body: data.error || 'فشل الحذف', tone: 'danger' });
        return;
      }
      loadProducts();
    } catch (err: any) {
      void tell({ title: 'تعذر حذف المنتج', body: err.message, tone: 'danger' });
    }
  };

  /**
   * The grade for exactly the products on screen — never for a set the list
   * is not showing, or the number beside a name would belong to another row.
   */
  const loadGrades = async (ids: string[]) => {
    setGradeData(null);
    if (ids.length === 0) return;
    try {
      const res = await fetch(`/api/products/grades?ids=${ids.join(',')}`);
      // A refusal here is the ordinary case for somebody who may see the
      // catalogue but not the reports — not a failure worth a red box over
      // the list.
      if (!res.ok) return;
      setGradeData(await res.json());
    } catch {
      // Same reasoning: the catalogue must render even when the grade cannot.
    }
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        const list: any[] = data.products || [];
        setProducts(list);
        void loadGrades(list.map((p) => p.id));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const gradeOf = (id: string): ProductGrade | undefined =>
    gradeData?.grades.find((g) => g.productId === id);

  useEffect(() => {
    loadProducts();
  }, []);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) && f.size <= 10 * 1024 * 1024
    );
    setSelectedFiles((prev) => [...prev, ...valid]);
    if (e.target.value) e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
    if (primaryIndex === idx) setPrimaryIndex(0);
    else if (primaryIndex > idx) setPrimaryIndex((p) => p - 1);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sku, description, basePrice, status, sourceType, categoryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const productId = data.product.id;

      // Upload selected images (first = primary)
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        selectedFiles.forEach((f) => formData.append('files', f));
        formData.append('isPrimary', 'true');
        const uploadRes = await fetch(`/api/products/${productId}/images`, {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) {
          const upData = await uploadRes.json();
          throw new Error(upData.error || 'فشل رفع الصور');
        }
      }

      setCreateModalOpen(false);
      setName('');
      setSku('');
      setDescription('');
      setSelectedFiles([]);
      setPrimaryIndex(0);
      loadProducts();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const primaryImageOf = (p: any) => p.images?.find((i: any) => i.isPrimary) || p.images?.[0];

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader title={t.products}
            description="كتالوج المنتجات مع الصور، تحليل تكاليف التصنيع متعدد التشغيلات والمخزون"
            actions={
              <><div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Link href="/manufacturing">
              <Button variant="outline" size="sm" className="flex items-center space-x-1">
                <RiFoldersLine className="w-4 h-4" />
                <span>تشغيلات الإنتاج</span>
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center space-x-1.5 bg-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/85"
            >
              <RiAddCircleLine className="w-4 h-4" />
              <span>إضافة منتج</span>
            </Button>
          </div></>
            }
          />

        {/*
          WHAT THE GRADE IS MADE OF, AND WHAT IS MISSING BEFORE IT SPEAKS.

          Measured on this record, the column can grade three products out of
          a hundred and fourteen: three clear the floor of ten confirmed
          orders and the fourth-busiest has eight. A column blank on a
          hundred and eleven rows teaches a reader that the feature is
          broken, so the screen says out loud how many rows are blank and for
          which of four reasons — and beside it the catalogue backlog, which
          is the part anybody can act on today: ninety products with no price
          cannot appear in the store at all.
        */}
        {gradeData && (
          <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <RiMedalLine className="w-4 h-4 text-[var(--sys-primary)]" />
              <h3 className="text-xs font-bold text-[var(--sys-heading)]">
                تقدير المنتجات: ممّا يُبنى، وما ينقص قبل أن ينطق
              </h3>
            </div>
            <p className="text-xs font-semibold text-[var(--sys-foreground)] leading-relaxed">
              {gradeData.readiness.why}
            </p>
            {gradeData.salesVisible && (
              <p className="text-xs text-[var(--sys-muted-foreground)] leading-relaxed">
                يُبنى على: {gradeData.readiness.madeOf.join('، ')}
                {gradeData.window.days !== null ? ` — عن طلبات آخر ${gradeData.window.days} يوماً` : ''} وفي المتجر
                المختار وحده، ولا يُعطى رقمٌ لمنتجٍ عيّنتُه أقلّ من {gradeData.minSample} طلباً مؤكَّداً.
                {!gradeData.costVisible && ' وكلفةُ البضاعة لا تُعرَض لهذا الحساب، فبندُ الهامش ساقطٌ من المجموع.'}
              </p>
            )}
            <p className="text-xs text-[var(--sys-muted)] leading-relaxed">
              لا يُستدعى أيُّ نموذجٍ في هذا الرقم. كلُّ جملةٍ هنا قالبٌ حول عددٍ مقروءٍ من السجل، والبندُ الذي لا
              يستطيع السجلُّ قياسَه يسقط من المجموع ويقول لماذا — ولا يُحسَب صفراً.
            </p>
          </div>
        )}

        {/* Products Table with Image Thumbnails */}
        <Card>
          <CardHeader
            title="جدول المنتجات"
            subtitle="الصور، المخزون، التكلفة، المبيعات والأرباح لكل منتج — عدّل أو احذف مباشرة"
          />
          <CardContent className="pt-4">
            {/* RiSearchLine bar */}
            <div className="relative max-w-md mb-4">
              <RiSearchLine className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sys-muted)]" />
              <input
                type="text"
                placeholder="بحث بالاسم (عربي/إنجليزي) أو SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 md:h-auto w-full ps-9 pe-4 md:py-2.5 text-xs bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/30 focus:border-[var(--sys-primary)]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="امسح البحث"
                  title="امسح البحث"
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--sys-muted)] hover:text-[var(--sys-foreground)] cursor-pointer"
                >
                  <RiCloseLine className="w-4 h-4" />
                </button>
              )}
              <span className="absolute -bottom-5 start-1 text-xs text-[var(--sys-muted)]">
                {filteredProducts.length} من أصل {products.length} منتج
              </span>
            </div>

            {/*
              THE BACKLOG, SAID OUT LOUD.
              A category decides who may see a product, how the reports group
              it, and what the assistant can answer about a line of goods —
              and 114 products carried none while the screen said nothing.
              One switch filters to exactly them, so filing is a sitting.
            */}
            {uncategorised > 0 && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setOnlyUnfiled((v) => !v)}
                  className={`min-h-11 md:min-h-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    onlyUnfiled
                      ? 'bg-[var(--sys-warning-soft)] border-[var(--sys-warning)] text-[var(--sys-warning)]'
                      : 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:border-[var(--sys-warning)] hover:text-[var(--sys-warning)]'
                  }`}
                >
                  <RiFoldersLine className="w-4 h-4" aria-hidden />
                  {onlyUnfiled ? 'أظهِر الكلّ' : `${uncategorised} منتجاً بلا تصنيف`}
                </button>
                <span className="ms-2 text-xs text-[var(--sys-muted)]">
                  التصنيف يحدّد من يرى المنتج، وكيف تُجمَّع تقاريره، وما يستطيع المساعد الإجابة عنه.
                </span>
              </div>
            )}
          </CardContent>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Rows
                rows={filteredProducts}
                keyOf={(p) => p.id}
                onRowClick={(p) => router.push(`/products/${p.id}`)}
                columns={[
                  {
                    key: 'image',
                    label: 'الصورة',
                    render: (p) => <ProductThumb src={primaryImageOf(p)?.url} alt={productName(p, locale)} size="md" />,
                  },
                  {
                    key: 'name',
                    label: 'اسم المنتج',
                    primary: true,
                    render: (p) => (
                      <>
                        <span className="block font-bold text-[var(--sys-heading)]">{productName(p, locale)}</span>
                        <span className="text-xs text-[var(--sys-muted)]">
                          {/* The shelf, where the name is — not a column of
                              its own. A category is how a product is FILED,
                              so it reads as part of what it is rather than
                              as another field to scan across. */}
                          {/*
                            AND «بلا تصنيف» WHEN THERE IS NONE.
                            Rendering nothing made 114 unfiled products look
                            exactly like 114 filed ones. A gap you cannot see
                            is a gap nobody closes.
                          */}
                          {p.category?.name ? (
                            <span className="text-[var(--sys-muted-foreground)]">{p.category.name} • </span>
                          ) : (
                            <span className="text-[var(--sys-warning)]">بلا تصنيف • </span>
                          )}
                          {p.images?.length || 0} صورة • {p.offers?.length || 0} عرض
                        </span>
                      </>
                    ),
                  },
                  {
                    key: 'sku',
                    label: 'SKU',
                    primary: true,
                    render: (p) => <span className="font-mono text-[var(--sys-muted-foreground)]">{p.sku}</span>,
                  },
                  {
                    key: 'status',
                    label: 'الحالة',
                    render: (p) => (
                      <Badge variant={p.status === 'ACTIVE' ? 'success' : 'warning'}>
                        {p.status === 'ACTIVE' ? 'نشط' : p.status === 'INACTIVE' ? 'غير نشط' : 'نفد المخزون'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'stock',
                    label: 'المخزون',
                    align: 'end',
                    render: (p) => (
                      <span className="font-bold tabular-nums text-[var(--sys-success)]">
                        {p.analytics?.totalRemaining ?? 0}
                      </span>
                    ),
                  },
                  /**
                   * THE COST COLUMN ONLY WHEN THE SERVER SENT A COST.
                   *
                   * It used to print `?? 0` for anyone the server withheld
                   * it from — a column of zeros, which is not «you may not
                   * see this» but «these cost nothing», and somebody would
                   * eventually quote it. The server decides (see
                   * cost-visibility.ts); this reads the answer rather than
                   * keeping a second copy of the rule.
                   */
                  ...(showsCost
                    ? [
                        {
                          key: 'cost',
                          label: 'التكلفة/وحدة',
                          align: 'end' as const,
                          render: (p: any) => <Money value={p.analytics?.avgCostPerUnit ?? 0} />,
                        },
                      ]
                    : []),
                  {
                    key: 'sold',
                    label: 'المبيعات',
                    align: 'end',
                    render: (p) => (
                      <span className="font-medium tabular-nums text-[var(--sys-primary)]">
                        {p.analytics?.totalSold ?? 0}
                      </span>
                    ),
                  },
                  /*
                    THE CHIP IS NEVER ALONE. «مقيَّم» on its own is the
                    opaque figure this system refuses everywhere else; the
                    sentence under it carries the counted numbers so the
                    reader can check it by hand, and the readiness line under
                    THAT is a second, independent fact — never added to the
                    first. A product can sell perfectly and still be missing
                    the price that would let the store show it.

                    The total is printed in the primary colour and given no
                    verdict colour of its own, exactly as the employees row
                    prints its own: there is no owner-set bar for a composite
                    out of seventy, and colouring it would be this screen
                    inventing one.
                  */
                  {
                    key: 'grade',
                    label: 'التقدير',
                    render: (p) => {
                      const g = gradeOf(p.id);
                      if (!g) return <span className="text-xs text-[var(--sys-muted)]">—</span>;
                      return (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <HealthChip health={{ tone: g.tone, label: g.label, why: g.why }} />
                            {g.score && g.score.total !== null && (
                              <span className="text-xs font-bold tabular-nums text-[var(--sys-primary)]">
                                {g.score.total}
                                <span className="font-normal text-[var(--sys-muted-foreground)]">
                                  {' '}
                                  / {g.score.possible}
                                </span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--sys-muted-foreground)] leading-relaxed">{g.why}</p>
                          {/* Every band that scored, with the fact it read —
                              so the total can be added up by hand. */}
                          {g.score?.bands
                            .filter((b) => b.points !== null)
                            .map((b) => (
                              <p key={b.key} className="text-xs text-[var(--sys-muted)] leading-relaxed">
                                {b.ar}: {b.points} / {b.weight} — {b.why}
                              </p>
                            ))}
                          <span className="inline-flex">
                            <HealthChip
                              health={{
                                tone: g.readiness.tone,
                                label: g.readiness.label,
                                why: g.readiness.why,
                              }}
                            />
                          </span>
                        </div>
                      );
                    },
                  },
                ]}
                actions={(p) => (
                  <span className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => router.push(`/products/${p.id}`)} className="p-2" title="التفاصيل والصور">
                      <RiArrowRightUpLine className="icon-mirror w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEdit(p)}
                      className="p-2 bg-[var(--sys-surface)] text-[var(--sys-primary)] border-[var(--sys-primary-soft)] hover:bg-[var(--sys-surface-strong)]"
                      title="تعديل المنتج"
                    >
                      <RiPencilLine className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(p)} className="p-2" title="حذف المنتج">
                      <RiDeleteBinLine className="w-4 h-4" />
                    </Button>
                  </span>
                )}
                empty={
                  loading ? (
                    <p className="py-12 text-center text-xs text-[var(--sys-muted-foreground)]">{t.loading}</p>
                  ) : (
                    <EmptyState
                      title={search ? `لا منتجَ يطابق «${search}»` : 'لا منتجات في هذا المتجر بعد'}
                      why={
                        search
                          ? 'البحث يقرأ الاسم العربيّ والإنجليزيّ وSKU. امسحه لترى الكتالوج كلّه.'
                          : 'بلا منتجٍ لا طلبَ ولا مخزونَ ولا صفحةَ هبوط. ابدأ بواحد.'
                      }
                      action={search ? { label: 'امسح البحث', onClick: () => setSearch('') } : undefined}
                    />
                  )
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Product Modal with Image Upload */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="إضافة منتج جديد"
        subtitle="المعلومات الأساسية + صور المنتج (رئيسية + إضافية)"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] text-[var(--sys-destructive)] text-xs rounded-lg">
              {modalError}
            </div>
          )}

          {/* Basic Information */}
          <div className="border border-[var(--sys-border)] rounded-lg p-4 bg-[var(--sys-surface)] space-y-3">
            <h4 className="text-xs font-bold text-[var(--sys-foreground)]">1. المعلومات الأساسية</h4>
            <Input
              label="اسم المنتج *"
              placeholder="مثال: كريم إزالة الندبات الألماني الأصلي"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="SKU *"
                placeholder="SCAR-DE-05"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                required
              />
              <Input
                label="السعر الأساسي ($)"
                type="number"
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
                required
              />
              <Select label="حالة المنتج" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ACTIVE">نشط</option>
                <option value="INACTIVE">غير نشط</option>
                <option value="OUT_OF_STOCK">نفد من المخزون</option>
              </Select>
            </div>

            {/* Which door this product's stock comes in through. Both write
                the same ledger; a ready-made good entered as a "production
                run" puts invented manufacturing costs into your cost
                reports, which is why it is asked once, here. */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--sys-heading)]">مصدر المنتج *</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  ['MANUFACTURED', 'نصنّعه', 'تشغيلة إنتاج ببنود كلفة — مواد، أجور، تغليف'],
                  ['PURCHASED', 'جاهز نشتريه', 'استلام بضاعة بسعر شراء للقطعة'],
                ] as const).map(([key, title, hint]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSourceType(key)}
                    className={`cursor-pointer rounded-lg border p-3 text-start transition ${
                      sourceType === key
                        ? 'border-[var(--sys-primary)] bg-[var(--sys-primary-soft)]'
                        : 'border-[var(--sys-border)] bg-[var(--sys-card)] hover:border-[var(--sys-primary)]/40'
                    }`}
                  >
                    <span className={`block text-sm font-bold ${sourceType === key ? 'text-[var(--sys-primary)]' : 'text-[var(--sys-heading)]'}`}>
                      {title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <CategoryPicker value={categoryId} onChange={setCategoryId} />

            <Textarea
              label="الوصف"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Product Images */}
          <div className="border border-[var(--sys-border)] rounded-lg p-4 bg-[var(--sys-surface)] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--sys-foreground)]">
                2. صور المنتج (الأولى = الصورة الرئيسية)
              </h4>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleFilesSelected}
                className="hidden"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                <RiImageAddLine className="w-4 h-4 ml-1 rtl:ml-0 rtl:mr-1" />
                اختيار صور
              </Button>
            </div>

            {selectedFiles.length === 0 ? (
              <div className="border-2 border-dashed border-[var(--sys-border)] rounded-lg p-6 text-center text-xs text-[var(--sys-muted)]">
                JPG / PNG / WEBP — حتى 10 ميجابايت للصورة
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className={`relative group rounded-lg overflow-hidden border-2 ${
                      primaryIndex === idx ? 'border-[var(--sys-primary)]' : 'border-[var(--sys-border)]'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-20 object-cover"
                    />
                    {primaryIndex === idx && (
                      <span className="absolute top-1 left-1 rtl:left-auto rtl:right-1 bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] text-xs font-bold px-1.5 py-0.5 rounded-lg flex items-center space-x-0.5">
                        <RiStarLine className="w-4 h-4" />
                        <span>رئيسية</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      aria-label="أزل الصورة"
                      title="أزل الصورة"
                      className="absolute top-1 right-1 rtl:right-auto rtl:left-1 bg-[var(--sys-card)]/90 text-[var(--sys-destructive)] rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <RiCloseLine className="w-4 h-4" />
                    </button>
                    {primaryIndex !== idx && (
                      <button
                        type="button"
                        onClick={() => setPrimaryIndex(idx)}
                        className="min-h-11 md:min-h-0 inline-flex items-center absolute bottom-1 left-1 rtl:left-auto rtl:right-1 bg-[var(--sys-sidebar)]/60 text-[var(--sys-primary-foreground)] text-xs px-1.5 py-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        رئيسية
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inventory info hint */}
          <div className="p-3 bg-[var(--sys-surface)] border border-[var(--sys-primary-soft)] rounded-lg text-xs text-[var(--sys-primary)]">
            بعد إنشاء المنتج أضف تشغيلات الإنتاج من صفحة <Link href="/manufacturing" className="underline font-semibold">تشغيلات الإنتاج</Link> لحساب تكلفة الوحدة والمخزون تلقائياً.
          </div>

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" loading={modalLoading}>
              حفظ المنتج
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Product Modal */}
      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title={`تعديل المنتج: ${editProduct ? productName(editProduct, locale) : ''}`}
        subtitle="غيّر الاسم بالعربية والإنجليزيɡ SKU، الحالة والوصف — الصور تُدار من صفحة التفاصيل"
        maxWidth="xl"
      >
        <form onSubmit={handleEditSave} className="space-y-4">
          {editError && (
            <div className="p-3 bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] text-[var(--sys-destructive)] text-xs rounded-lg">
              {editError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="الاسم بالعربية *" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            <Input label="الاسم بالإنجليزية" placeholder="English name" dir="ltr" value={editForm.nameEn} onChange={(e) => setEditForm({ ...editForm, nameEn: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="رمز SKU *" value={editForm.sku} onChange={(e) => setEditForm({ ...editForm, sku: e.target.value.toUpperCase() })} required />
            <Input label="السعر الأساسي ($)" type="number" step="0.01" value={editForm.basePrice} onChange={(e) => setEditForm({ ...editForm, basePrice: parseFloat(e.target.value) || 0 })} />
            <Select label="الحالة" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              <option value="ACTIVE">نشط</option>
              <option value="INACTIVE">غير نشط</option>
              <option value="OUT_OF_STOCK">نفد المخزون</option>
            </Select>
          </div>

          <CategoryPicker
            value={editForm.categoryId}
            onChange={(categoryId) => setEditForm({ ...editForm, categoryId })}
          />
          <Textarea label="الوصف بالعربية" rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          <Textarea label="الوصف بالإنجليزية" rows={2} dir="ltr" value={editForm.descriptionEn} onChange={(e) => setEditForm({ ...editForm, descriptionEn: e.target.value })} />

          {editProduct && (
            <div className="flex items-center gap-3 p-3 bg-[var(--sys-surface)] border border-[var(--sys-primary-soft)] rounded-lg">
              <ProductThumb
                src={editProduct.images?.find((i: any) => i.isPrimary)?.url || editProduct.images?.[0]?.url}
                size="md"
              />
              <div className="text-xs text-[var(--sys-primary)]">
                <p className="font-bold">إدارة الصور</p>
                <p>
                  {editProduct.images?.length || 0} صورة — للتعديل والتبديل والحذف افتح{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setEditOpen(false);
                      router.push(`/products/${editProduct.id}`);
                    }}
                    className="underline font-bold cursor-pointer"
                  >
                    صفحة تفاصيل المنتج
                  </button>
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-1">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" loading={editLoading} className="bg-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/85">
              <RiPencilLine className="w-4 h-4" />
              حفظ التعديلات
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
