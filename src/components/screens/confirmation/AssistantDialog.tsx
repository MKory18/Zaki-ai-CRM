'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { apiJson } from '@/lib/api-client';

/**
 * THE SUGGESTION, BESIDE THE FACTS IT WAS MADE FROM.
 *
 * A panel that shows only the model's paragraph asks to be believed. So the
 * record it was given is printed next to it — how many orders, how many
 * returns, whether there is an address — and she can see in one glance
 * whether the advice matches the customer or was invented.
 *
 * There is no button here that changes the order. Confirming, rejecting,
 * postponing and pricing stay where they were: in her hands, in the row
 * behind this dialog.
 */

interface Context {
  order: {
    number: string;
    total: number;
    currency: string;
    city: string | null;
    hasAddress: boolean;
    notes: string | null;
    items: { name: string; quantity: number }[];
  };
  customer: {
    name: string;
    orders: number;
    returns: number;
    returnRate: number;
    tier: 'SAFE' | 'WATCH' | 'HIGH';
    requiresPrepaymentOrApproval: boolean;
    previous: { number: string; state: string; total: number; at: string }[];
  } | null;
}

interface Answer {
  suggestion: string | null;
  context: Context;
  error?: string;
}

const TIER_TEXT: Record<string, string> = {
  SAFE: 'خطورة منخفضة',
  WATCH: 'تحت المراقبة',
  HIGH: 'خطورة عالية',
};

function Fact({ label, value, alarm }: { label: string; value: string; alarm?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-[var(--sys-muted-foreground)]">{label}</span>
      <span
        className={`text-sm tabular-nums ${alarm ? 'text-[var(--sys-destructive)] font-medium' : 'text-[var(--sys-heading)]'}`}
        dir="auto"
      >
        {value}
      </span>
    </div>
  );
}

export function AssistantDialog({
  orderId,
  orderNumber,
  onClose,
}: {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    apiJson<Answer>('/api/ai/confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
      .then((d) => alive && setAnswer(d))
      .catch((e: Error) => alive && setFailed(e.message));
    return () => {
      alive = false;
    };
  }, [orderId]);

  const copy = useCallback(() => {
    if (!answer?.suggestion) return;
    navigator.clipboard.writeText(answer.suggestion).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [answer]);

  const customer = answer?.context.customer;

  return (
    <Modal isOpen onClose={onClose} title="مساعد التأكيد" subtitle={`الطلب ${orderNumber}`} maxWidth="2xl">
      <div className="space-y-4">
        {/* The record first. What the model was told is what she can check it against. */}
        {answer && (
          <section className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] px-4 py-2">
            <h4 className="text-xs font-medium text-[var(--sys-foreground)] mb-1">ما أُعطي للمساعد</h4>
            <div className="divide-y divide-[var(--sys-border)]">
              {customer && (
                <>
                  <Fact label="طلبات سابقة" value={String(customer.orders)} />
                  <Fact
                    label="مرتجعات"
                    value={`${customer.returns} (${Math.round(customer.returnRate * 100)}٪)`}
                    alarm={customer.returns > 0}
                  />
                  <Fact
                    label="التصنيف"
                    value={TIER_TEXT[customer.tier] ?? customer.tier}
                    alarm={customer.tier === 'HIGH'}
                  />
                </>
              )}
              <Fact
                label="العنوان"
                value={answer.context.order.hasAddress ? 'مكتمل' : 'ناقص'}
                alarm={!answer.context.order.hasAddress}
              />
              {answer.context.order.city && <Fact label="المدينة" value={answer.context.order.city} />}
              {answer.context.order.notes && <Fact label="ملاحظة الزبون" value={answer.context.order.notes} />}
            </div>
            {customer && customer.previous.length > 0 && (
              <ul className="mt-2 pt-2 border-t border-[var(--sys-border)] space-y-1">
                {customer.previous.map((p) => (
                  <li key={p.number} className="flex items-center justify-between text-xs text-[var(--sys-muted-foreground)]">
                    <span className="tabular-nums" dir="ltr">{p.number}</span>
                    <span>{p.state}</span>
                    <span className="tabular-nums" dir="ltr">{p.at}</span>
                  </li>
                ))}
              </ul>
            )}
            {customer && customer.previous.length === 0 && (
              <p className="mt-2 pt-2 border-t border-[var(--sys-border)] text-xs text-[var(--sys-muted-foreground)]">
                لا طلبات سابقة لهذا الزبون.
              </p>
            )}
          </section>
        )}

        {/* Then the suggestion. */}
        {!answer && !failed && (
          <p className="flex items-center gap-2 text-sm text-[var(--sys-muted-foreground)] py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> جارٍ القراءة…
          </p>
        )}

        {failed && <p className="text-sm text-[var(--sys-destructive)]">{failed}</p>}

        {answer?.error && <p className="text-sm text-[var(--sys-warning)]">{answer.error}</p>}

        {answer?.suggestion && (
          <section>
            <div className="flex items-center justify-between mb-1">
              <h4 className="flex items-center gap-1.5 text-xs font-medium text-[var(--sys-foreground)]">
                <Sparkles className="w-3.5 h-3.5 text-[var(--sys-primary)]" /> اقتراح
              </h4>
              <button
                onClick={copy}
                className="flex items-center gap-1 text-xs text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'نُسخ' : 'انسخ'}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-[var(--sys-heading)] leading-7 rounded-lg border border-[var(--sys-border)] px-4 py-3">
              {answer.suggestion}
            </p>
          </section>
        )}

        <p className="text-[11px] text-[var(--sys-muted)] border-t border-[var(--sys-border)] pt-2">
          اقتراح فقط. التأكيد والإلغاء والتأجيل والسعر تبقى قرارك أنت — لا يغيّر المساعد شيئاً في الطلب.
        </p>
      </div>
    </Modal>
  );
}
