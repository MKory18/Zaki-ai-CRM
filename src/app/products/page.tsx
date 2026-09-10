'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
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

export default function ProductsPage() {
  const { t, locale } = useApp();
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState(20);
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
    if (!confirm(`حذف المنتج "${productName(p, locale)}" نهائياً؟\nسيتم حذف صوره أيضاً. لا يمكن التراجع.`)) return;
    try {
      const res = await fetch(`/api/products/${p.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'فشل الحذف');
        return;
      }
      loadProducts();
    } catch (err: any) {
      alert(err.message);
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
        body: JSON.stringify({ name, sku, description, basePrice, status }),
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
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">{t.products}</h1>
            <p className="text-xs text-[#697586] mt-1">
              كتالوج المنتجات مع الصور، تحليل تكاليف التصنيع متعدد التشغيلات والمخزون
            </p>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Link href="/production">
              <Button variant="outline" size="sm" className="flex items-center space-x-1">
                <Layers className="w-4 h-4" />
                <span>تشغيلات الإنتاج</span>
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center space-x-1.5 bg-[#fb323f] hover:bg-[#fb323f]/85"
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
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
              <input
                type="text"
                placeholder="بحث بالاسم (عربي/إنجليزي) أو SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full ps-9 pe-4 py-2.5 text-xs bg-[#f8fafc] border border-[#e3e8ef] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#364152] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <span className="absolute -bottom-5 start-1 text-[10px] text-[#9ca3af]">
                {filteredProducts.length} من أصل {products.length} منتج
              </span>
            </div>
          </CardContent>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
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
                <tbody className="divide-y divide-[#e3e8ef]">
                  {filteredProducts.map((p) => {
                    const img = primaryImageOf(p);
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-[#f8fafc] transition-colors cursor-pointer"
                        onClick={() => router.push(`/products/${p.id}`)}
                      >
                        <td className="px-6 py-3">
                          <ProductThumb src={img?.url} alt={productName(p, locale)} size="md" />
                        </td>
                        <td className="px-6 py-3">
                          <span className="font-bold text-[#121926] block">{productName(p, locale)}</span>
                          <span className="text-[11px] text-[#9ca3af]">
                            {p.images?.length || 0} صورة • {p.offers?.length || 0} عرض
                          </span>
                        </td>
                        <td className="px-6 py-3 font-mono text-[#697586]">{p.sku}</td>
                        <td className="px-6 py-3">
                          <Badge variant={p.status === 'ACTIVE' ? 'success' : 'warning'}>
                            {p.status === 'ACTIVE' ? 'نشط' : p.status === 'INACTIVE' ? 'غير نشط' : 'نفد المخزون'}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 font-bold text-[#00c853]">
                          {p.analytics?.totalRemaining ?? 0}
                        </td>
                        <td className="px-6 py-3 text-[#121926]">
                          ${p.analytics?.avgCostPerUnit?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-3 text-[#b8256e] font-medium">
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
                              className="p-2 bg-blue-50 text-[#b8256e] border-[#f2c9dd] hover:bg-blue-100"
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
                      <td colSpan={8} className="py-12 text-center text-[#9ca3af] text-xs">
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
            <div className="p-3 bg-[#feecee] border border-[#f5c6cb] text-[#fb323f] text-xs rounded-lg">
              {modalError}
            </div>
          )}

          {/* Basic Information */}
          <div className="border border-[#e3e8ef] rounded-xl p-4 bg-[#f8fafc] space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152]">1. المعلومات الأساسية</h4>
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
            <Textarea
              label="الوصف"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Product Images */}
          <div className="border border-[#e3e8ef] rounded-xl p-4 bg-[#f8fafc] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152]">
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
              <div className="border-2 border-dashed border-[#e2e5ec] rounded-xl p-6 text-center text-xs text-[#9ca3af]">
                JPG / PNG / WEBP — حتى 10 ميجابايت للصورة
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className={`relative group rounded-xl overflow-hidden border-2 ${
                      primaryIndex === idx ? 'border-[#b8256e]' : 'border-[#e3e8ef]'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-20 object-cover"
                    />
                    {primaryIndex === idx && (
                      <span className="absolute top-1 left-1 rtl:left-auto rtl:right-1 bg-[#fb323f] text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center space-x-0.5">
                        <Star className="w-2.5 h-2.5" />
                        <span>رئيسية</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute top-1 right-1 rtl:right-auto rtl:left-1 bg-white/90 text-[#fb323f] rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {primaryIndex !== idx && (
                      <button
                        type="button"
                        onClick={() => setPrimaryIndex(idx)}
                        className="absolute bottom-1 left-1 rtl:left-auto rtl:right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
          <div className="p-3 bg-blue-50 border border-[#f2c9dd] rounded-xl text-[11px] text-[#b8256e]">
            بعد إنشاء المنتج أضف تشغيلات الإنتاج من صفحة <Link href="/production" className="underline font-semibold">تشغيلات الإنتاج</Link> لحساب تكلفة الوحدة والمخزون تلقائياً.
          </div>

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" loading={modalLoading} className="bg-[#fb323f] hover:bg-[#fb323f]/85">
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
            <div className="p-3 bg-[#feecee] border border-[#f5c6cb] text-[#fb323f] text-xs rounded-xl">
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
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-[#f2c9dd] rounded-xl">
              <ProductThumb
                src={editProduct.images?.find((i: any) => i.isPrimary)?.url || editProduct.images?.[0]?.url}
                size="md"
              />
              <div className="text-[11px] text-[#b8256e]">
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
            <Button type="submit" loading={editLoading} className="bg-[#b8256e] hover:bg-[#b8256e]/85">
              <Pencil className="w-4 h-4" />
              حفظ التعديلات
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
