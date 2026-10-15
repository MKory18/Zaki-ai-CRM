'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiJson } from '@/lib/api-client';
import {
  AUTO_SWITCH_FLOOR,
  HIDE_REASONS,
  HIDE_REASON_LABEL,
  MIN_SHOWN_FOR_AVERAGE,
  REVIEW_MODES,
  REVIEW_MODE_LABEL,
  REVIEW_SOURCE_LABEL,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABEL,
  type HideReason,
  type ReviewMode,
  type ReviewStatus,
// `@/lib/reviews` and NOT `@/lib/product-reviews`: this is a client
// component, and the service half of that pair imports Prisma.
} from '@/lib/reviews';
import { RiEyeOffLine, RiLoader4Line, RiRocketLine, RiShieldCheckLine } from '@remixicon/react';

/**
 * «الآراء» — WHAT BUYERS SAID, AND WHAT THE SHOP DOES ABOUT IT.
 *
 * Owner decision D8. One screen for the three things a seller needs here:
 *
 *  · read what arrived, in three states — بانتظار المراجعة · منشور · مخفي;
 *  · publish, or hide WITH A REASON, which is recorded;
 *  · choose where each product's social proof comes from — يدوي · تلقائي ·
 *    الاتنين — including putting back a switch the system threw itself.
 *
 * ── WHAT IT DELIBERATELY CANNOT DO ──
 *
 * There is NO DELETE and no edit. A review is a customer's words: the shop
 * may decline to show them and may not make them never have been said. And
 * hiding costs one of THREE reasons, not a text box — a free-text reason
 * would be a delete button with extra steps, and the average above it would
 * stop meaning anything.
 *
 * ── THE NUMBER IS SHOWN ONLY WHEN IT IS A NUMBER ──
 *
 * The average appears above the list only from `MIN_SHOWN_FOR_AVERAGE`
 * reviews up. «٤٫٨ من ٥» over two people is a true sentence and a
 * misleading figure, and the screen says which of the two it is holding —
 * because the seller is the person being asked to stand behind it.
 */

const CARD = 'rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4';

interface ReviewRow {
  id: string;
  rating: number;
  text: string;
  firstName: string;
  city: string;
  at: string;
  productId: string;
  productName: string;
  productReviewMode: ReviewMode;
  source: string;
  status: ReviewStatus;
  consent: boolean;
  verified: boolean;
  hiddenReason: string | null;
  hiddenByName: string | null;
  hasProof: boolean;
}

