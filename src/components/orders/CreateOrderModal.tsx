'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import { SYRIAN_GOVERNORATES } from '@/lib/syria';
import { productName } from '@/lib/product-name';
import {
  UserCheck,
  AlertCircle,
  CheckCircle2,
  Package,
  UserCog,
  StickyNote,
  Phone,
  MapPin,
  DollarSign,
  Megaphone,
  Wand2,
  Search,
  ChevronDown,
} from 'lucide-react';

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateOrderModal({ isOpen, onClose, onSuccess }: CreateOrderModalProps) {
  const { t, locale, isRtl } = useApp();
  const ar = locale === 'ar';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [moderators, setModerators] = useState<any[]>([]);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAltPhone, setCustomerAltPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('دمشق');
  const [productId, setProductId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [sellingPrice, setSellingPrice] = useState(20);
  const [source, setSource] = useState('Facebook Ads');
  const [moderatorId, setModeratorId] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  const [existingCustomerAlert, setExistingCustomerAlert] = useState<{
    exists: boolean;
    name?: string;
    totalOrders?: number;
  } | null>(null);

  // Product search combobox
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const filteredProducts = products.filter((p) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.trim().toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.nameEn || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (isOpen) loadFormData();
  }, [isOpen]);

  const loadFormData = async () => {
    try {
      const [prodRes, modRes] = await Promise.all([fetch('/api/products'), fetch('/api/moderators')]);
      if (prodRes.ok) {
        const pData = await prodRes.json();
        setProducts(pData.products || []);
        if (pData.products?.length > 0) {
          const first = pData.products[0];
          setProductId(first.id);
          if (first.offers?.length > 0) {
            setOfferId(first.offers[0].id);
            setQuantity(first.offers[0].quantity);
            setSellingPrice(first.offers[0].sellingPrice);
          } else {
            setSellingPrice(first.basePrice);
          }
        }
      }
      if (modRes.ok) {
        const mData = await modRes.json();
        setModerators(mData.moderators || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePhoneBlur = async () => {
    if (!customerPhone || customerPhone.length < 7) return;
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(customerPhone)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.customers && data.customers.length > 0) {
          const matched = data.customers[0];
          setExistingCustomerAlert({ exists: true, name: matched.fullName, totalOrders: matched.totalOrders });
          if (!customerName) setCustomerName(matched.fullName);
          if (!customerAddress && matched.address) setCustomerAddress(matched.address);
          if (matched.city) setCustomerCity(matched.city);
        } else {
          setExistingCustomerAlert({ exists: false });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleProductChange = (newProdId: string) => {
    setProductId(newProdId);
    const prod = products.find((p) => p.id === newProdId);
    if (prod && prod.offers?.length > 0) {
      const firstOffer = prod.offers[0];
      setOfferId(firstOffer.id);
      setQuantity(firstOffer.quantity);
      setSellingPrice(firstOffer.sellingPrice);
    } else if (prod) {
      setOfferId('');
      setQuantity(1);
      setSellingPrice(prod.basePrice || 20);
    }
  };

  const handleOfferChange = (newOfferId: string) => {
    setOfferId(newOfferId);
    const currentProd = products.find((p) => p.id === productId);
    if (currentProd && newOfferId) {
      const offer = currentProd.offers?.find((o: any) => o.id === newOfferId);
      if (offer) {
        setQuantity(offer.quantity);
        setSellingPrice(offer.sellingPrice);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerAltPhone,
          customerAddress,
          customerCity,
          productId,
          offerId: offerId || null,
          quantity,
          sellingPrice,
          shippingCost: 0,
          source,
          moderatorId: moderatorId || null,
          customerNotes,
          internalNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء الطلب');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentProduct = products.find((p) => p.id === productId);

  const money = (n: number) =>
    `$${n.toLocaleString(ar ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const SectionTitle = ({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) => (
    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
      <div className={`p-1.5 rounded-lg ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <h4 className="text-xs font-black uppercase tracking-wide text-slate-700">{title}</h4>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="طلب سريع جديد"
      subtitle="فحص تلقائي للعميل المكرر • تعبئة السعر تلقائياً من العرض • تعيين المودريتور"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ─── 1. Customer ─── */}
        <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionTitle icon={UserCheck} title="1. بيانات العميل" color="bg-red-100 text-red-600" />
            {existingCustomerAlert?.exists && (
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                عميل موجود — {existingCustomerAlert.name} ({existingCustomerAlert.totalOrders} طلب سابق)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">رقم الهاتف *</label>
              <div className="relative">
                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="tel"
                  placeholder="مثال: 0936654998"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  onBlur={handlePhoneBlur}
                  required
                  dir="ltr"
                  className="w-full ps-9 pe-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors"
                />
              </div>
              {existingCustomerAlert && (
                <p className={`text-[11px] mt-1 flex items-center gap-1 ${existingCustomerAlert.exists ? 'text-amber-700' : 'text-green-700'}`}>
                  {existingCustomerAlert.exists ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> تم ربط البيانات بملف العميل تلقائياً
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> عميل جديد — سيتم إنشاء ملف تلقائياً
                    </>
                  )}
                </p>
              )}
            </div>

            <Input label="اسم العميل الكامل *" placeholder="مثال: عبدالله عبدالقادر" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="رقم بديل" placeholder="اختياري" value={customerAltPhone} onChange={(e) => setCustomerAltPhone(e.target.value)} />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">المحافظة السورية *</label>
              <Select value={customerCity} onChange={(e) => setCustomerCity(e.target.value)} required>
                {SYRIAN_GOVERNORATES.map((gov) => (
                  <option key={gov} value={gov}>{gov}</option>
                ))}
                <option value="أخرى">أخرى / خارج سوريا</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">العنوان *</label>
              <div className="relative">
                <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  placeholder="الشارع، البناء، المنطقة..."
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  required
                  className="w-full ps-9 pe-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── 2. Product & Offer ─── */}
        <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-3">
          <SectionTitle icon={Package} title="2. المنتج والعرض" color="bg-blue-100 text-blue-600" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Searchable product picker */}
            <div className="relative">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">البحث عن منتج *</label>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="اكتب اسم المنتج أو SKU..."
                  value={productSearch}
                  onFocus={() => setProductDropdownOpen(true)}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setProductDropdownOpen(true);
                  }}
                  className="w-full ps-9 pe-9 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <ChevronDown
                  className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 cursor-pointer"
                  onClick={() => setProductDropdownOpen(!productDropdownOpen)}
                />
              </div>

              {/* Selected product chip */}
              {productId && !productDropdownOpen && (
                <div className="mt-1.5 flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <Package className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="text-[11px] font-bold text-blue-900 line-clamp-1">
                    {currentProduct ? productName(currentProduct, locale) : '—'}
                  </span>
                  <span className="text-[10px] text-blue-600 font-mono shrink-0">{currentProduct?.sku}</span>
                  <span className="text-[10px] text-blue-500 shrink-0">
                    {currentProduct?.offers?.length ?? 0} عرض
                  </span>
                </div>
              )}

              {productDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProductDropdownOpen(false)} />
                  <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <p className="p-4 text-center text-xs text-slate-400">لا توجد نتائج مطابقة</p>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            handleProductChange(p.id);
                            setProductSearch('');
                            setProductDropdownOpen(false);
                          }}
                          className={`w-full text-start px-3 py-2.5 hover:bg-blue-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0 ${
                            p.id === productId ? 'bg-blue-50/70' : ''
                          }`}
                        >
                          <span className="block text-xs font-bold text-slate-900 line-clamp-1">
                            {productName(p, locale)}
                          </span>
                          <span className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-slate-400">{p.sku}</span>
                            <span className="text-[10px] text-slate-400">
                              {p.offers?.length ?? 0} عرض
                            </span>
                            {p.basePrice > 0 && (
                              <span className="text-[10px] font-bold text-green-700" dir="ltr">
                                من ${p.basePrice}
                              </span>
                            )}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <Select label="اختر العرض (يعبّئ السعر والكمية تلقائياً)" value={offerId} onChange={(e) => handleOfferChange(e.target.value)}>
              <option value="">مباشر / وحدة واحدة</option>
              {currentProduct?.offers?.map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {money(o.sellingPrice)}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input label="الكمية" type="number" min="1" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)} required />
            <Input label="سعر البيع ($)" type="number" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)} required />
            <div className="flex items-end">
              <div className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-l from-green-50 to-emerald-50 border border-green-300 text-center">
                <span className="block text-[10px] font-semibold text-green-700">الإجمالي</span>
                <span className="block text-lg font-black text-green-800" dir="ltr">{money(sellingPrice)}</span>
              </div>
            </div>
          </div>

          {/* Offer highlight */}
          {offerId && currentProduct?.offers?.find((o: any) => o.id === offerId) && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800">
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              تم تطبيق العرض: <strong>{currentProduct.offers.find((o: any) => o.id === offerId)?.name}</strong>
            </div>
          )}
        </div>

        {/* ─── 3. Assignment & Source ─── */}
        <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-3">
          <SectionTitle icon={UserCog} title="3. التعيين والمصدر" color="bg-purple-100 text-purple-600" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="المودريتور المسؤول" value={moderatorId} onChange={(e) => setModeratorId(e.target.value)}>
              <option value="">تعيين تلقائي / بدون</option>
              {moderators.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">مصدر الطلب</label>
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="Facebook Ads">إعلانات فيسبوك</option>
                <option value="TikTok">تيك توك</option>
                <option value="Instagram">إنستغرام</option>
                <option value="WhatsApp">واتساب</option>
                <option value="Website">الموقع</option>
                <option value="الشيت">الشيت</option>
              </Select>
            </div>
          </div>
        </div>

        {/* ─── 4. Notes ─── */}
        <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-3">
          <SectionTitle icon={StickyNote} title="4. الملاحظات" color="bg-amber-100 text-amber-600" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Textarea label="ملاحظات العميل (وقت التوصيل المفضل...)" placeholder="مثال: يرجى الاتصال قبل الوصول" rows={2} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
            <Textarea label="ملاحظات داخلية" placeholder="مثال: عميل من إعلان تيك توك" rows={2} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
          </div>
        </div>

        {/* ─── Actions ─── */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            نص حر طويل؟ جرّب الإدخال بالذكاء الاصطناعي من الزر الأخضر
          </button>

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" loading={loading} className="bg-red-600 hover:bg-red-700">
              <Megaphone className="w-4 h-4" />
              إنشاء الطلب ({money(sellingPrice)})
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
