'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import { SYRIAN_GOVERNORATES } from '@/lib/syria';
import {
  Sparkles,
  Wand2,
  CheckCircle2,
  AlertCircle,
  User,
  Phone,
  MapPin,
  Package,
  ClipboardPaste,
} from 'lucide-react';

interface AiOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParseResult {
  parsed: {
    customerName: string;
    phone: string;
    governorate: string;
    address: string;
    productQuery: string;
    quantity: number;
    price: number | null;
    notes: string;
    source: string;
  };
  engine: string;
  matchedProduct: { id: string; name: string; score: number } | null;
  productMatchConfident: boolean;
  suggestedPrice: number | null;
  suggestedOfferName: string | null;
  existingCustomer: { fullName: string; totalOrders: number; city: string } | null;
}

export function AiOrderModal({ isOpen, onClose, onSuccess }: AiOrderModalProps) {
  const { t } = useApp();
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);

  // Editable confirmed fields
  const [products, setProducts] = useState<any[]>([]);
  const [productId, setProductId] = useState('');
  const [finalPrice, setFinalPrice] = useState(0);

  const loadProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setText(clip);
    } catch {
      // clipboard permission denied; user can paste manually
    }
  };

  const handleParse = async () => {
    if (!text.trim()) return;
    setParsing(true);
    setError(null);
    setResult(null);
    try {
      await loadProducts();
      const res = await fetch('/api/orders/ai-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحليل الطلب');
      setResult(data);
      if (data.matchedProduct) setProductId(data.matchedProduct.id);
      setFinalPrice(data.suggestedPrice ?? data.parsed.price ?? 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/orders/ai-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          parsed: {
            ...result.parsed,
            productId,
            finalPrice,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل حفظ الطلب');
      onSuccess();
      onClose();
      setText('');
      setResult(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const p = result?.parsed;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="إدخال طلب بالذكاء الاصطناعي"
      subtitle="الصق رسالة الطلب كما هي (واتساب / فيسبوك / الشيت) والموقع يسجلها تلقائياً"
      maxWidth="2xl"
    >
      <div className="space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center space-x-2 rtl:space-x-reverse">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Paste text */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-slate-700">
              1. الصق نص الطلب
            </label>
            <Button size="sm" variant="outline" onClick={handlePaste} className="text-[11px]">
              <ClipboardPaste className="w-3.5 h-3.5 ml-1 rtl:ml-0 rtl:mr-1" />
              لصق من الحافظة
            </Button>
          </div>
          <Textarea
            rows={7}
            dir="rtl"
            placeholder={`الاسم: عبدالله عبدالقادر عبدالعال
الرقم: 0936654998
اسم المحافظة: سووريا
العنوان: بانياس المدينة
الطلب ( المنتج ): كريم علاج فطريات الأظافر
الكمية: 1
السعر: 20$
الملاحظات: -
اسم الصفحة: الشيت`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono text-xs leading-relaxed"
          />
          <div className="flex justify-end mt-3">
            <Button onClick={handleParse} loading={parsing} className="bg-red-600 hover:bg-red-700">
              <Wand2 className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
              تحليل الطلب بالذكاء الاصطناعي
            </Button>
          </div>
        </div>

        {/* Step 2: Parsed preview (editable) */}
        {result && p && (
          <div className="border border-red-200 bg-red-50/40 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-red-200 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-red-800 flex items-center space-x-2 rtl:space-x-reverse">
                <CheckCircle2 className="w-4 h-4 text-red-600" />
                <span>2. تأكيد البيانات المستخرجة (قابلة للتعديل)</span>
              </h4>
              <span className="text-[10px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded border">
                {result.engine === 'ai' ? 'OpenRouter AI' : 'Smart Parser'}
              </span>
            </div>

            {result.existingCustomer && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg">
                ⚠️ هذا الرقم مسجل مسبقاً لعميل: <strong>{result.existingCustomer.fullName}</strong> (
                {result.existingCustomer.totalOrders} طلب سابق) — سيتم ربط الطلب بنفس الملف.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="الاسم" value={p.customerName} onChange={(e) => setResult({ ...result, parsed: { ...p, customerName: e.target.value } })} />
              <Input label="الرقم" value={p.phone} onChange={(e) => setResult({ ...result, parsed: { ...p, phone: e.target.value } })} />
              <Select
              label="المحافظة السورية"
              value={
                SYRIAN_GOVERNORATES.includes(p.governorate) || p.governorate === 'أخرى'
                  ? p.governorate
                  : 'أخرى'
              }
              onChange={(e) =>
                setResult({ ...result, parsed: { ...p, governorate: e.target.value } })
              }
            >
              {SYRIAN_GOVERNORATES.map((gov) => (
                <option key={gov} value={gov}>
                  {gov}
                </option>
              ))}
              <option value="أخرى">أخرى / خارج سوريا</option>
            </Select>
            {!SYRIAN_GOVERNORATES.includes(p.governorate) && p.governorate && (
              <Input
                label="المحافظة (كما وردت في الطلب)"
                value={p.governorate}
                onChange={(e) => setResult({ ...result, parsed: { ...p, governorate: e.target.value } })}
              />
            )}
            <Input label="العنوان" value={p.address} onChange={(e) => setResult({ ...result, parsed: { ...p, address: e.target.value } })} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                label="المنتج (تم مطابقته تلقائياً)"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  const prod = products.find((x) => x.id === e.target.value);
                  if (prod?.offers?.length) setFinalPrice(prod.offers[0].sellingPrice);
                }}
                className={result.matchedProduct && !result.productMatchConfident ? 'border-amber-400' : ''}
              >
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.name}
                  </option>
                ))}
              </Select>

              <Input
                label="الكمية"
                type="number"
                min="1"
                value={p.quantity}
                onChange={(e) => setResult({ ...result, parsed: { ...p, quantity: parseInt(e.target.value, 10) || 1 } })}
              />

              <Input
                label="السعر ($)"
                type="number"
                step="0.01"
                value={finalPrice}
                onChange={(e) => setFinalPrice(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="المصدر / اسم الصفحة" value={p.source} onChange={(e) => setResult({ ...result, parsed: { ...p, source: e.target.value } })} />
              <Input label="الملاحظات" value={p.notes === '-' ? '' : p.notes} onChange={(e) => setResult({ ...result, parsed: { ...p, notes: e.target.value } })} />
            </div>

            {/* Match info */}
            {result.matchedProduct && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-start space-x-2 rtl:space-x-reverse ${
                  result.productMatchConfident
                    ? 'bg-red-100/70 text-red-800'
                    : 'bg-amber-50 text-amber-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  تمت مطابقة «{result.parsed.productQuery}» مع: <strong>{result.matchedProduct.name}</strong>
                  {result.suggestedOfferName && <> — العرض المقترح: {result.suggestedOfferName}</>}
                  {!result.productMatchConfident && ' (تأكد من المنتج المختار)'}
                </span>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 rtl:space-x-reverse pt-3 border-t border-red-100">
              <Button variant="outline" onClick={() => setResult(null)}>
                إلغاء
              </Button>
              <Button onClick={handleConfirm} loading={saving} className="bg-red-600 hover:bg-red-700">
                <CheckCircle2 className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
                تسجيل الطلب (${finalPrice})
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
