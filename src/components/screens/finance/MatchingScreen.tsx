'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { RiGitBranchLine, RiLoader4Line } from '@remixicon/react';
import { EmptyState } from '@/components/ui/EmptyState';
import { DifferenceActions } from '@/components/screens/finance/DifferenceActions';
import { DifferencesByPerson } from '@/components/screens/finance/DifferencesByPerson';
import { useToast } from '@/components/ui/Toast';
import { Rows } from '@/components/ui/Rows';
import { Money } from '@/components/ui/Money';
import { isApproved } from '@/lib/settlement-gates';

/**
 * /finance/matching — the outcome of matching, read as four queues: agreed,
 * different amount, in the statement but not in the system, and delivered
 * here but absent from the statement. Nothing is edited here; a difference
 * is resolved on the order or by a reversing entry, never by overwriting.
 */

interface Match {
  id: string;
  result: 'MATCHED' | 'MISMATCHED' | 'MISSING_IN_SYSTEM' | 'MISSING_IN_STATEMENT';
  matchedBy: string | null;
  expectedAmount: string | number | null;
  statementAmount: string | number | null;
  difference: string | number | null;
  expectedFee: string | number | null;
  statementFee: string | number | null;
  feeDifference: string | number | null;
  note: string | null;
  /** ACCEPTED_COURIER | OURS_STANDS — null while nobody has answered. */
  resolution: string | null;
  resolutionNote: string | null;
  order: { id: string; orderNumber: string; merchantRef: string | null; shippingStatus: string } | null;
  statementLine: { merchantRef: string | null; barcode: string | null; amount: string | number } | null;
}

interface StatementRow {
  id: string;
  reference: string;
  status: string;
  /** Set when the money moved. Matching is refused after it. */
  approvedAt: string | null;
  currencyCode: string;
  counts: { lines: number; receipts: number; matches: number };
}

const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

