'use client';

import React, { useState, useEffect } from 'react';
import { onTheWire, typedFigure } from '@/lib/typed-box';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import { apiFetch } from '@/lib/api-client';
import { useRegions } from '@/hooks/useRegions';
import { useProducts } from '@/hooks/useProducts';
import { ProductPicker } from '@/components/ui/ProductPicker';
import { RiCheckboxCircleLine, RiClipboardLine, RiErrorWarningLine, RiMagicLine, RiSparkling2Line } from '@remixicon/react';
import { Money } from '@/components/ui/Money';
import { useToast } from '@/components/ui/Toast';

/**
 * WHAT A BOX PUTS ON THE WIRE: ITS CHARACTERS, OR NOTHING AT ALL.
 *
 * The reader `CourierFees.tsx` got in `17cbe93` and `ManufacturingScreen.tsx`
 * in `509306a`. Both boxes on this form were the defect it names:
 *
 *   · `setFinalPrice(parseFloat(e.target.value) || 0)` — `parseFloat('')` is
 *     `NaN` and `||` makes it `0`. And the door this form posts to reads
 *     `p.finalPrice || product.basePrice`, so A CLEARED PRICE BOX SILENTLY
 *     CHARGED THE PRODUCT'S BASE PRICE. Not a wrong number anybody could
 *     see: the modal said one thing, the order said another.
 *   · `quantity: parseInt(…, 10) || 1` — a cleared quantity became 1, and
 *     the component wrote that 1 back into the box, so clearing «2» and
 *     typing «3» produced «13».
 *
 * `undefined` is the answer for an empty box, and `JSON.stringify` drops an
 * `undefined` property — so the field is ABSENT on the wire. Both are
 * REQUIRED at the door (`confirmSchema`: `quantity` and `finalPrice` are
 * `z.coerce.number()` with no `.optional()` and no `.default()`), over
 * columns that have no default either: `OrderItem.quantity` is `Int NOT
 * NULL` and `OrderItem.unitPrice` is `Decimal(12,2) NOT NULL`. «Nothing» is
 * not a value either column can hold, so absence is a 400 — which is what
 * an unfilled box deserves and what a silent fallback could never be.
 *
 * AND IT IS THE CHARACTERS. `''` must never be sent: `z.coerce.number()` is
 * `Number()`, and `Number('')` is `0` — the free line again, one layer down.
 */

/** The figure a box holds, for this screen's own echo of it. Never an invented 0. */

/**
 * A SERVER FIGURE FOR A BOX TO OPEN ON, or an empty box — never a `0`.
 *
 * `setFinalPrice(data.suggestedPrice ?? data.parsed.price ?? 0)` ended in an
 * invented zero, and the parser returns `price: null` whenever the message
 * named no price at all. So a message with no price opened the box at `0`,
 * and `0` is exactly what the door reads as «absent» and replaces with the
 * base price. The box is empty instead, and the door says so.
 */
