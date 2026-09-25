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
import {
  Package,
  Plus,
  Layers,
  Tag,
  ImagePlus,
  X,
  Star,
  Trash2,
  ArrowUpRight,
  Search,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';

export function ProductsScreen() {
  const { t, locale } = useApp();
  const router = useRouter();
  const ask = useConfirm();
  const tell = useTell();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState(20);
  const [sourceType, setSourceType] = useState<'MANUFACTURED' | 'PURCHASED'>('MANUFACTURED');
  const [status, setStatus] = useState('ACTIVE');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search
  const [search, setSearch] = useState('');
  const filteredProducts = products.filter((p) => {
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
  const [editForm, setEditForm] = useState({ name: '', nameEn: '', sku: '', description: '', descriptionEn: '', basePrice: 0, status: 'ACTIVE' });
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

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

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
        body: JSON.stringify({ name, sku, description, basePrice, status, sourceType }),
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--sys-heading)]">{t.products}</h1>
            <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">
              كتالوج المنتجات مع الصور، تحليل تكاليف التصنيع متعدد التشغيلات والمخزون
            </p>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Link href="/manufacturing">
              <Button variant="outline" size="sm" className="flex items-center space-x-1">
                <Layers className="w-4 h-4" />
                <span>تشغيلات الإنتاج</span>
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center space-x-1.5 bg-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/85"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة منتج</span>
            </Button>
          </div>
        </div>

        {/* Products Table with Image Thumbnails */}
        <Card>
          <CardHeader
            title="جدول المنتجات"
            subtitle="الصور، المخزون، التكلفة، المبيعات والأرباح لكل منتج — عدّل أو احذف مباشرة"
          />
          <CardContent className="pt-4">
            {/* Search bar */}
            <div className="relative max-w-md mb-4">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sys-muted)]" />
              <input
                type="text"
                placeholder="بحث بالاسم (عربي/إنجليزي) أو SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full ps-9 pe-4 py-2.5 text-xs bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/30 focus:border-[var(--sys-primary)]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--sys-muted)] hover:text-[var(--sys-foreground)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <span className="absolute -bottom-5 start-1 text-[10px] text-[var(--sys-muted)]">
                {filteredProducts.length} من أصل {products.length} منتج
              </span>
            </div>
          </CardContent>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[var(--sys-surface)] border-b border-[var(--sys-border)] text-[var(--sys-muted-foreground)] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">الصورة</th>
                    <th className="px-6 py-3.5">اسم المنتج</th>
                    <th className="px-6 py-3.5">SKU</th>
                    <th className="px-6 py-3.5">الحالة</th>
                    <th className="px-6 py-3.5">المخزون</th>
                    <th className="px-6 py-3.5">التكلفة/وحدة</th>
                    <th className="px-6 py-3.5">المبيعات</th>
                    <th className="px-6 py-3.5 text-right rtl:text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sys-border)]">
                  {filteredProducts.map((p) => {
                    const img = primaryImageOf(p);
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-[var(--sys-surface)] transition-colors cursor-pointer"
                        onClick={() => router.push(`/products/${p.id}`)}
                      >
                        <td className="px-6 py-3">
                          <ProductThumb src={img?.url} alt={productName(p, locale)} size="md" />
                        </td>
                        <td className="px-6 py-3">
                          <span className="font-bold text-[var(--sys-heading)] block">{productName(p, locale)}</span>
                          <span className="text-[11px] text-[var(--sys-muted)]">
                            {p.images?.length || 0} صورة • {p.offers?.length || 0} عرض
                          </span>
                        </td>
                        <td className="px-6 py-3 font-mono text-[var(--sys-muted-foreground)]">{p.sku}</td>
                        <td className="px-6 py-3">
                          <Badge variant={p.status === 'ACTIVE' ? 'success' : 'warning'}>
                            {p.status === 'ACTIVE' ? 'نشط' : p.status === 'INACTIVE' ? 'غير نشط' : 'نفد المخزون'}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 font-bold text-[var(--sys-success)]">
                          {p.analytics?.totalRemaining ?? 0}
                        </td>
                        <td className="px-6 py-3 text-[var(--sys-heading)]">
                          ${p.analytics?.avgCostPerUnit?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-3 text-[var(--sys-primary)] font-medium">
                          {p.analytics?.totalSold ?? 0}
                        </td>
                        <td className="px-6 py-3 text-right rtl:text-left">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/products/${p.id}`)}
                              className="p-2"
                              title="التفاصيل والصور"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openEdit(p)}
                              className="p-2 bg-[var(--sys-surface)] text-[var(--sys-primary)] border-[var(--sys-primary-soft)] hover:bg-[var(--sys-surface-strong)]"
                              title="تعديل المنتج"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDelete(p)}
                              className="p-2"
                              title="حذف المنتج"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[var(--sys-muted)] text-xs">
                        {loading ? t.loading : 'لا توجد منتجات مطابقة للبحث.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--sys-foreground)]">1. المعلومات الأساسية</h4>
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
                    <span className="mt-0.5 block text-[10.5px] leading-relaxed text-[var(--sys-muted-foreground)]">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
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
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--sys-foreground)]">
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
                className="text-[11px]"
              >
                <ImagePlus className="w-3.5 h-3.5 ml-1 rtl:ml-0 rtl:mr-1" />
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
                      <span className="absolute top-1 left-1 rtl:left-auto rtl:right-1 bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] text-[9px] font-bold px-1.5 py-0.5 rounded-lg flex items-center space-x-0.5">
                        <Star className="w-2.5 h-2.5" />
                        <span>رئيسية</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute top-1 right-1 rtl:right-auto rtl:left-1 bg-[var(--sys-card)]/90 text-[var(--sys-destructive)] rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {primaryIndex !== idx && (
                      <button
                        type="button"
                        onClick={() => setPrimaryIndex(idx)}
                        className="absolute bottom-1 left-1 rtl:left-auto rtl:right-1 bg-[var(--sys-sidebar)]/60 text-[var(--sys-primary-foreground)] text-[9px] px-1.5 py-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
          <div className="p-3 bg-[var(--sys-surface)] border border-[var(--sys-primary-soft)] rounded-lg text-[11px] text-[var(--sys-primary)]">
            بعد إنشاء المنتج أضف تشغيلات الإنتاج من صفحة <Link href="/manufacturing" className="underline font-semibold">تشغيلات الإنتاج</Link> لحساب تكلفة الوحدة والمخزون تلقائياً.
          </div>

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" loading={modalLoading} className="bg-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/85">
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

          <Textarea label="الوصف بالعربية" rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          <Textarea label="الوصف بالإنجليزية" rows={2} dir="ltr" value={editForm.descriptionEn} onChange={(e) => setEditForm({ ...editForm, descriptionEn: e.target.value })} />

          {editProduct && (
            <div className="flex items-center gap-3 p-3 bg-[var(--sys-surface)] border border-[var(--sys-primary-soft)] rounded-lg">
              <ProductThumb
                src={editProduct.images?.find((i: any) => i.isPrimary)?.url || editProduct.images?.[0]?.url}
                size="md"
              />
              <div className="text-[11px] text-[var(--sys-primary)]">
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
              <Pencil className="w-4 h-4" />
              حفظ التعديلات
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