export function MatchingScreen() {
  const toast = useToast();
  const [statements, setStatements] = useState<StatementRow[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiJson<{ statements: StatementRow[] }>('/api/finance/statements')
      .then((d) => {
        setStatements(d.statements);
        const withMatches = d.statements.find((s) => s.counts.matches > 0) ?? d.statements[0];
        if (withMatches) setSelected(withMatches.id);
      })
      .catch((e) => toast.failed(e instanceof Error ? e.message : 'تعذر التحميل'));
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setMatches(null);
    try {
      const data = await apiJson<{ statement: { matches: Match[] } }>(`/api/finance/statements/${id}`);
      setMatches(data.statement.matches);
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load(selected);
  }, [selected, load]);

  const statement = statements?.find((s) => s.id === selected);
  const queue = (result: Match['result']) => (matches ?? []).filter((m) => m.result === result);

  /**
   * MATCHING IS REFUSED AFTER APPROVAL, AND THE BUTTON SAYS SO.
   *
   * Re-running it rewrites the rows that decide which orders were settled and
   * whose commission became payable — and it used to write `status` back to
   * MATCHED, which reopened the approval and let the courier's cash be posted
   * into the wallet a second time. The server refuses it now; this is the same
   * rule, read from the same function, so the button is grey instead of red.
   */
  const closed = statement ? isApproved(statement) : false;
  const noReceipt = (statement?.counts.receipts ?? 0) === 0;
  const whyNot = closed
    ? 'الكشف معتمد — لا تُعاد مطابقته. أيّ تصحيح بعد الاعتماد يكون بقيد عكسي.'
    : noReceipt
      ? 'سجّل إيصال الاستلام أولاً'
      : 'إعادة تشغيل المطابقة';

  return (
    <div className="max-w-6xl space-y-3">
      <ScreenTitle />
      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[220px]">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الكشف</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border-input)] text-sm bg-[var(--sys-card)]"
          >
            <option value="">اختر كشفاً…</option>
            {(statements ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.reference} — {s.counts.matches} مطابقة
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!selected || busy || noReceipt || closed}
          title={whyNot}
          onClick={async () => {
            setBusy(true);
            try {
              await apiJson(`/api/finance/statements/${selected}/match`, { method: 'POST' });
              await load(selected);
            } catch (e) {
              toast.failed(e instanceof Error ? e.message : 'تعذرت المطابقة');
            } finally {
              setBusy(false);
            }
          }}
          className="h-10 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
        >
          {busy ? <RiLoader4Line className="w-4 h-4 animate-spin" /> : <RiGitBranchLine className="w-4 h-4" />}
          تشغيل المطابقة
        </button>
      </div>

      {closed && (
        <p className="text-xs text-[var(--sys-muted-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-3">
          هذا الكشف معتمد ومالُه في المحفظة — تُقرأ نتيجتُه هنا ولا تُعاد مطابقتُه. أيّ تصحيح بعد
          الاعتماد يكون بقيد عكسي على المحفظة، لا بإعادة حساب الكشف.
        </p>
      )}

      {!selected ? null : !matches ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : matches.length === 0 ? (
        <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-6 text-center">
          لم تُشغَّل المطابقة على هذا الكشف بعد.
        </p>
      ) : (
        <div className="space-y-3">
          {/* The sum of the answers given below it: who keeps arriving short. */}
          <DifferencesByPerson currency={statement?.currencyCode ?? ''} />
          <Queue
            title="مطابق"
            tone="emerald"
            currency={statement?.currencyCode ?? ''}
            rows={queue('MATCHED')}
            hint="المبلغ في الكشف يساوي المتوقَّع — تُعتمد هذه الطلبات وتصبح عمولتها مستحقة عند اعتماد الكشف."
          />
          <Queue
            title="فرق في المبلغ"
            resolvable
            statementId={selected}
            onResolved={() => void load(selected!)}
            tone="rose"
            currency={statement?.currencyCode ?? ''}
            rows={queue('MISMATCHED')}
            hint="راجع الطلب نفسه: تسليم جزئي غير مسجَّل، أو أجرة توصيل أعلى من المتفق عليه. التصحيح يكون على الطلب أو بقيد عكسي — لا بتعديل الكشف."
          />
          <Queue
            title="في الكشف وليس عندنا"
            resolvable
            statementId={selected}
            onResolved={() => void load(selected!)}
            tone="amber"
            currency={statement?.currencyCode ?? ''}
            rows={queue('MISSING_IN_SYSTEM')}
            hint="مرجع لا يقابله طلب في هذا المتجر — غالباً كشف شركة أخرى أو مرجع مكتوب خطأً."
          />
          <Queue
            title="مسلَّم عندنا وليس في الكشف"
            resolvable
            statementId={selected}
            onResolved={() => void load(selected!)}
            tone="amber"
            currency={statement?.currencyCode ?? ''}
            rows={queue('MISSING_IN_STATEMENT')}
            hint="طلبات سُلِّمت ولم تُذكر في الكشف — مبالغ لم تُحصَّل بعد، طالِب بها."
          />
        </div>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  emerald: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success)]/40',
  rose: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]',
  amber: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/40',
};

