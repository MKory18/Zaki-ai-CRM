'use client';

import { useState } from 'react';
import { shopFetch } from '@/lib/storefront-fetch';

/**
 * FIVE STARS, A FIRST NAME, A CITY, AND A TICK.
 *
 * There is no field here for a phone, a surname or an address, and that is
 * not a filter — it is the whole of the privacy promise, written as the
 * shape of the form. The column does not exist either (see
 * prisma/schema.prisma's `ProductReview`), so there is nowhere for a later
 * edit to put one.
 *
 * THE TICK IS NOT TICKED FOR THEM. Consent the server supplies is not
 * consent, and consent the form pre-fills is the same thing with a nicer
 * name on it. The button says what pressing it does.
 *
 * It POSTs the token in the BODY, not in a query string: the link is a
 * credential for one order and a query string is the browser's history,
 * the access log and the next page's referrer.
 */
export function RatingForm({ slug, token }: { slug: string; token: string }) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [firstName, setFirstName] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The shopper's fetch, not the dashboard's: `apiFetch` sends a 401 to
      // /login, which would take a customer to the seller's back office.
      const res = await shopFetch(`/api/public/stores/${slug}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, text, firstName, city, consent }),
      });
      const body = await res.json();
      if (res.ok) setDone(true);
      else setError(typeof body?.error === 'string' ? body.error : 'تعذّر إرسال التقييم الآن');
    } catch (e) {
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

  if (done) {
    return (
      <div
        className="space-y-2 p-5"
        style={{
          background: 'var(--store-card)',
          border: '1px solid var(--store-border)',
          borderRadius: 'var(--store-radius)',
        }}
      >
        <p className="text-base font-bold">شكراً لك — وصلنا تقييمك.</p>
        {/* SAID PLAINLY, because it is true: a review is read before it is
            shown. A page that implied it is already live would be lying
            about the moderation the seller actually does. */}
        <p className="text-sm">بيظهر على صفحة المنتج بعد ما نقرأه.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 block text-sm font-bold">تقييمك</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="تقييمك من 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} من 5`}
              onClick={() => setRating(n)}
              className="px-4 py-3 text-base font-bold"
              style={{
                ...field,
                background: n <= rating ? 'var(--store-accent)' : 'var(--store-page)',
                color: n <= rating ? 'var(--store-accent-text)' : 'var(--store-text)',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="rev-text" className="mb-1.5 block text-sm font-bold">
          رأيك بالمنتج
        </label>
        <textarea
          id="rev-text"
          name="text"
          rows={4}
          maxLength={600}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full px-3 py-3 text-base outline-none"
          style={field}
        />
      </div>

      <div>
        <label htmlFor="rev-name" className="mb-1.5 block text-sm font-bold">
          اسمك الأول
        </label>
        <input
          id="rev-name"
          name="firstName"
          type="text"
          maxLength={40}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full px-3 py-3 text-base outline-none"
          style={field}
        />
        {/* The sentence that says why only the first name is asked for. */}
        <p className="mt-1 text-xs" style={{ color: 'var(--store-muted)' }}>
          بيظهر الاسم الأول والمحافظة فقط — لا رقم ولا عنوان.
        </p>
      </div>

      <div>
        <label htmlFor="rev-city" className="mb-1.5 block text-sm font-bold">
          محافظتك
        </label>
        <input
          id="rev-city"
          name="city"
          type="text"
          maxLength={60}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full px-3 py-3 text-base outline-none"
          style={field}
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="consent"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        <span>موافق على نشر رأيي على صفحة المنتج.</span>
      </label>

      <button
        type="submit"
        disabled={busy || !consent}
        className="w-full px-5 py-3 text-base font-bold disabled:opacity-60"
        style={{
          background: 'var(--store-accent)',
          color: 'var(--store-accent-text)',
          borderRadius: 'var(--store-radius)',
        }}
      >
        {busy ? 'جارٍ الإرسال…' : 'إرسال التقييم'}
      </button>

      {error && (
        <p role="alert" className="text-sm font-medium" style={{ color: 'var(--store-danger)' }}>
          {error}
        </p>
      )}
    </form>
  );
}