function boxFor(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

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
  const toast = useToast();
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  // Governorates of the selected country (never a hard-coded country list),
  // and the store's own currency — the price box used to be labelled «($)»
  // on every store in the world.
  const { regions, countryName, currency } = useRegions();
  const regionNames = regions.map((r) => r.name);

  // Editable confirmed fields
  const [productId, setProductId] = useState('');
  const { products } = useProducts({ enabled: isOpen });
  /*
   * THE TWO BOXES HOLD CHARACTERS, AND THEY OPEN EMPTY.
   *
   * `useState(0)` was a price of zero in a browser before the parser had
   * seen the message — and `0` is the one value the door turns into the
   * product's base price. The quantity now has state of its own rather than
   * being written back into `result.parsed`, so an empty box stays empty
   * instead of being repaired to `1`.
   */
  const [priceTyped, setPriceTyped] = useState('');
  const [quantityTyped, setQuantityTyped] = useState('');
  /** The price this screen prints on its own button — never a figure it invented. */
  const priceFigure = typedFigure(priceTyped);

  // Reset ALL form state whenever the modal opens — no stale AI parse result
  // or previous text should persist between opens
  useEffect(() => {
    if (isOpen) {
      setText('');
      setParsing(false);
      setSaving(false);
      setResult(null);
      setProductId('');
      setPriceTyped('');
      setQuantityTyped('');
    }
  }, [isOpen]);

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
    setResult(null);
    try {
      const res = await apiFetch('/api/orders/ai-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحليل الطلب');
      setResult(data);
      if (data.matchedProduct) setProductId(data.matchedProduct.id);
      // The server's suggestion, or the price the message itself named, or an
      // EMPTY BOX. The old `?? 0` made «the message named no price» and «the
      // customer pays nothing» the same opening state.
      setPriceTyped(boxFor(data.suggestedPrice ?? data.parsed.price));
      setQuantityTyped(boxFor(data.parsed.quantity));
    } catch (err: any) {
      toast.failed(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!result) return;
    // The parser matches what it can. When it matched nothing, say so in one
    // sentence instead of letting the route answer with a schema error about
    // a box the screen had drawn as filled in.
    if (!productId) {
      toast.failed('اختر المنتج — لم يُطابق النص أيّ منتج في الكتالوج');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/orders/ai-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          parsed: {
            ...result.parsed,
            productId,
            /*
             * THE CHARACTERS, OR THE FIELD IS NOT THERE — and these two keys
             * come AFTER the spread deliberately. `result.parsed.quantity`
             * is a number the parser produced; what the reviewer has in
             * front of them is this box, so the box wins. An explicit
             * `undefined` after a spread removes the key from the JSON,
             * which is how «I did not fill this in» reaches the door at all.
             */
            quantity: onTheWire(quantityTyped),
            finalPrice: onTheWire(priceTyped),
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
      toast.failed(err.message);
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

        {/* Step 1: Paste text */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-[var(--sys-foreground)]">
              1. الصق نص الطلب
            </label>
            <Button size="sm" variant="outline" onClick={handlePaste} className="text-xs">
              <RiClipboardLine className="w-4 h-4 ml-1 rtl:ml-0 rtl:mr-1" />
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
            <Button onClick={handleParse} loading={parsing}>
              <RiMagicLine className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
              تحليل الطلب بالذكاء الاصطناعي
            </Button>
          </div>
        </div>

        {/* Step 2: Parsed preview (editable) */}
        {result && p && (
          <div className="border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)]/40 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--sys-destructive-border)] pb-2">
              <h4 className="text-xs font-bold text-[var(--sys-destructive)] flex items-center space-x-2 rtl:space-x-reverse">
                <RiCheckboxCircleLine className="w-4 h-4 text-[var(--sys-destructive)]" />
                <span>2. تأكيد البيانات المستخرجة (قابلة للتعديل)</span>
              </h4>
              <span className="text-xs font-mono text-[var(--sys-muted)] bg-[var(--sys-card)] px-2 py-0.5 rounded-lg border">
                {result.engine === 'ai' ? 'OpenRouter AI' : 'Smart Parser'}
              </span>
            </div>

            {result.existingCustomer && (
              <div className="p-2.5 bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/40 text-[var(--sys-warning)] text-xs rounded-lg">
                <RiErrorWarningLine className="me-1 inline-block h-4 w-4 align-text-bottom" aria-hidden />
                هذا الرقم مسجل مسبقاً لعميل: <strong>{result.existingCustomer.fullName}</strong> (
                {result.existingCustomer.totalOrders} طلب سابق) — سيتم ربط الطلب بنفس الملف.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="الاسم" value={p.customerName} onChange={(e) => setResult({ ...result, parsed: { ...p, customerName: e.target.value } })} />
              <Input label="الرقم" value={p.phone} onChange={(e) => setResult({ ...result, parsed: { ...p, phone: e.target.value } })} />
              <Select
              label={`المحافظة${countryName ? ` — ${countryName}` : ''}`}
              value={regionNames.includes(p.governorate) ? p.governorate : ''}
              onChange={(e) =>
                setResult({ ...result, parsed: { ...p, governorate: e.target.value } })
              }
            >
              <option value="">اختر المحافظة</option>
              {regionNames.map((gov) => (
                <option key={gov} value={gov}>
                  {gov}
                </option>
              ))}
            </Select>
            {p.governorate && !regionNames.includes(p.governorate) && (
              <p className="text-xs text-[var(--sys-warning)]">
                «{p.governorate}» ليست من محافظات {countryName ?? 'البلد الحالي'} — اختر المحافظة الصحيحة.
              </p>
            )}
            <Input label="العنوان" value={p.address} onChange={(e) => setResult({ ...result, parsed: { ...p, address: e.target.value } })} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/*
                A HUNDRED AND FOURTEEN PRODUCTS, AND THE ONE THE MESSAGE MEANT.

                This was a native `<select>` over the whole catalogue with no
                search — the same fault already fixed on the new-order form and
                the return, both of which come through `ProductPicker`. Worse
                here: it had NO empty row, so when the parser matched nothing
                and `productId` stayed `''` the browser drew the FIRST product
                as though it were chosen. Accepting what the screen showed sent
                an empty productId, which the route's schema refuses
                (`z.string().min(10)`) — a 400 about a field that looked filled
                in.

                «— اختر منتجًا —» is that empty row, so the box now says what
                it holds.
              */}
              <div>
                <label className="block text-xs font-medium text-[var(--sys-foreground)] mb-1.5">
                  المنتج (تم مطابقته تلقائياً)
                </label>
                <ProductPicker
                  products={products}
                  value={productId}
                  anyOption={{ value: '', label: '— اختر منتجًا —' }}
                  placeholder="ابحث عن منتج…"
                  onChange={(id) => {
                    setProductId(id);
                    const prod = products.find((x) => x.id === id);
                    // The offer's own price, written into the box as digits.
                    if (prod?.offers?.length) setPriceTyped(String(prod.offers[0].sellingPrice));
                  }}
                />
              </div>

              <Input
                label="الكمية"
                name="quantity"
                type="number"
                min="1"
                value={quantityTyped}
                onChange={(e) => setQuantityTyped(e.target.value)}
              />

              <Input
                label={`السعر${currency?.code ? ` (${currency.code})` : ''}`}
                name="finalPrice"
                type="number"
                step="0.01"
                value={priceTyped}
                onChange={(e) => setPriceTyped(e.target.value)}
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
                    ? 'bg-[var(--sys-destructive-soft)]/70 text-[var(--sys-destructive)]'
                    : 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)]'
                }`}
              >
                <RiSparkling2Line className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  تمت مطابقة «{result.parsed.productQuery}» مع: <strong>{result.matchedProduct.name}</strong>
                  {result.suggestedOfferName && <> — العرض المقترح: {result.suggestedOfferName}</>}
                  {!result.productMatchConfident && ' (تأكد من المنتج المختار)'}
                </span>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 rtl:space-x-reverse pt-3 border-t border-[var(--sys-destructive-border)]">
              <Button variant="outline" onClick={() => setResult(null)}>
                إلغاء
              </Button>
              <Button onClick={handleConfirm} loading={saving}>
                <RiCheckboxCircleLine className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
                {/* A BUTTON THAT NAMES A PRICE MUST NAME A REAL ONE. It read
                    «تسجيل الطلب (0.00)» over an empty box, which is the
                    figure the reviewer then believed they were recording. */}
                تسجيل الطلب ({priceFigure === undefined ? '—' : <Money value={priceFigure} />})
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