function Queue({
  title,
  tone,
  rows,
  hint,
  currency,
  resolvable,
  statementId,
  onResolved,
}: {
  title: string;
  tone: string;
  rows: Match[];
  hint: string;
  currency: string;
  /** A difference queue: every row here is a question somebody must answer. */
  resolvable?: boolean;
  statementId?: string | null;
  onResolved?: () => void;
}) {
  const [open, setOpen] = useState(rows.length > 0 && tone !== 'emerald');

  return (
    <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-right"
      >
        <span className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full border ${TONE[tone]}`}>{rows.length}</span>
          <span className="text-sm font-medium text-[var(--sys-heading)]">{title}</span>
        </span>
        <span className="text-xs text-[var(--sys-muted)]">{open ? 'إخفاء' : 'عرض'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--sys-border)]">
          <p className="text-xs text-[var(--sys-muted-foreground)] px-4 py-2 bg-[var(--sys-surface)]">{hint}</p>
          {rows.length === 0 ? (
            <EmptyState title="لا شيء في هذه المجموعة" why={hint} />
          ) : (
            <Rows
              rows={rows}
              keyOf={(m) => m.id}
              alert={(m) => num(m.difference) !== null && num(m.difference) !== 0}
              columns={[
                {
                  key: 'barcode',
                  label: 'باركود الشحنة',
                  primary: true,
                  // The barcode IS the reference: the courier assigns it and
                  // writes their statement in it. Our own number sits under
                  // it, smaller, as the fallback key.
                  render: (m) => (
                    <span dir="ltr">
                      <span className="block font-medium">{m.statementLine?.barcode ?? '—'}</span>
                      {(m.statementLine?.merchantRef ?? m.order?.merchantRef) && (
                        <span className="block text-xs text-[var(--sys-muted)]">
                          {m.statementLine?.merchantRef ?? m.order?.merchantRef}
                        </span>
                      )}
                    </span>
                  ),
                },
                {
                  key: 'order',
                  label: 'الطلب',
                  primary: true,
                  render: (m) =>
                    m.order ? (
                      <a href={`/orders/${m.order.id}`} className="text-[var(--sys-primary)] hover:underline" dir="ltr">
                        {m.order.orderNumber}
                      </a>
                    ) : (
                      <span className="text-[var(--sys-muted)]">—</span>
                    ),
                },
                {
                  key: 'expected',
                  label: 'المتوقَّع',
                  align: 'end',
                  render: (m) =>
                    num(m.expectedAmount) === null ? '—' : <Money value={num(m.expectedAmount)!} currency={currency} />,
                },
                {
                  key: 'stated',
                  label: 'في الكشف',
                  align: 'end',
                  render: (m) =>
                    num(m.statementAmount) === null ? '—' : <Money value={num(m.statementAmount)!} currency={currency} />,
                },
                {
                  key: 'gap',
                  label: 'الفرق',
                  align: 'end',
                  render: (m) => {
                    const diff = num(m.difference);
                    return diff === null ? (
                      '—'
                    ) : (
                      <Money value={diff} currency={currency} tone={diff ? 'lost' : undefined} />
                    );
                  },
                },
                {
                  key: 'fee',
                  label: 'أجرة التوصيل',
                  align: 'end',
                  render: (m) => {
                    const feeDiff = num(m.feeDifference);
                    if (num(m.statementFee) === null) return <span className="text-[var(--sys-muted)]">—</span>;
                    return feeDiff ? (
                      <span className="text-xs font-medium text-[var(--sys-destructive)]">
                        {num(m.statementFee)} بدل {num(m.expectedFee)}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--sys-muted-foreground)]">{num(m.statementFee)}</span>
                    );
                  },
                },
                ...(resolvable && statementId
                  ? [
                      {
                        key: 'resolve',
                        label: 'البتّ في الفرق',
                        render: (m: Match) => (
                          <DifferenceActions
                            statementId={statementId}
                            matchId={m.id}
                            orderId={m.order?.id ?? null}
                            orderNumber={m.order?.orderNumber ?? null}
                            resolution={m.resolution}
                            resolutionNote={m.resolutionNote}
                            onResolved={() => onResolved?.()}
                          />
                        ),
                      },
                    ]
                  : []),
                {
                  key: 'via',
                  label: 'طوبق عبر',
                  // A desk's column. On a card it is one more labelled line
                  // between the reader and the number they came for.
                  hideOnPhone: true,
                  render: (m) =>
                    m.matchedBy === 'MERCHANT_REF' ? 'المرجع' : m.matchedBy === 'BARCODE' ? 'الباركود' : '—',
                },
              ]}
              empty={<EmptyState title="لا أسطر في هذه المجموعة" why={hint} />}
            />
          )}
        </div>
      )}
    </div>
  );
}
