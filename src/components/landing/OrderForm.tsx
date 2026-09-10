'use client';

import React, { useMemo, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, ShoppingBag, Search } from 'lucide-react';
import { SYRIAN_LOCATIONS } from '@/lib/locations/syria';

/**
 * Trusted Native Order Form — rendered by Zaki AI itself on the public
 * landing page (BELOW the sandboxed iframe holding the uploaded HTML).
 *
 * Security contract:
 *  - sends ONLY: full_name, phone, address, city, offerId, notes (+ honeypot)
 *  - NEVER sends companyId / productId / price / quantity / freeQuantity /
 *    status / userId — the server derives everything from slug + offerId.
 *  - offers & prices arrive as server-rendered props straight from the DB.
 *  - the uploaded landing-page HTML (opaque-origin sandbox) cannot access
 *    or manipulate this form in any way.
 */

export interface OfferView {
  id: string;
  name: string;
  quantity: number;
  freeQuantity: number;
  price: number;
  isDefault: boolean;
  isBest?: boolean; // flagged client-side: cheapest per unit
}

export interface RecommendationView {
  id: string;
  name: string;
  price: number;
  image: string | null;
}

interface OrderFormProps {
  slug: string;
  productName: string;
  basePrice: number; // unit price (for savings display) — from DB
  currency: string;
  offers: OfferView[];
  recommendations: RecommendationView[];
}

type FormState = 'idle' | 'loading' | 'success' | 'error';

