'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { useConfirm, useTell } from '@/components/ui/Confirm';
import { Button } from '@/components/ui/Button';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import {
  ArrowRight,
  ImagePlus,
  Star,
  Trash2,
  ChevronUp,
  ChevronDown,
  Factory,
  Tag,
  ShoppingCart,
  TrendingUp,
  Boxes,
} from 'lucide-react';
import Link from 'next/link';
import { ProductOffers } from '@/components/products/ProductOffers';
import { ProductStock } from '@/components/products/ProductStock';
import { format } from 'date-fns';

export function ProductDetailScreen() {
  const params = useParams();
  const productId = params?.id as string;
  const { currentUser } = useApp();
  const canManage = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('products.edit');

  const ask = useConfirm();
  const tell = useTell();

  const [product, setProduct] = useState<any>(null);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProduct = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProduct(data.product);
      setCurrencyCode(data.currencyCode || 'USD');
      setAnalytics(data.analytics);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (productId) loadProduct();
  }, [productId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      formData.append('isPrimary', product.images?.length === 0 ? 'true' : 'false');
      const res = await fetch(`/api/products/${productId}/images`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await loadProduct();
    } catch (err: any) {
      void tell({ title: 'تعذر رفع الصورة', body: err.message, tone: 'danger' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setPrimary = async (imageId: string) => {
    await fetch(`/api/products/${productId}/images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setPrimary', imageId }),
    });
    loadProduct();
  };

  const deleteImage = async (imageId: string) => {
    if (!(await ask({ title: 'حذف هذه الصورة نهائياً؟', tone: 'danger' }))) return;
    await fetch(`/api/products/${productId}/images/${imageId}`, { method: 'DELETE' });
    loadProduct();
  };

  const moveImage = async (index: number, dir: -1 | 1) => {
    const images = [...product.images];
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    [images[index], images[target]] = [images[target], images[index]];
    await fetch(`/api/products/${productId}/images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', order: images.map((i: any) => i.id) }),
    });
    loadProduct();
  };

  if (loading) {
    return (
      <>
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--sys-primary)]"></div>
        </div>
      </>
    );
  }

  if (error || !product) {
    return (
      <>
        <div className="p-6 bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] text-[var(--sys-destructive)] text-sm rounded-xl text-center">
          {error || 'المنتج غير موجود'}
        </div>
      </>
    );
  }

  const images = product.images || [];
  const primary = images.find((i: any) => i.isPrimary) || images[0];

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <button
              onClick={() => window.history.back()}
              className="text-xs text-[var(--sys-muted-foreground)] hover:text-[var(--sys-destructive)] flex items-center space-x-1 rtl:space-x-reverse mb-1.5 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>عودة للمنتجات</span>
            </button>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--sys-heading)]">{product.name}</h1>
            <div className="flex items-center space-x-2 rtl:space-x-reverse mt-1.5">
              <span className="font-mono text-xs font-bold text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] px-2 py-0.5 rounded">{product.sku}</span>
              <Badge variant={product.status === 'ACTIVE' ? 'success' : 'warning'}>{product.status}</Badge>
              <span className="text-xs text-[var(--sys-muted)]">{images.length} صورة</span>
            </div>
          </div>

          {canManage && (
            <div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleUpload} className="hidden" />
              <Button size="sm" onClick={() => fileInputRef.current?.click()} loading={uploading} className="bg-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/85">
                <ImagePlus className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
                رفع صور جديدة
              </Button>
            </div>
          )}
        </div>

        {/* Gallery + Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gallery */}
          <Card className="lg:col-span-2">
            <CardHeader title="معرض صور المنتج" subtitle="الصورة الرئيسية كبيرة + صور إضافية — اضغط للتكبير" />
            <CardContent className="space-y-4">
              {/* Primary large */}
              <div
                className="relative w-full h-72 bg-[var(--sys-surface)] rounded-xl overflow-hidden border border-[var(--sys-border)] cursor-zoom-in"
                onClick={() => primary && setLightbox(primary.url)}
              >
                {primary ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={primary.url} alt={primary.altText || product.name} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--sys-border-strong)] text-sm">
                    لا توجد صور — ارفع الصورة الرئيسية
                  </div>
                )}
                {primary && (
                  <span className="absolute top-3 left-3 rtl:left-auto rtl:right-3 bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] text-[10px] font-bold px-2 py-1 rounded-lg flex items-center space-x-1 rtl:space-x-reverse">
                    <Star className="w-3 h-3" />
                    <span>الصورة الرئيسية</span>
                  </span>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {images.map((img: any, idx: number) => (
                    <div
                      key={img.id}
                      className={`relative group rounded-lg overflow-hidden border-2 ${
                        img.isPrimary ? 'border-[var(--sys-primary)]' : 'border-[var(--sys-border)]'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={img.altText || product.name}
                        onClick={() => setLightbox(img.url)}
                        className="w-full h-16 object-cover cursor-zoom-in"
                      />
                      {canManage && (
                        <div className="absolute inset-0 bg-[var(--sys-sidebar)]/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-1 rtl:space-x-reverse">
                          <button onClick={() => setPrimary(img.id)} title="تعيين كرئيسية" className="p-1 bg-[var(--sys-card)]/90 rounded text-[var(--sys-warning)] hover:bg-[var(--sys-card)] cursor-pointer">
                            <Star className="w-3 h-3" />
                          </button>
                          {idx > 0 && !img.isPrimary && (
                            <button onClick={() => moveImage(idx, -1)} title="تحريك يسار" className="p-1 bg-[var(--sys-card)]/90 rounded text-[var(--sys-foreground)] hover:bg-[var(--sys-card)] cursor-pointer">
                              <ChevronUp className="w-3 h-3 rotate-[-90deg] rtl:rotate-[270deg]" />
                            </button>
                          )}
                          {idx < images.length - 1 && !img.isPrimary && (
                            <button onClick={() => moveImage(idx, 1)} title="تحريك يمين" className="p-1 bg-[var(--sys-card)]/90 rounded text-[var(--sys-foreground)] hover:bg-[var(--sys-card)] cursor-pointer">
                              <ChevronDown className="w-3 h-3 rotate-[-90deg] rtl:rotate-[270deg]" />
                            </button>
                          )}
                          <button onClick={() => deleteImage(img.id)} title="حذف" className="p-1 bg-[var(--sys-card)]/90 rounded text-[var(--sys-destructive)] hover:bg-[var(--sys-card)] cursor-pointer">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info + Performance */}
          <div className="space-y-6">
            <Card>
              <CardHeader title="معلومات المنتج" />
              <CardContent className="text-xs space-y-2">
                <p className="text-[var(--sys-foreground)]">{product.description || '—'}</p>
                <div className="pt-2 border-t border-[var(--sys-border)] grid grid-cols-2 gap-2 text-center">
                  <div className="bg-[var(--sys-surface)] p-2 rounded-lg">
                    <span className="text-[var(--sys-muted)] block">السعر الأساسي</span>
                    <span className="font-bold text-[var(--sys-heading)]">${product.basePrice?.toFixed(2)}</span>
                  </div>
                  <div className="bg-[var(--sys-surface)] p-2 rounded-lg">
                    <span className="text-[var(--sys-muted)] block">متوسط تكلفة الوحدة</span>
                    <span className="font-bold text-[var(--sys-heading)]">${analytics?.avgCostPerUnit}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="أداء المبيعات" subtitle="الطلبات الموصّلة فقط" />
              <CardContent className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-[var(--sys-surface)] p-2.5 rounded-lg">
                  <span className="text-[var(--sys-primary)] block">الإيراد</span>
                  <span className="font-black text-[var(--sys-primary)]">${analytics?.revenue?.toFixed(2)}</span>
                </div>
                <div className="bg-[var(--sys-destructive-soft)] p-2.5 rounded-lg">
                  <span className="text-[var(--sys-destructive)] block">صافي الربح</span>
                  <span className="font-black text-[var(--sys-destructive)]">${analytics?.netProfit?.toFixed(2)}</span>
                </div>
                <div className="bg-[var(--sys-surface)] p-2.5 rounded-lg">
                  <span className="text-[var(--sys-muted)] block">إجمالي الطلبات</span>
                  <span className="font-bold text-[var(--sys-heading)]">{analytics?.totalOrders}</span>
                </div>
                <div className="bg-[var(--sys-success-soft)] p-2.5 rounded-lg">
                  <span className="text-[var(--sys-success)] block">موصّل</span>
                  <span className="font-bold text-[var(--sys-success)]">{analytics?.deliveredOrders}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="المخزون" />
              <CardContent className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-[var(--sys-surface)] p-2.5 rounded-lg">
                  <Boxes className="w-4 h-4 text-[var(--sys-muted)] mx-auto" />
                  <span className="text-[var(--sys-muted)] block mt-1">المنتج</span>
                  <span className="font-bold text-[var(--sys-heading)]">{analytics?.totalProduced}</span>
                </div>
                <div className="bg-[var(--sys-surface)] p-2.5 rounded-lg">
                  <ShoppingCart className="w-4 h-4 text-[var(--sys-primary)] mx-auto" />
                  <span className="text-[var(--sys-primary)] block mt-1">المبيع</span>
                  <span className="font-bold text-[var(--sys-primary)]">{analytics?.totalSold}</span>
                </div>
                <div className="bg-[var(--sys-success-soft)] p-2.5 rounded-lg">
                  <Boxes className="w-4 h-4 text-[var(--sys-success)] mx-auto" />
                  <span className="text-[var(--sys-success)] block mt-1">المتبقي</span>
                  <span className="font-black text-[var(--sys-success)]">{analytics?.totalRemaining}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Production Batches */}
        <Card>
          <CardHeader
            title={<span className="flex items-center space-x-2 rtl:space-x-reverse"><Factory className="w-4 h-4 text-[var(--sys-destructive)]" /><span>تشغيلات الإنتاج</span></span>}
            action={<Link href="/manufacturing"><Button size="sm" variant="outline">إدارة التشغيلات</Button></Link>}
          />
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left rtl:text-right text-xs">
              <thead className="bg-[var(--sys-surface)] border-b border-[var(--sys-border)] text-[var(--sys-muted-foreground)] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">الرقم</th>
                  <th className="px-6 py-3">الكمية</th>
                  <th className="px-6 py-3">المتبقي</th>
                  <th className="px-6 py-3">التكلفة الكلية</th>
                  <th className="px-6 py-3">تكلفة الوحدة</th>
                  <th className="px-6 py-3">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sys-border)]">
                {product.batches?.map((b: any) => (
                  <tr key={b.id} className="hover:bg-[var(--sys-surface)]">
                    <td className="px-6 py-3 font-mono font-bold text-[var(--sys-destructive)]">{b.batchNumber}</td>
                    <td className="px-6 py-3">{b.quantityProduced}</td>
                    <td className="px-6 py-3 font-bold text-[var(--sys-success)]">{b.quantityRemaining}</td>
                    <td className="px-6 py-3">${b.totalProductionCost?.toFixed(2)}</td>
                    <td className="px-6 py-3 font-black text-[var(--sys-heading)]">${b.costPerUnit?.toFixed(2)}</td>
                    <td className="px-6 py-3 text-[var(--sys-muted)]">{format(new Date(b.productionDate), 'yyyy-MM-dd')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Stock, cost and the one door that adds more. */}
        <ProductStock productId={productId} canManage={!!canManage} />

        {/* Offers — edited here, read everywhere. */}
        <ProductOffers
          productId={productId}
          basePrice={product.basePrice ?? 0}
          currency={currencyCode}
        />

        {/* Recent Orders */}
        <Card>
          <CardHeader
            title={<span className="flex items-center space-x-2 rtl:space-x-reverse"><TrendingUp className="w-4 h-4 text-[var(--sys-destructive)]" /><span>أحدث الطلبات على هذا المنتج</span></span>}
          />
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left rtl:text-right text-xs">
              <thead className="bg-[var(--sys-surface)] border-b border-[var(--sys-border)] text-[var(--sys-muted-foreground)] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">الطلب</th>
                  <th className="px-6 py-3">العميل</th>
                  <th className="px-6 py-3">المبلغ</th>
                  <th className="px-6 py-3">الحالة</th>
                  <th className="px-6 py-3">المودريتور</th>
                  <th className="px-6 py-3">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sys-border)]">
                {product.orders?.map((o: any) => (
                  <tr key={o.id} className="hover:bg-[var(--sys-surface)]">
                    <td className="px-6 py-3 font-bold text-[var(--sys-destructive)]">{o.orderNumber}</td>
                    <td className="px-6 py-3">{o.customer?.fullName} <span className="text-[var(--sys-muted)]">— {o.customer?.city}</span></td>
                    <td className="px-6 py-3 font-bold">${o.totalAmount.toFixed(2)}</td>
                    <td className="px-6 py-3"><OrderStatusBadge status={o.status} /></td>
                    <td className="px-6 py-3 text-[var(--sys-muted-foreground)]">{o.moderator?.name || '—'}</td>
                    <td className="px-6 py-3 text-[var(--sys-muted)]">{format(new Date(o.createdAt), 'MMM d')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Lightbox */}
      <Modal isOpen={!!lightbox} onClose={() => setLightbox(null)} title="معاينة الصورة" maxWidth="4xl">
        {lightbox && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lightbox} alt="معاينة" className="w-full max-h-[70vh] object-contain rounded-xl" />
        )}
      </Modal>
    </>
  );
}
