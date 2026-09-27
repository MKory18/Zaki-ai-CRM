'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { useToast } from '@/components/ui/Toast';
import { useAsk, useTell } from '@/components/ui/Confirm';
import { REJECTION_REASON_AR } from '@/lib/confirmation-workflow';
import { RiLoader4Line, RiPhoneLine, RiPriceTag3Line } from '@remixicon/react';

/**
 * /confirmation/winback — the lost orders worth one more call.
 *
 * Three rejection reasons stop being true with time or with a price: «السعر
 * مرتفع», «غيّر رأيه», and three calls nobody answered. Everything else is
 * left alone, and the screen says why rather than hiding it — a supervisor
 * who remembers rejecting an order and cannot find it here concludes the
 * screen is broken, not that the rule excluded it.
 *
 * Making the offer raises a NEW order into the ordinary pool. There is no
 * second queue and no special screen for the agent: she pulls it like any
 * other, sees the discount on it, and calls. The rejected order stays
 * rejected, so «أين نخسر الطلبات» still counts the loss and this gets a
 * conversion rate of its own.
 */

interface Row {
  id: string;
  orderNumber: string;
  customer: { fullName: string; phone: string };
  product: string | null;
  quantity: number;
  sellingPrice: number;
  discountAmount: number;
  rejectionReason: string | null;
  rejectionNote: string | null;
  rejectedAt: string | null;
  verdict:
    | { eligible: true; dueAt: string; maxDiscount: number }
    | { eligible: false; code: string; reason: string; dueAt?: string };
}

export function WinbackScreen() {
  const toast = useToast();
  const ask = useAsk();
  const tell = useTell();
  const [data, setData] = useState<{
    eligible: Row[];
    skipped: Row[];
    skippedCount: number;
    coolingDays: number;
  } | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [offering, setOffering] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiJson(`/api/confirmation/winback${showSkipped ? '?all=1' : ''}`));
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذّر التحميل');
    }
  }, [showSkipped]);

  useEffect(() => {
    void load();
  }, [load]);

  async function offer(r: Row) {
    if (!r.verdict.eligible) return;
    const max = r.verdict.maxDiscount;
    const answer = await ask({
      title: `اعرض على ${r.customer.fullName} من جديد؟`,
      body:
        `${r.product ?? '—'} · ${r.quantity} × ${r.sellingPrice}. أُلغي بسبب «${reasonAr(r.rejectionReason)}».\n` +
        `يُنشأ طلبٌ جديد بالخصم ويدخل الطابور العاديّ — والطلب القديم يبقى ملغى كما هو.\n` +
        `أقصى خصمٍ مسموح: ${max}${r.discountAmount ? ` (محسومٌ عليه ${r.discountAmount} سابقاً، وهو داخلٌ في الحساب)` : ''}.`,
      confirmLabel: 'اعرضه',
      input: { label: 'قيمة الخصم', placeholder: String(max) },
    });
    if (answer === null) return;
    const discount = Number((answer || '').trim());
    if (!isFinite(discount) || discount < 0 || discount > max) {
      toast.failed(`اكتب رقماً بين صفر و${max}`);
      return;
    }

    setOffering(r.id);
    try {
      const res = await apiJson<{ order: { orderNumber: string } }>('/api/confirmation/winback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: r.id, discount }),
      });
      toast.done(`${res.order.orderNumber} في الطابور — يسحبه أوّلُ من يفرغ`);
      await load();
    } catch (e) {
      await tell({
        title: 'تعذّر العرض',
        body: e instanceof Error ? e.message : 'حدث خطأ',
        tone: 'danger',
      });
    } finally {
      setOffering(null);
    }
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScreenTitle
        note={`طلباتٌ أُلغيت لسببٍ يزول بالوقت أو بالسعر، ومضى على إلغائها ${data.coolingDays} يوماً على الأقلّ. العرضُ يُنشئ طلباً جديداً في الطابور، والقديمُ يبقى ملغى.`}
      />

      {data.eligible.length === 0 ? (
        <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
          <EmptyState
            title="لا طلبَ جاهزاً لمحاولةٍ ثانية"
            why={`يُعرض هنا ما أُلغي بسبب السعر أو تغيُّر الرأي أو ثلاثِ محاولاتٍ بلا ردّ، بعد ${data.coolingDays} يوماً، ولم يُعرض عليه من قبل، ولم يُشحن.`}
          />
        </div>
      ) : (
        data.eligible.map((r) => (
          <article
            key={r.id}
            className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 space-y-3"
          >
            <header className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--sys-heading)]" dir="ltr">
                {r.orderNumber}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/30 text-[var(--sys-warning)]">
                {reasonAr(r.rejectionReason)}
              </span>
              <span className="mr-auto text-xs text-[var(--sys-muted-foreground)]">
                أُلغي {r.rejectedAt ? new Date(r.rejectedAt).toISOString().slice(0, 10) : '—'}
              </span>
            </header>

            <p className="text-sm text-[var(--sys-heading)]">
              {r.customer.fullName} · <span dir="ltr">{r.customer.phone}</span>
            </p>
            <p className="text-xs text-[var(--sys-muted-foreground)]">
              {r.product ?? '—'} · {r.quantity} × <Money value={r.sellingPrice} />
              {r.discountAmount > 0 && (
                <> · محسومٌ سابقاً <Money value={r.discountAmount} /></>
              )}
            </p>
            {r.rejectionNote && (
              <p className="text-xs text-[var(--sys-foreground)] bg-[var(--sys-surface)] rounded-lg px-3 py-2">
                {r.rejectionNote}
              </p>
            )}

            <footer className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--sys-border)]">
              <button
                onClick={() => void offer(r)}
                disabled={offering === r.id}
                className="min-h-11 md:min-h-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium disabled:opacity-50"
              >
                {offering === r.id ? (
                  <RiLoader4Line className="w-4 h-4 animate-spin" />
                ) : (
                  <RiPhoneLine className="w-4 h-4" aria-hidden />
                )}
                اعرضه من جديد
              </button>
              <span className="inline-flex items-center gap-1 text-xs text-[var(--sys-muted-foreground)]">
                <RiPriceTag3Line className="w-4 h-4" aria-hidden />
                أقصى خصم <Money value={r.verdict.eligible ? r.verdict.maxDiscount : 0} />
              </span>
            </footer>
          </article>
        ))
      )}

      {/* THE RULE, VISIBLE. Otherwise the screen looks arbitrary. */}
      {data.skippedCount > 0 && (
        <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4 space-y-2">
          <button
            onClick={() => setShowSkipped((v) => !v)}
            className="min-h-11 md:min-h-0 text-xs font-medium text-[var(--sys-primary)] hover:underline"
          >
            {showSkipped ? 'أخفِ' : 'أظهِر'} {data.skippedCount} طلباً ملغىً لا يُعاد عليه — ولماذا
          </button>
          {showSkipped && (
            <ul className="rounded-lg border border-[var(--sys-border)] divide-y divide-[var(--sys-border)]">
              {data.skipped.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                  <span className="font-semibold text-[var(--sys-heading)]" dir="ltr">
                    {r.orderNumber}
                  </span>
                  <span className="text-[var(--sys-muted-foreground)]">
                    {!r.verdict.eligible && r.verdict.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const reasonAr = (code: string | null) => (code ? (REJECTION_REASON_AR[code] ?? code) : 'بلا سبب');