const fmt = (n: number) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function OrderForm({ slug, productName, basePrice, currency, offers, recommendations }: OrderFormProps) {
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ orderNumber: string | null; addonToken: string | null }>({ orderNumber: null, addonToken: null });
  const [selectedOffer, setSelectedOffer] = useState<string>(
    offers.find((o) => o.isDefault)?.id || offers[0]?.id || ''
  );
  const [addons, setAddons] = useState<Record<string, 'added' | 'adding'>>({});
  const [totals, setTotals] = useState<{ total: number } | null>(null);

  const offer = useMemo(() => offers.find((o) => o.id === selectedOffer) || offers[0], [offers, selectedOffer]);
  const originalPrice = useMemo(() => (offer ? Number((basePrice * offer.quantity).toFixed(2)) : basePrice), [basePrice, offer]);
  const savings = useMemo(() => (offer ? Math.max(0, Number((originalPrice - offer.price).toFixed(2))) : 0), [originalPrice, offer]);

  // ─── City searchable select ───
  const [cityOpen, setCityOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityValue, setCityValue] = useState('');
  const cityOptions = useMemo(() => {
    const q = cityQuery.trim();
    if (!q) return SYRIAN_LOCATIONS;
    return SYRIAN_LOCATIONS.map((l) => ({
      governorate: l.governorate,
      cities: l.cities.filter((c) => c.includes(q)),
    })).filter((l) => l.governorate.includes(q) || l.cities.length > 0);
  }, [cityQuery]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const data = {
      full_name: String(fd.get('full_name') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      address: String(fd.get('address') || '').trim(),
      city: cityValue,
      offerId: selectedOffer,
      notes: String(fd.get('notes') || '').trim(),
      // honeypot (hidden from humans — bots may fill it)
      website: String(fd.get('website') || ''),
      ts: String(Date.now()),
    };

    setState('loading');
    setErrorMsg(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/public/landing-pages/${encodeURIComponent(slug)}/orders`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setResult({ orderNumber: json?.orderNumber || null, addonToken: json?.addonToken || null });
        setTotals(null);
        setState('success');
      } else {
        setErrorMsg(json?.error || 'تعذر إرسال الطلب، حاول مرة أخرى');
        if (json?.fieldErrors && typeof json.fieldErrors === 'object') {
          setFieldErrors(json.fieldErrors);
        }
        setState('error');
      }
    } catch {
      setErrorMsg('تعذر الاتصال بالسيرفر، تحقق من الإنترنت وأعد المحاولة');
      setState('error');
    }
  }

  async function addRecommendation(recId: string) {
    if (!result.addonToken || !result.orderNumber) return;
    setAddons((a) => ({ ...a, [recId]: 'adding' }));
    try {
      const res = await fetch(
        `/api/public/landing-pages/${encodeURIComponent(slug)}/orders/${encodeURIComponent(result.orderNumber!)}/add-product`,
        {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: result.addonToken, recommendationId: recId }),
        }
      );
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setAddons((a) => ({ ...a, [recId]: 'added' }));
        if (typeof json?.newTotal === 'number') setTotals({ total: json.newTotal });
      } else {
        setAddons((a) => {
          const n = { ...a };
          delete n[recId];
          return n;
        });
        setErrorMsg(json?.error || 'تعذر إضافة المنتج');
        setTimeout(() => setErrorMsg(null), 4000);
      }
    } catch {
      setAddons((a) => {
        const n = { ...a };
        delete n[recId];
        return n;
      });
      setErrorMsg('تعذر الاتصال، حاول مرة أخرى');
      setTimeout(() => setErrorMsg(null), 4000);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-[#e3e8ef] bg-white px-4 py-3 text-base text-[#121926] placeholder:text-[#9aa4b2] focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e] transition-colors';
  const labelCls = 'block text-sm font-semibold text-[#364152] mb-1.5';
  const fieldErr = (key: string) => fieldErrors[key];
  const FieldError = ({ k }: { k: string }) =>
    fieldErr(k) ? (
      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {fieldErr(k)}
      </p>
    ) : null;
  const hasOffers = offers.length > 0;

  return (
    <section
      id="zaki-order-form"
      dir="rtl"
      className="w-full bg-[#f7f7f8] px-4 py-10 sm:px-6"
      aria-label="نموذج الطلب"
    >
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-[#e3e8ef] bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-[#121926] px-5 py-5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#697586]">
              اطلب الآن
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">{productName}</h2>
            <p className="mt-1 text-2xl font-extrabold text-[#b8256e]" dir="ltr">
              {fmt(offer ? offer.price : basePrice)} {currency}
            </p>
          </div>

          {state === 'success' ? (
            <div className="px-5 py-8 text-center">
              <p className="text-4xl">✅</p>
              <p className="mt-3 text-lg font-bold text-[#121926]">تم تسجيل طلبك بنجاح</p>
              <p className="mt-2 text-sm text-[#364152]" dir="ltr">
                رقم الطلب: <span className="font-bold">{result.orderNumber}</span>
              </p>
              {totals && (
                <p className="mt-1 text-sm font-semibold text-[#b8256e]" dir="ltr">
                  الإجمالي الحالي: {fmt(totals.total)} {currency}
                </p>
              )}
              <p className="mt-2 text-xs text-[#697586]">سنتواصل معك قريبًا لتأكيد الطلب.</p>

              {/* Post-order upsells */}
              {recommendations.length > 0 && (
                <div className="mt-6 rounded-xl border border-[#e3e8ef] bg-[#f8fafc] p-4 text-start">
                  <p className="mb-3 text-center text-sm font-bold text-[#121926]">
                    🔥 عرض خاص لك — أضفها إلى طلبك الآن
                  </p>
                  <div className="space-y-2">
                    {recommendations.map((rec) => {
                      const st = addons[rec.id];
                      return (
                        <div key={rec.id} className="flex items-center gap-3 rounded-xl border border-[#e3e8ef] bg-white p-3">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f1f3f6]">
                            {rec.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={rec.image} alt={rec.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-lg">🛍️</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#121926]">{rec.name}</p>
                            <p className="text-sm font-bold text-[#b8256e]" dir="ltr">
                              {fmt(rec.price)} {currency}
                            </p>
                          </div>
                          {st === 'added' ? (
                            <span className="flex shrink-0 items-center gap-1 rounded-lg bg-[#e6f9ee] px-3 py-2 text-xs font-bold text-[#00c853]">
                              تمت الإضافة ✅
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addRecommendation(rec.id)}
                              disabled={st === 'adding'}
                              className="shrink-0 rounded-lg bg-[#b8256e] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#b8256e]/90 disabled:opacity-60 active:scale-95"
                            >
                              {st === 'adding' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'أضف إلى طلبي'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {errorMsg && (
                    <p className="mt-2 text-center text-xs text-rose-600">{errorMsg}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4 px-5 py-6">
              {/* ─── Offers (server-provided — replaces the quantity stepper) ─── */}
              {hasOffers && (
                <div>
                  <span className={labelCls}>اختر العرض</span>
                  <div className="space-y-2">
                    {offers.map((o) => {
                      const sel = o.id === selectedOffer;
                      const oOriginal = Number((basePrice * o.quantity).toFixed(2));
                      const oSave = Math.max(0, Number((oOriginal - o.price).toFixed(2)));
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => { setSelectedOffer(o.id); setFieldErrors((fe) => { const n = { ...fe }; delete n.offerId; return n; }); }}
                          className={`w-full rounded-xl border-2 p-3.5 text-start transition ${
                            sel ? 'border-[#b8256e] bg-[#fdf2f7]' : 'border-[#e3e8ef] bg-white hover:border-[#b8256e]/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              {o.isDefault && (
                                <span className="mb-1 inline-block rounded-full bg-[#ffab00] px-2 py-0.5 text-[10px] font-bold text-white">
                                  ⭐ الأكثر طلبًا
                                </span>
                              )}
                              <p className="truncate text-sm font-bold text-[#121926]">{o.name}</p>
                              <p className="mt-0.5 text-[11px] text-[#697586]">
                                {o.quantity} قطعة{o.freeQuantity > 0 ? ` + ${o.freeQuantity} هدية 🎁` : ''}
                              </p>
                              {oOriginal > o.price && (
                                <p className="mt-0.5 text-[11px] font-medium text-[#00a344]">
                                  وفرت {fmt(oOriginal - o.price)}$
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 text-end">
                              <p className="text-lg font-extrabold text-[#b8256e]" dir="ltr">
                                {fmt(o.price)}$
                              </p>
                              {oOriginal > o.price && (
                                <p className="text-xs text-[#9aa4b2] line-through" dir="ltr">
                                  {fmt(oOriginal)}$
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-end">
                            <span
                              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition ${
                                sel ? 'bg-[#b8256e] text-white' : 'bg-[#f8fafc] text-[#697586]'
                              }`}
                            >
                              {sel ? '✓ العرض المختار' : 'اختر هذا العرض'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {offer && offer.freeQuantity > 0 && (
                    <p className="mt-2 text-center text-xs font-semibold text-[#00a344]">
                      🎁 مع {offer.freeQuantity} قطعة هدية مجانًا
                    </p>
                  )}
                </div>
              )}

              {/* الاسم الكامل */}
              <div>
                <label htmlFor="zf-full_name" className={labelCls}>
                  الاسم الكامل <span className="text-[#b8256e]">*</span>
                </label>
                <input
                  id="zf-full_name"
                  name="full_name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  placeholder="اكتب اسمك الكامل"
                  className={inputCls}
                  disabled={state === 'loading'}
                />
                <FieldError k='full_name' />
              </div>

              {/* رقم الهاتف */}
              <div>
                <label htmlFor="zf-phone" className={labelCls}>
                  رقم الهاتف <span className="text-[#b8256e]">*</span>
                </label>
                <input
                  id="zf-phone"
                  name="phone"
                  type="tel"
                  required
                  minLength={7}
                  maxLength={20}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09xxxxxxxxx"
                  dir="ltr"
                  className={`${inputCls} text-start`}
                  disabled={state === 'loading'}
                />
                <FieldError k='phone' />
              </div>

              {/* العنوان */}
              <div>
                <label htmlFor="zf-address" className={labelCls}>
                  العنوان <span className="text-[#b8256e]">*</span>
                </label>
                <input
                  id="zf-address"
                  name="address"
                  type="text"
                  required
                  minLength={5}
                  maxLength={200}
                  autoComplete="street-address"
                  placeholder="المنطقة، الشارع، أقرب علامة مميزة"
                  className={inputCls}
                  disabled={state === 'loading'}
                />
                <FieldError k="address" />
              </div>

              {/* المدينة / الولاية — searchable Syrian locations */}
              <div className="relative">
                <label htmlFor="zf-city" className={labelCls}>
                  المدينة / الولاية <span className="text-[#b8256e]">*</span>
                </label>
                <button
                  type="button"
                  id="zf-city"
                  onClick={() => { setCityOpen((o) => !o); }}
                  className={`${inputCls} flex items-center justify-between text-start ${cityValue ? '' : 'text-[#9aa4b2]'}`}
                  disabled={state === 'loading'}
                  aria-haspopup="listbox"
                  aria-expanded={cityOpen}
                >
                  <span className="truncate">{cityValue || 'اختر المدينة أو الولاية'}</span>
                  <svg className="h-4 w-4 shrink-0 text-[#697586]" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.72-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" /></svg>
                </button>
                <FieldError k="city" />
                {cityOpen && (
                  <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-hidden rounded-xl border border-[#e3e8ef] bg-white shadow-lg">
                    <div className="relative border-b border-[#e3e8ef]">
                      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa4b2]" />
                      <input
                        type="text"
                        autoFocus
                        value={cityQuery}
                        onChange={(e) => setCityQuery(e.target.value)}
                        placeholder="ابحث عن المحافظة أو المدينة…"
                        className="w-full border-0 px-4 py-3 pr-9 text-sm focus:outline-none"
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {SYRIAN_LOCATIONS.map((loc) => {
                        const govMatch = loc.governorate.includes(cityQuery.trim());
                        const cities = govMatch ? loc.cities : loc.cities.filter((c) => c.includes(cityQuery.trim()));
                        if (!govMatch && cities.length === 0) return null;
                        return (
                          <div key={loc.governorate}>
                            <button
                              type="button"
                              onClick={() => { setCityValue(loc.governorate); setCityOpen(false); setCityQuery(''); setFieldErrors((fe) => { const n = { ...fe }; delete n.city; return n; }); }}
                              className="block w-full bg-[#f8fafc] px-4 py-2 text-start text-xs font-bold text-[#b8256e] hover:bg-[#fdf2f7]"
                            >
                              📍 {loc.governorate}
                            </button>
                            {(govMatch ? loc.cities : cities).map((city) => (
                              <button
                                key={city}
                                type="button"
                                onClick={() => { setCityValue(city); setCityOpen(false); setCityQuery(''); setFieldErrors((fe) => { const n = { ...fe }; delete n.city; return n; }); }}
                                className={`block w-full px-6 py-2 text-start text-sm hover:bg-[#f8fafc] ${cityValue === city ? 'bg-[#fdf2f7] font-semibold text-[#b8256e]' : 'text-[#364152]'}`}
                              >
                                {city}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                      {SYRIAN_LOCATIONS.every((loc) => !loc.governorate.includes(cityQuery.trim()) && !loc.cities.some((c) => c.includes(cityQuery.trim()))) && (
                        <p className="px-4 py-6 text-center text-xs text-[#9aa4b2]">لا توجد نتائج مطابقة</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ملاحظات */}
              <div>
                <label htmlFor="zf-notes" className={labelCls}>
                  ملاحظات
                </label>
                <textarea
                  id="zf-notes"
                  name="notes"
                  rows={3}
                  maxLength={500}
                  placeholder="أي تفاصيل إضافية (اختياري)"
                  className={`${inputCls} resize-none`}
                  disabled={state === 'loading'}
                />
              </div>

              {/* Honeypot — hidden from humans */}
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <label htmlFor="zf-website">Website</label>
                <input id="zf-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
              </div>

              {/* Error */}
              {state === 'error' && errorMsg && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={state === 'loading' || (!hasOffers && false) || (hasOffers && !selectedOffer)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b8256e] px-5 py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#b8256e]/90 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]"
              >
                {state === 'loading' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    جارٍ تسجيل الطلب...
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-5 w-5" />
                    تأكيد الطلب{offer ? ` — ${fmt(offer.price)} ${currency}` : ''}
                  </>
                )}
              </button>

              {offer && savings > 0 && (
                <p className="text-center text-xs font-medium text-[#00a344]">
                  بدل {fmt(originalPrice)}$ — {fmt(offer.price)}$ • وفرت {fmt(savings)}$
                  {offer.freeQuantity > 0 ? ` • 🎁 +${offer.freeQuantity} هدية` : ''}
                </p>
              )}
              <p className="text-center text-[11px] text-[#697586]">
                بالضغط على تأكيد الطلب، سيتواصل معك فريقنا لتأكيد الطلب والتوصيل. الدفع عند الاستلام.
              </p>
            </form>
          )}
        </div>

        {/* Trust badges */}
        <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-[#697586]">
          <span>دفع عند الاستلام</span>
          <span className="text-[#c9d0da]">•</span>
          <span>توصيل لجميع المحافظات</span>
        </div>
      </div>
    </section>
  );
}

export default OrderForm;