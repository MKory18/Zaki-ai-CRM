'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CheckoutField } from '@/lib/store-theme';
import { cartToOrderItems } from '@/lib/cart';
import { moneyText } from '@/lib/money';
import { shopFetch } from '@/lib/storefront-fetch';
import { useCart } from './useCart';

/**
 * ONE PAGE, NO ACCOUNT, THE PHONE IS THE IDENTITY.
 *
 * THE FIELDS ARE THE SELLER'S, NOT THIS FILE'S. Their order and which of
 * them are required come from `checkoutOrder` and `requiredCheckoutFields`
 * — the shop's own checkout tab. A list hard-coded here would be a second
 * answer to «what does this shop ask for», and the tab would quietly stop
 * meaning anything.
 *
 * AND THE SUMMARY IS THE SERVER'S. The amount beside the button is the
 * quote, which is the same resolver and the same `computeCod` the order
 * will be charged by. Nothing on this page adds anything up.
 *
 * The honeypot is `website`, checked server-side and never stored. It is
 * hidden from sight AND from screen readers, and it is not focusable: a
 * person tabbing through the form must never land in it.
 */

const LABEL: Record<CheckoutField, string> = {
  name: 'الاسم الكامل',
  phone: 'رقم الهاتف',
  altPhone: 'رقم هاتف بديل',
  region: 'المحافظة',
  address: 'العنوان بالتفصيل',
  note: 'ملاحظة للمندوب',
};

/** What each field is called when the order is sent. */
const WIRE: Record<CheckoutField, string> = {
  name: 'full_name',
  phone: 'phone',
  altPhone: 'alt_phone',
  region: 'city',
  address: 'address',
  note: 'notes',
};

export function CheckoutForm({
  slug,
  minorUnit,
  fields,
  required,
  regions,
  submitText,
}: {
  slug: string;
  minorUnit: number;
  fields: CheckoutField[];
  required: CheckoutField[];
  regions: string[];
  submitText: string;
}) {
  const router = useRouter();
  const cart = useCart(slug);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !cart.quote) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await shopFetch(`/api/public/stores/${slug}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, items: cartToOrderItems(cart.lines) }),
      });
      const body = await res.json();
      if (res.ok && body?.orderNumber) {
        // The basket became an order; leaving it on the device would let a
        // refresh place the same order twice.
        cart.clear();
        router.push(`/s/${slug}/thanks?o=${encodeURIComponent(String(body.orderNumber))}`);
        return;
      }
      if (body?.fieldErrors && typeof body.fieldErrors === 'object') {
        setFieldErrors(body.fieldErrors as Record<string, string>);
      }
      setError(typeof body?.error === 'string' ? body.error : 'تعذّر إرسال الطلب');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'تعذّر الاتصال');
    } finally {
      setBusy(false);
    }
  }

  const box: React.CSSProperties = {
    background: 'var(--store-page)',
    color: 'var(--store-text)',
    border: '1px solid var(--store-border)',
    borderRadius: 'var(--store-radius)',
  };

  if (cart.ready && cart.lines.length === 0) {
    return <p style={{ color: 'var(--store-muted)' }}>سلتك فارغة — أضف منتجاً قبل إتمام الطلب.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {fields.map((field) => {
        const wire = WIRE[field];
        const isRequired = required.includes(field);
        const err = fieldErrors[wire];
        return (
          <div key={field}>
            <label htmlFor={`co-${field}`} className="mb-1.5 block text-sm font-bold">
              {LABEL[field]}
              {isRequired && <span aria-hidden> *</span>}
            </label>
            {field === 'region' ? (
              <select
                id={`co-${field}`}
                name={wire}
                required={isRequired}
                value={values[wire] ?? ''}
                onChange={(e) => set(wire, e.target.value)}
                className="w-full px-3 py-3 text-base"
                style={box}
              >
                <option value="">اختر المحافظة</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : field === 'note' ? (
              <textarea
                id={`co-${field}`}
                name={wire}
                rows={3}
                required={isRequired}
                value={values[wire] ?? ''}
                onChange={(e) => set(wire, e.target.value)}
                className="w-full px-3 py-3 text-base"
                style={box}
              />
            ) : (
              <input
                id={`co-${field}`}
                name={wire}
                type={field === 'phone' || field === 'altPhone' ? 'tel' : 'text'}
                inputMode={field === 'phone' || field === 'altPhone' ? 'tel' : undefined}
                dir={field === 'phone' || field === 'altPhone' ? 'ltr' : undefined}
                autoComplete={
                  field === 'name' ? 'name' : field === 'phone' ? 'tel' : field === 'address' ? 'street-address' : 'off'
                }
                required={isRequired}
                value={values[wire] ?? ''}
                onChange={(e) => set(wire, e.target.value)}
                className="w-full px-3 py-3 text-base"
                style={box}
              />
            )}
            {err && (
              <p className="mt-1 text-xs font-medium" style={{ color: 'var(--store-danger)' }}>
                {err}
              </p>
            )}
          </div>
        );
      })}

      {/* Not shown, not announced, not reachable by keyboard. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        value={values.website ?? ''}
        onChange={(e) => set('website', e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
      />

      {error && (
        <p role="alert" className="text-sm font-medium" style={{ color: 'var(--store-danger)' }}>
          {error}
        </p>
      )}

      <div
        className="space-y-3 p-4"
        style={{
          background: 'var(--store-card)',
          border: '1px solid var(--store-border)',
          borderRadius: 'var(--store-radius)',
        }}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-bold">المطلوب عند الاستلام</span>
          <span className="text-lg font-bold" style={{ color: 'var(--store-price)' }}>
            {cart.quote
              ? moneyText(cart.quote.cod, cart.quote.currency, minorUnit)
              : cart.pricing
                ? 'جارٍ الحساب…'
                : '—'}
          </span>
        </div>
        <button
          type="submit"
          disabled={busy || !cart.quote}
          className="w-full px-5 py-3.5 text-base font-bold disabled:opacity-60"
          style={{
            background: 'var(--store-accent)',
            color: 'var(--store-accent-text)',
            borderRadius: 'var(--store-radius)',
          }}
        >
          {busy ? 'جارٍ الإرسال…' : submitText}
        </button>
        <p className="text-center text-xs" style={{ color: 'var(--store-muted)' }}>
          الدفع عند الاستلام — لا شيء يُدفع الآن.
        </p>
      </div>
    </form>
  );
}
