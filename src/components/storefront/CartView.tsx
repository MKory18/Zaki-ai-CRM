'use client';

import Link from 'next/link';
import { moneyText } from '@/lib/money';
import { useCart } from './useCart';

/**
 * THE BASKET, AS THE SHOPPER SEES IT.
 *
 * NOT ONE FIGURE IS COMPUTED HERE. Every line total, the subtotal and the
 * amount due at the door come from `/quote` — the same resolver and the
 * same `computeCod` the order is charged by. The one thing this file
 * decides about money is how to write a number down, and even that goes
 * through `moneyText` so a price on this page reads exactly as it does on
 * every other.
 *
 * AND IT SAYS «الدفع عند الاستلام» WHERE THE TOTAL IS. The customer this
 * shop sells to is deciding whether to trust it; the sentence that answers
 * that is worth more beside the number than anywhere else on the page.
 */
export function CartView({ slug, minorUnit }: { slug: string; minorUnit: number }) {
  const cart = useCart(slug);

  const card: React.CSSProperties = {
    background: 'var(--store-card)',
    border: '1px solid var(--store-border)',
    borderRadius: 'var(--store-radius)',
  };

  if (!cart.ready) {
    // The server rendered nothing; saying «empty» before the device has
    // been read would flash «سلتك فارغة» at somebody whose cart is full.
    return <p style={{ color: 'var(--store-muted)' }}>جارٍ فتح السلة…</p>;
  }

  if (cart.lines.length === 0) {
    return (
      <div className="space-y-4 p-6 text-center" style={card}>
        <p className="font-bold">سلتك فارغة</p>
        <p className="text-sm" style={{ color: 'var(--store-muted)' }}>
          أضف منتجاً وسيظهر هنا.
        </p>
        <Link
          href={`/s/${slug}`}
          className="inline-block px-5 py-2.5 text-sm font-bold"
          style={{
            background: 'var(--store-accent)',
            color: 'var(--store-accent-text)',
            borderRadius: 'var(--store-radius)',
          }}
        >
          تصفّح المتجر
        </Link>
      </div>
    );
  }

  const money = (value: number) => moneyText(value, cart.quote?.currency ?? null, minorUnit);

  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {cart.lines.map((line) => {
          const priced = cart.quote?.lines.find(
            (l) => l.productId === line.productId && (l.offerId ?? null) === line.offerId
          );
          const where = { productId: line.productId, offerId: line.offerId };
          return (
            <li key={`${line.productId}:${line.offerId ?? ''}`} className="flex gap-3 p-3" style={card}>
              {/*
                A designed empty state, not a broken image. «بطاقات المنتجات
                بلا صور وبلا حالة بديلة مصممة» is on the brief's list of
                mistakes this engine does not repeat.
              */}
              {priced?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={priced.image}
                  alt=""
                  width={64}
                  height={64}
                  loading="lazy"
                  className="h-16 w-16 shrink-0 object-cover"
                  style={{ borderRadius: 'var(--store-radius)' }}
                />
              ) : (
                <div
                  aria-hidden
                  className="h-16 w-16 shrink-0"
                  style={{
                    background: 'var(--store-surface-2)',
                    border: '1px solid var(--store-border)',
                    borderRadius: 'var(--store-radius)',
                  }}
                />
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="truncate text-sm font-bold">{priced?.name ?? '…'}</p>
                {priced?.offerName && (
                  <p className="text-xs" style={{ color: 'var(--store-muted)' }}>
                    {priced.offerName}
                    {priced.freeQuantity > 0 && <> · {priced.freeQuantity} مجاناً</>}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`qty-${line.productId}-${line.offerId ?? ''}`}>
                    الكمية
                  </label>
                  <input
                    id={`qty-${line.productId}-${line.offerId ?? ''}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={line.quantity}
                    onChange={(e) => cart.setQuantity(where, Number(e.target.value))}
                    className="w-16 px-2 py-1.5 text-sm"
                    style={{
                      background: 'var(--store-page)',
                      color: 'var(--store-text)',
                      border: '1px solid var(--store-border)',
                      borderRadius: 'var(--store-radius)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => cart.remove(where)}
                    className="text-xs underline"
                    style={{ color: 'var(--store-muted)' }}
                  >
                    إزالة
                  </button>
                </div>
              </div>
              <p className="shrink-0 text-sm font-bold" style={{ color: 'var(--store-price)' }}>
                {priced ? money(priced.lineTotal) : '…'}
              </p>
            </li>
          );
        })}
      </ul>

      {cart.error && (
        <p role="alert" className="text-sm font-medium" style={{ color: 'var(--store-danger)' }}>
          {cart.error}
        </p>
      )}

      <div className="space-y-3 p-4" style={card}>
        <div className="flex items-baseline justify-between">
          <span className="font-bold">المجموع</span>
          <span className="text-lg font-bold" style={{ color: 'var(--store-price)' }}>
            {cart.quote ? money(cart.quote.cod) : cart.pricing ? 'جارٍ الحساب…' : '—'}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--store-muted)' }}>
          الدفع عند الاستلام — لا شيء يُدفع الآن.
        </p>
        <Link
          href={`/s/${slug}/checkout`}
          aria-disabled={!cart.quote}
          className="block w-full px-5 py-3 text-center text-base font-bold"
          style={{
            background: 'var(--store-accent)',
            color: 'var(--store-accent-text)',
            borderRadius: 'var(--store-radius)',
            opacity: cart.quote ? 1 : 0.6,
            pointerEvents: cart.quote ? undefined : 'none',
          }}
        >
          إتمام الطلب
        </Link>
      </div>
    </div>
  );
}
