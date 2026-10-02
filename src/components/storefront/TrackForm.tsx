'use client';

import { useState } from 'react';
import { TRACKING_STEPS, STEP_LABEL_AR, type TrackingStep } from '@/lib/order-tracking';
import { shopFetch } from '@/lib/storefront-fetch';

/**
 * TWO FIELDS, AND ONE ANSWER.
 *
 * It POSTs. A phone number in a query string ends up in the browser's
 * history, the access log and the next page's referrer — the shape of the
 * request is the privacy decision, and it is the same decision the route
 * makes on its side.
 *
 * AND IT REPEATS THE SERVER'S SENTENCE RATHER THAN WRITING ITS OWN. Every
 * failure answers identically on purpose, so that a stranger cannot tell a
 * wrong reference from a wrong phone. A friendlier message composed here
 * for one of those cases would hand back exactly the difference the route
 * went to trouble to remove.
 */

interface Tracking {
  orderNumber: string;
  placedAt: string;
  stateAr: string;
  step: TrackingStep | null;
  stepLabelAr: string | null;
  eta: string | null;
  finished: boolean;
}

export function TrackForm({ slug }: { slug: string }) {
  const [phone, setPhone] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Tracking | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // The shopper's fetch, not the dashboard's: `apiFetch` sends a 401
      // to /login, which would take a customer to the seller's back office.
      const res = await shopFetch(`/api/public/stores/${slug}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, orderNumber }),
      });
      const body = await res.json();
      if (res.ok) setResult(body as Tracking);
      else setError(typeof body?.error === 'string' ? body.error : 'تعذّر عرض حالة الطلب الآن');
    } catch (e) {
      // The wrapper's own timeout sentence when it has one, so a slow
      // connection is named as a timeout rather than as «no internet».
      setError(e instanceof Error && e.message ? e.message : 'تعذّر الاتصال. تحقّق من الإنترنت وحاول ثانية.');
    } finally {
      setBusy(false);
    }
  }

  const field: React.CSSProperties = {
    background: 'var(--store-page)',
    color: 'var(--store-text)',
    border: '1px solid var(--store-border)',
    borderRadius: 'var(--store-radius)',
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="track-phone" className="mb-1.5 block text-sm font-bold">
            رقم الهاتف
          </label>
          <input
            id="track-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-3 text-base outline-none"
            style={field}
          />
        </div>
        <div>
          <label htmlFor="track-ref" className="mb-1.5 block text-sm font-bold">
            رقم الطلب
          </label>
          <input
            id="track-ref"
            name="orderNumber"
            type="text"
            dir="ltr"
            required
            placeholder="ORD-1234"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            className="w-full px-3 py-3 text-base outline-none"
            style={field}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full px-5 py-3 text-base font-bold disabled:opacity-60"
          style={{
            background: 'var(--store-accent)',
            color: 'var(--store-accent-text)',
            borderRadius: 'var(--store-radius)',
          }}
        >
          {busy ? 'جارٍ البحث…' : 'تتبّع الطلب'}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm font-medium" style={{ color: 'var(--store-danger)' }}>
          {error}
        </p>
      )}

      {result && (
        <div
          className="space-y-4 p-5"
          style={{
            background: 'var(--store-card)',
            border: '1px solid var(--store-border)',
            borderRadius: 'var(--store-radius)',
          }}
        >
          <p className="text-base font-bold">{result.stateAr}</p>

          {/*
            The line only appears for an order that is ON it. An order that
            came back or was cancelled has a sentence, not a position — and
            drawing it at «step 1 of 4» would say it is still coming.
          */}
          {result.step && (
            <ol className="flex items-center gap-1.5" aria-label="مراحل الطلب">
              {TRACKING_STEPS.map((step) => {
                const at = TRACKING_STEPS.indexOf(result.step as TrackingStep);
                const done = TRACKING_STEPS.indexOf(step) <= at;
                return (
                  <li key={step} className="flex-1 space-y-1.5">
                    <div
                      className="h-1.5 w-full"
                      style={{
                        background: done ? 'var(--store-accent)' : 'var(--store-border)',
                        borderRadius: 'var(--store-radius)',
                      }}
                    />
                    <span
                      className="block text-xs leading-tight"
                      style={{ color: done ? 'var(--store-text)' : 'var(--store-muted)' }}
                    >
                      {STEP_LABEL_AR[step]}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {result.eta && (
            <p className="text-sm" style={{ color: 'var(--store-muted)' }}>
              {result.eta}
            </p>
          )}
          <p className="text-xs" style={{ color: 'var(--store-muted)' }}>
            طلب <bdi dir="ltr">{result.orderNumber}</bdi> — بتاريخ{' '}
            <bdi dir="ltr">{result.placedAt}</bdi>
          </p>
        </div>
      )}
    </div>
  );
}