interface Payload {
  reviews: ReviewRow[];
  tally: Record<string, number>;
  shown: { count: number; average: number | null; show: boolean };
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export function StoreReviewsScreen() {
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<ReviewStatus | ''>('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [hiding, setHiding] = useState<{ id: string; reason: HideReason; note: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (status) qs.set('status', status);
      if (term.trim()) qs.set('q', term.trim());
      setData(await apiJson<Payload>(`/api/reviews?${qs.toString()}`));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التحميل' });
    } finally {
      setLoading(false);
    }
  }, [page, status, term]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish(id: string) {
    setBusy(id);
    try {
      const res = await apiJson<{ switchedToAuto?: boolean }>(`/api/reviews/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'publish' }),
      });
      // The screen says it out loud when the publish crossed the floor. A
      // page that changed what it shows in silence is a page the seller
      // stops trusting.
      setMsg({
        ok: true,
        text: res.switchedToAuto
          ? `نُشر — وصار هذا المنتج يعرض آراء المشترين تلقائياً (${AUTO_SWITCH_FLOOR} تقييمات مؤكَّدة).`
          : 'نُشر الرأي.',
      });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر النشر' });
    } finally {
      setBusy(null);
    }
  }

  async function hide() {
    if (!hiding) return;
    setBusy(hiding.id);
    try {
      await apiJson(`/api/reviews/${hiding.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'hide', reason: hiding.reason, note: hiding.note || undefined }),
      });
      setMsg({ ok: true, text: 'أُخفي الرأي، والسبب مسجَّل.' });
      setHiding(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الإخفاء' });
    } finally {
      setBusy(null);
    }
  }

  async function setMode(productId: string, mode: ReviewMode) {
    setBusy(productId);
    try {
      await apiJson('/api/reviews/mode', { method: 'PUT', body: JSON.stringify({ productId, mode }) });
      setMsg({ ok: true, text: 'تغيّر مصدر آراء هذا المنتج.' });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="الآراء"
        description="ما كتبه المشترون بعد التسليم. تنشر، أو تخفي بسبب — ولا يُحذف رأي."
      />

      {/* THE AVERAGE, AND ONLY WHEN IT IS ONE. Below the floor the screen
          says how far off it is instead of printing a figure that reads as
          a measurement. */}
      <div className={CARD}>
        {data?.shown.show && data.shown.average !== null ? (
          <p className="text-sm">
            المعدّل المعروض: <strong className="text-lg">{data.shown.average}</strong> من 5 — على{' '}
            {data.shown.count} رأياً منشوراً.
          </p>
        ) : (
          <p className="text-note text-[var(--sys-muted-foreground)]">
            ما في معدّل معروض بعد: المعدّل يظهر على صفحة المنتج من {MIN_SHOWN_FOR_AVERAGE} آراء منشورة
            وفوق. المعروض الآن {data?.shown.count ?? 0}.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="الحالة"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as ReviewStatus | '');
          }}
          className="max-w-xs"
          options={[
            { value: '', label: `الكل (${data?.pagination.total ?? 0})` },
            ...REVIEW_STATUSES.map((s) => ({
              value: s,
              label: `${REVIEW_STATUS_LABEL[s]} (${data?.tally?.[s] ?? 0})`,
            })),
          ]}
        />
        <Input
          label="بحث"
          placeholder="اسم أو محافظة أو كلمة من النص"
          value={term}
          onChange={(e) => {
            setPage(1);
            setTerm(e.target.value);
          }}
          className="max-w-xs"
        />
      </div>

      {msg && (
        <p
          role="status"
          className={`text-sm font-medium ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}
        >
          {msg.text}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-note text-[var(--sys-muted-foreground)]">
          <RiLoader4Line className="h-4 w-4 animate-spin" />
          جارٍ التحميل…
        </p>
      ) : !data?.reviews.length ? (
        <div className={CARD}>
          <p className="text-note text-[var(--sys-muted-foreground)]">
            ما وصل أي رأي بعد. الرابط بيوصل الزبون من صفحة تتبّع الطلب بعد التسليم، أو تنسخه من
            الطلب وتبعته بواتساب.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.reviews.map((r) => (
            <li key={r.id} className={CARD}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    {r.rating} / 5 — {r.productName}
                    {/* «مشتري مؤكَّد» comes from `verified`, which is the
                        presence of an order and nothing else. A manual item
                        never carries it; see src/lib/product-reviews.ts. */}
                    {r.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sys-success)]/10 px-2 py-0.5 text-xs font-bold text-[var(--sys-success)]">
                        <RiShieldCheckLine className="h-4 w-4" />
                        مشتري مؤكَّد
                      </span>
                    )}
                    <span className="rounded-full bg-[var(--sys-surface)] px-2 py-0.5 text-xs font-medium">
                      {REVIEW_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </p>
                  {/* THE CUSTOMER'S WORDS, AS A TEXT CHILD. React escapes
                      it; nothing here ever renders it as markup. */}
                  <p className="whitespace-pre-wrap text-sm">{r.text || '— بلا نص —'}</p>
                  <p className="text-note text-[var(--sys-muted-foreground)]">
                    {[r.firstName, r.city].filter(Boolean).join(' · ') || 'بلا اسم'} — {r.at} —{' '}
                    {REVIEW_SOURCE_LABEL[r.source as keyof typeof REVIEW_SOURCE_LABEL] ?? r.source}
                    {r.hasProof && ' — معه إثبات خاص (لا يُعرض للزوّار)'}
                    {!r.consent && ' — صاحبه ما وافق على النشر'}
                  </p>
                  {r.status === 'HIDDEN' && r.hiddenReason && (
                    <p className="text-note text-[var(--sys-destructive)]">
                      مخفي: {HIDE_REASON_LABEL[r.hiddenReason as HideReason] ?? r.hiddenReason}
                      {r.hiddenByName ? ` — ${r.hiddenByName}` : ''}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    label="مصدر آراء المنتج"
                    value={r.productReviewMode}
                    disabled={busy === r.productId}
                    onChange={(e) => void setMode(r.productId, e.target.value as ReviewMode)}
                    className="max-w-xs"
                    options={REVIEW_MODES.map((m) => ({ value: m, label: REVIEW_MODE_LABEL[m] }))}
                  />
                  {r.status !== 'PUBLISHED' && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy === r.id || !r.consent}
                      onClick={() => void publish(r.id)}
                    >
                      {/* A rocket, because «نشر» is a rocket on the design
                          screen — one word, one shape, per
                          `one-icon-per-concept.test.ts`. */}
                      <RiRocketLine className="h-4 w-4" />
                      نشر
                    </Button>
                  )}
                  {r.status !== 'HIDDEN' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === r.id}
                      onClick={() => setHiding({ id: r.id, reason: 'ABUSE', note: '' })}
                    >
                      <RiEyeOffLine className="h-4 w-4" />
                      إخفاء
                    </Button>
                  )}
                </div>
              </div>

              {/* THE REASON IS ASKED FOR BEFORE THE HIDE HAPPENS, never
                  after. A dialog that hides first and asks later is a
                  dialog whose answer nobody fills in. */}
              {hiding?.id === r.id && (
                <div className="mt-3 space-y-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3">
                  <Select
                    label="سبب الإخفاء — مطلوب، ويُسجَّل"
                    value={hiding.reason}
                    onChange={(e) => setHiding({ ...hiding, reason: e.target.value as HideReason })}
                    className="max-w-xs"
                    options={HIDE_REASONS.map((h) => ({ value: h, label: HIDE_REASON_LABEL[h] }))}
                  />
                  <Input
                    label="تفصيل (اختياري)"
                    value={hiding.note}
                    maxLength={300}
                    onChange={(e) => setHiding({ ...hiding, note: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" disabled={busy === r.id} onClick={() => void hide()}>
                      إخفاء وتسجيل السبب
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setHiding(null)}>
                      تراجع
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            السابق
          </Button>
          <span className="text-note text-[var(--sys-muted-foreground)]">
            صفحة {data.pagination.page} من {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
