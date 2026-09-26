'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import { apiFetch } from '@/lib/api-client';
import { useRegions } from '@/hooks/useRegions';
import { productName } from '@/lib/product-name';
import { ProductLinesEditor, newLine, type DraftLine } from '@/components/orders/ProductLinesEditor';
import { amount } from '@/lib/format';
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
} from 'lucide-react';

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * The created order, so a caller can act on it immediately — the batches
   * screen confirms it on the spot, through the ordinary confirmation
   * endpoint rather than a second path that would have to re-implement
   * reservation and the status log.
   */
  onSuccess: (order?: { id: string; orderNumber?: string }) => void;
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
  // Governorates of the SELECTED country — never a hard-coded list.
  const { regions, countryName, currency } = useRegions();
  const [regionId, setRegionId] = useState('');
  const customerCity = regions.find((r) => r.id === regionId)?.name ?? '';
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [channelId, setChannelId] = useState('');
  const [channels, setChannels] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [moderatorId, setModeratorId] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  const [existingCustomerAlert, setExistingCustomerAlert] = useState<{
    exists: boolean;
    name?: string;
    totalOrders?: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset ALL form state first so stale customer data / selections from a
      // previous open never persist, then load fresh dropdown data
      setError(null);
      setLoading(false);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAltPhone('');
      setCustomerAddress('');
      setRegionId('');
      setLines([newLine()]);
      setChannelId('');
      setModeratorId('');
      setCustomerNotes('');
      setInternalNotes('');
      setExistingCustomerAlert(null);
      loadFormData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadFormData = async () => {
    try {
      const [prodRes, modRes, chRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/moderators'),
        fetch('/api/settings/channels'),
      ]);
      if (chRes.ok) {
        const chData = await chRes.json();
        setChannels((chData.channels ?? []).filter((c: any) => c.isActive));
      }
      if (prodRes.ok) {
        const pData = await prodRes.json();
        setProducts(pData.products || []);
        // Start on the first product rather than an empty row: one click less
        // for the commonest order, and nothing is assumed about its price.
        if (pData.products?.length > 0) setLines([newLine(pData.products[0])]);
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
      const res = await apiFetch(`/api/customers?q=${encodeURIComponent(customerPhone)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.customers && data.customers.length > 0) {
          const matched = data.customers[0];
          setExistingCustomerAlert({ exists: true, name: matched.fullName, totalOrders: matched.totalOrders });
          if (!customerName) setCustomerName(matched.fullName);
          if (!customerAddress && matched.address) setCustomerAddress(matched.address);
          // Reuse the customer's known city only when it is a region of THIS country.
          if (matched.city) {
            const known = regions.find((r) => r.name === matched.city);
            if (known) setRegionId(known.id);
          }
        } else {
          setExistingCustomerAlert({ exists: false });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerAltPhone,
          customerAddress,
          customerCity,
          regionId: regionId || null,
          items: lines.map((l) => ({
            productId: l.productId,
            offerId: l.offerId,
            quantity: l.quantity,
            unitPrice: l.price,
          })),
          // The delivery fee follows the courier and is set when the shipment
          // is created; sending a zero here would read as free delivery.
          channelId: channelId || null,
          moderatorId: moderatorId || null,
          customerNotes,
          internalNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء الطلب');
      onSuccess(data.order ?? data);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const goodsTotal = lines.reduce((sum, l) => sum + (Number(l.price) || 0), 0);
  const money = (n: number) => amount(n, currency);
  const ready =
    customerName.trim().length >= 2 &&
    customerPhone.trim().length >= 7 &&
    lines.length > 0 &&
    lines.every((l) => l.productId);

  const SectionTitle = ({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) => (
    <div className="flex items-center gap-2 pb-2 border-b border-[var(--sys-border)]">
      <div className={`p-1.5 rounded-lg ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <h4 className="text-xs font-black uppercase tracking-wide text-[var(--sys-foreground)]">{title}</h4>
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
          <div className="p-3 bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] text-[var(--sys-destructive)] text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ─── 1. Customer ─── */}
        <div className="border border-[var(--sys-border)] rounded-lg p-4 bg-[var(--sys-surface)]/60 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionTitle icon={UserCheck} title="1. بيانات العميل" color="bg-red-100 text-[var(--sys-destructive)]" />
            {existingCustomerAlert?.exists && (
              <span className="text-caption font-bold text-[var(--sys-warning)] bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/60 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                عميل موجود — {existingCustomerAlert.name} ({existingCustomerAlert.totalOrders} طلب سابق)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--sys-foreground)] mb-1.5">رقم الهاتف *</label>
              <div className="relative">
                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sys-muted)]" />
                <input
                  type="tel"
                  placeholder="مثال: 0936654998"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  onBlur={handlePhoneBlur}
                  required
                  dir="ltr"
                  className="w-full ps-9 pe-3 py-2 text-sm bg-[var(--sys-card)] border border-[var(--sys-border-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-[var(--sys-destructive)] transition-colors"
                />
              </div>
              {existingCustomerAlert && (
                <p className={`text-caption mt-1 flex items-center gap-1 ${existingCustomerAlert.exists ? 'text-[var(--sys-warning)]' : 'text-[var(--sys-success)]'}`}>
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
              <label className="block text-xs font-medium text-[var(--sys-foreground)] mb-1.5">
                المحافظة{countryName ? ` — ${countryName}` : ''} *
              </label>
              <Select value={regionId} onChange={(e) => setRegionId(e.target.value)} required>
                <option value="">اختر المحافظة</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
              {regions.length === 0 && (
                <p className="mt-1 text-caption text-[var(--sys-destructive)]">
                  لا توجد محافظات لهذا البلد — أضفها من الإعدادات ← البلدان والمتاجر والمحافظ.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--sys-foreground)] mb-1.5">العنوان *</label>
              <div className="relative">
                <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sys-muted)]" />
                <input
                  placeholder="الشارڡ البناء، المنطقة..."
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  required
                  className="w-full ps-9 pe-3 py-2 text-sm bg-[var(--sys-card)] border border-[var(--sys-border-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-[var(--sys-destructive)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── 2. المنتجات ─── */}
        <div className="border border-[var(--sys-border)] rounded-lg p-4 bg-[var(--sys-surface)]/60 space-y-3">
          <SectionTitle icon={Package} title="2. المنتجات" color="bg-[var(--sys-surface-strong)] text-blue-600" />
          {/* The same editor the order screen uses, so a line means the same
              thing whether it is typed here or corrected later. */}
          <ProductLinesEditor
            lines={lines}
            products={products}
            currency={currency}
            onChange={setLines}
            disabled={loading}
          />
        </div>

        {/* ─── 3. Assignment & Source ─── */}
        <div className="border border-[var(--sys-border)] rounded-lg p-4 bg-[var(--sys-surface)]/60 space-y-3">
          <SectionTitle icon={UserCog} title="3. التعيين والمصدر" color="bg-purple-100 text-purple-600" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="المودريتور المسؤول" value={moderatorId} onChange={(e) => setModeratorId(e.target.value)}>
              <option value="">تعيين تلقائي / بدون</option>
              {moderators.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>

            <div>
              <label className="block text-xs font-medium text-[var(--sys-foreground)] mb-1.5">قناة الطلب</label>
              {/* The shop's own channels, not a list written into this form —
                  they are what the numbers are counted by. */}
              <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                <option value="">— اختر القناة —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              {channels.length === 0 && (
                <p className="text-caption text-[var(--sys-muted)] mt-1">
                  لا قنوات بعد — تُضاف من الإعدادات ← قنوات الطلبات.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─── 4. Notes ─── */}
        <div className="border border-[var(--sys-border)] rounded-lg p-4 bg-[var(--sys-surface)]/60 space-y-3">
          <SectionTitle icon={StickyNote} title="4. الملاحظات" color="bg-[var(--sys-warning-soft)] text-[var(--sys-warning)]" />

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
            className="text-xs font-medium text-[var(--sys-muted-foreground)] hover:text-[var(--sys-foreground)] cursor-pointer flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            نص حر طويل؟ جرّب الإدخال بالذكاء الاصطناعي من الزر الأخضر
          </button>

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" loading={loading} disabled={!ready}>
              <Megaphone className="w-4 h-4" />
              إنشاء الطلب ({money(goodsTotal)})
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
