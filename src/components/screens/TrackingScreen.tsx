'use client';

import { lateLabel } from '@/lib/transit';
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SHIPPING_STATUS_AR } from '@/lib/shipping-workflow';
import { ContactButtons } from '@/components/orders/ContactButtons';
import { TransferDialog } from '@/components/screens/tracking/TransferDialog';
import { CollectDialog } from '@/components/screens/tracking/CollectDialog';
import { DeliverDialog } from '@/components/screens/tracking/DeliverDialog';
import { apiJson } from '@/lib/api-client';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { Rows } from '@/components/ui/Rows';
import { RiChat1Line, RiCheckLine, RiCloseLine, RiEBike2Line, RiEyeLine, RiHandCoinLine, RiLoader4Line, RiSearchLine, RiTimerLine, RiTruckLine } from '@remixicon/react';
import { ALERT_AR, ALERT_CONFIRM_AR, type TrackingAlertKind } from '@/lib/tracking-alert';
import { useAsk, useConfirm } from '@/components/ui/Confirm';
import { EmptyState } from '@/components/ui/EmptyState';
import { HealthChip } from '@/components/ui/HealthChip';
import {
  MATCHES,
  URGENCY,
  byUrgency,
  canCollect,
  trackingUrgency,
  type ConditionKey,
} from '@/lib/tracking-priority';
import { Money } from '@/components/ui/Money';

/**
 * /ops/tracking — search by order, reference, barcode, customer or phone.
 * Days in transit and the late flag come from the API against each region's
 * own threshold. Collection status is its own column, never merged with the
 * delivery status.
 */

interface Row {
  id: string;
  orderNumber: string;
  merchantRef: string | null;
  trackingNumber: string | null;
  shippingStatus: string;
  collectionStatus: string;
  daysInTransit: number | null;
  lateThresholdDays: number;
  late: boolean;
  totalAmount: number;
  currency: string;
  deliveryFailureReason: string | null;
  customer: { fullName: string; phone: string; city: string };
  region: { name: string } | null;
  deliveryProvider: { id: string; name: string; kind?: string } | null;
  deliveryFee?: number | null;
  priceIncludesDelivery?: boolean;
  collectedAmount?: number | null;
  /**
   * What the courier owes for this parcel, from `expectedAmountFor` on the
   * server. The route has always sent it; this type did not declare it, so
   * the selection bar derived its own figure and printed a different one.
   */
  expectedCollection?: number | null;
  settlementStatus?: string;
  _count?: { deliveryAttempts: number; notes: number };
  /** Cancelled while the parcel moves, or changed after it left. */
  alert?: { kind: TrackingAlertKind; at: string; acknowledged: boolean } | null;
}

/**
 * THE TWO THINGS THAT MAKE CHASING A PARCEL POINTLESS OR WRONG.
 *
 * Red: the order was cancelled and the parcel is still out. Orange: an
 * approved change was written onto it, so the address on this screen is
 * not the one she last read.
 *
 * Both fade once acknowledged — they do not disappear. The row still says
 * what happened; it stops shouting.
 */
const ALERT_TONE: Record<TrackingAlertKind, { live: string; seen: string }> = {
  CANCELLED: {
    live: 'bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)] text-[var(--sys-destructive)]',
    seen: 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)]',
  },
  CHANGED: {
    live: 'bg-[var(--sys-warning-soft)] border-[var(--sys-warning)]/40 text-[var(--sys-warning)]',
    seen: 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)]',
  },
};

/*
 * The words come from `SHIPPING_STATUS_AR`. This screen was the only one
 * saying «خارج للتوصيل» while five others said «خرج للتوصيل».
 */
const STATUS_LABEL: Record<string, string> = SHIPPING_STATUS_AR;

/**
 * The filter is «الكل» or one of the conditions, and the conditions are named
 * in one place so a chip cannot drift from the rank that sorts the list.
 */
type TaskFilter = 'all' | ConditionKey;

/** A chip's colour, from the same four tones the whole product judges with. */
const TASK_TONE: Record<string, string> = {
  bad: 'bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)] text-[var(--sys-destructive)]',
  ok: 'bg-[var(--sys-warning-soft)] border-[var(--sys-warning)]/40 text-[var(--sys-warning)]',
  good: 'bg-[var(--sys-success-soft)] border-[var(--sys-success)]/40 text-[var(--sys-success)]',
  unknown: 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)]',
};

const COLLECTION_LABEL: Record<string, string> = {
  NOT_APPLICABLE: 'لا ينطبق',
  PENDING: 'بانتظار',
  PENDING_COLLECTION: 'لم يُحصَّل',
  COLLECTED: 'محصَّل',
  SETTLED: 'مسوّى',
  UNSETTLED: 'غير مسوّى',
};

export function TrackingScreen() {
  /*
   * «شحنة مفقودة عند شركة الشحن» names one parcel and links here. The
   * link is the order's number, which is one of the things this screen's
   * own search matches — so clicking the alert shows that parcel, not
   * every parcel in the store.
   */
  const [term, setTerm] = useState(useSearchParams().get('order') ?? '');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<{ orders: Row[]; lateCount: number; dialCode?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [transferFor, setTransferFor] = useState<Row | null>(null);
  const [deliverFor, setDeliverFor] = useState<Row | null>(null);
  const [noting, setNoting] = useState<string | null>(null);
  /** The order whose door outcome is being written, so its buttons wait. */
  const [settling, setSettling] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [collecting, setCollecting] = useState(false);
  /** The row whose alert is being acknowledged right now. */
  const [acking, setAcking] = useState<string | null>(null);
  const [task, setTask] = useState<TaskFilter>('all');

  const ask = useAsk();
  // A plain yes/no: refusing a parcel needs a confirmation, not a sentence.
  const confirm = useConfirm();

  /**
   * «رأيتُ هذا» — recorded, not dismissed.
   *
   * It asks first and says exactly what it will write, because the one
   * thing this button must never be mistaken for is an action on the
   * order: the parcel is still out there either way.
   */
  const acknowledge = async (o: Row) => {
    if (!o.alert) return;
    const ok = await confirm({
      title: `${ALERT_AR[o.alert.kind]} — ${o.merchantRef ?? o.orderNumber}`,
      body: ALERT_CONFIRM_AR[o.alert.kind],
      confirmLabel: 'أدركتُ',
    });
    if (!ok) return;
    setAcking(o.id);
    try {
      await apiJson('/api/ops/tracking/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: o.id, kind: o.alert.kind }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تسجيل الإقرار');
    } finally {
      setAcking(null);
    }
  };

  /**
   * MOST OF WHAT A FOLLOW-UP AGENT LEARNS IS NOT AN OUTCOME.
   *
   * «رنّيت ثلاث مرّات ما ردّ», «المندوب قال بكرة الصبح», «الزبون طلب
   * يأجّلها ليوم الخميس». None of that is a delivery, a refusal or a
   * transfer, and the row offered nothing for it — so it was kept in a
   * notebook, or in the agent's head, and the next person to open the order
   * started from nothing.
   *
   * It writes through the order's own notes door, which already exists and
   * is already the immutable thread every screen reads. No second place for
   * notes to live, and nothing here settles anything.
   */
  const addNote = async (row: Row) => {
    const answer = await ask({
      title: `ملاحظة على ${row.orderNumber}`,
      body: 'تُضاف باسمك إلى ملاحظات الطلب ويقرؤها التأكيد والمرتجعات. لا تُغيّر حالة الطلب ولا تُسجّل تسليماً.',
      confirmLabel: 'أضِفها',
      input: { label: 'ما الذي حدث؟', placeholder: 'مثال: المندوب قال يسلّمها غداً صباحاً', multiline: true },
    });
    const body = (answer ?? '').trim();
    if (!body) return;

    setNoting(row.id);
    try {
      await apiJson(`/api/orders/${row.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, kind: 'follow_up' }),
      });
      setDone(`أُضيفت الملاحظة إلى ${row.orderNumber}`);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ الملاحظة');
    } finally {
      setNoting(null);
    }
  };

  /**
   * «استلم» و«رفض» — نداءٌ واحد، والسيرفر يقرأ بنودَ الطلب بنفسه.
   *
   * Sending `outcome` rather than a line list keeps the screen from having
   * to know the lines to say something the order already knows, and keeps
   * the fee rule in the one place that has it.
   */
  const settle = async (o: Row, outcome: 'ALL' | 'NONE') => {
    if (outcome === 'NONE') {
      const ok = await confirm({
        title: `${o.merchantRef ?? o.orderNumber} — لم يستلم شيئاً؟`,
        body: 'يصير الطلبُ مرتجعاً. البضاعةُ لا تعود إلى المخزون الآن — تعود عند استلامها فعلياً في المرتجعات.',
        confirmLabel: 'نعم، رفضه',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setSettling(o.id);
    setError(null);
    try {
      const res = await apiJson<{ message: string }>('/api/ops/tracking/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: o.id, outcome }),
      });
      setDone(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التسجيل');
    } finally {
      setSettling(null);
    }
  };

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (term.trim()) q.set('q', term.trim());
    if (status) q.set('status', status);
    try {
      setData(await apiJson(`/api/ops/tracking?${q}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [term, status]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * THE WORK WAITING, FROM ONE DEFINITION OF EACH CONDITION.
   *
   * Every predicate here used to be written inline, and `canCollect` was
   * written a second time for the checkbox. They live in
   * `tracking-priority.ts` now, which is also what ranks and sorts the rows —
   * so a chip and the order of the list can never disagree about what
   * «متأخرة» means.
   *
   * The two alert conditions are new chips. They were the most important
   * thing on the row and the only way to find them was to scroll: measured,
   * 9 rows of 171 carry one and all 9 were unacknowledged.
   *
   * A chip with nothing in it is not drawn. Seven greyed-out targets above
   * the list is most of a phone screen spent saying "nothing here", and
   * «الكل» already carries the total.
   */
  /**
   * WHO WE ARE RINGING AND ABOUT WHAT — described once.
   *
   * The same buttons are drawn in two places: a column on the desk and a
   * full-width row on the card. Two copies of this object is two message
   * templates that fill differently depending on which screen width somebody
   * happened to open.
   */
  const contactFor = (o: Row) => ({
    phone: o.customer.phone,
    countryCode: data?.dialCode ?? null,
    context: {
      orderNumber: o.merchantRef ?? o.orderNumber,
      customerName: o.customer.fullName,
      amount: o.totalAmount,
      currency: o.currency,
      courier: o.deliveryProvider?.name ?? null,
      barcode: o.trackingNumber,
      region: o.region?.name ?? o.customer.city,
    },
  });

  const all = data?.orders ?? [];
  const tasks = (['CANCELLED', 'CHANGED', 'FAILED', 'RETURNING', 'LATE', 'NO_BARCODE', 'COLLECT'] as ConditionKey[])
    .map((key) => ({ key, rows: all.filter(MATCHES[key]) }))
    .filter((t) => t.rows.length > 0);

  // A filter on a condition that no longer holds for any row is a dead end:
  // its chip is gone, so the list reads as empty with nothing highlighted to
  // press back out of. Acknowledging the last alert does exactly that.
  const openTask: TaskFilter = task !== 'all' && !tasks.some((t) => t.key === task) ? 'all' : task;

  // Worst first, longest-waiting within that — see `byUrgency` for why the
  // API's oldest-first order is kept as the tiebreak rather than dropped.
  const visible = (openTask === 'all' ? all : all.filter(MATCHES[openTask])).slice().sort(byUrgency);
  const collectable = visible.filter(canCollect);
  const chosen = collectable.filter((o) => selected[o.id]);
  /*
   * THE SERVER'S FIGURE, which was in the row all along and unread.
   *
   * This used to be `totalAmount − deliveryFee`, summed here. That is not
   * the settlement expectation and the two disagree TODAY, not someday:
   * `canCollect` includes PARTIALLY_DELIVERED, and `expectedAmountFor`
   * answers 0 for a returned parcel and uses `collectedAmount` for a
   * partial one. For 23 taken of a 40 order with a fee of 3 the server
   * says 20 and this bar printed 37 — then `CollectDialog`, which sums
   * `expectedCollection`, said 20 seconds later on the same selection.
   *
   * `CollectDialog` already carries the scar of exactly this bug in its own
   * comment; the fix landed on the dialog and missed the screen that opens
   * it. The route sends `expectedCollection` at
   * `api/ops/tracking/route.ts`, and the `Row` type did not even declare
   * it, which is why nobody noticed.
   *
   * The `.toFixed(3)` went with it: three places is a global rule on a
   * screen whose rows each know their own currency, and the server rounds
   * by the minor unit before sending.
   */
  const netOfChosen = chosen.reduce((sum, o) => sum + Number(o.expectedCollection ?? 0), 0);

  return (
    <div className="max-w-6xl space-y-3">
      <ScreenTitle />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 flex flex-wrap gap-3 items-end"
      >
        <label className="flex-1 min-w-[220px]">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">بحث</span>
          <div className="relative">
            <RiSearchLine className="w-4 h-4 text-[var(--sys-muted)] absolute right-3 top-3" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="رقم الطلب، المرجع، الباركود، اسم العميل أو الهاتف"
              className="w-full h-11 md:h-10 pr-9 pl-3 rounded-lg border border-[var(--sys-border-input)] text-sm"
            />
          </div>
        </label>
        <label>
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الحالة</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border-input)] text-sm">
            <option value="">قيد الشحن</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
            <option value="all">الكل</option>
          </select>
        </label>
        <button type="submit" className="h-11 md:h-10 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium">بحث</button>
        {data && data.lateCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg px-3 h-10">
            <RiTimerLine className="w-4 h-4" /> {data.lateCount} شحنة متأخرة
          </span>
        )}
      </form>

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>}
      {done && <p className="text-sm text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/30 rounded-lg p-3">{done}</p>}

      {data && all.length > 0 && (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setTask('all'); setSelected({}); }}
            className={`min-h-11 md:min-h-0 inline-flex items-center text-xs px-2.5 py-1 rounded-full border ${
              openTask === 'all' ? 'bg-[var(--sys-heading)] text-[var(--sys-primary-foreground)] border-[var(--sys-heading)]' : 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)]'
            }`}
          >
            الكل {all.length}
          </button>
          {tasks.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTask(t.key); setSelected({}); }}
              title={URGENCY[t.key].why}
              className={`min-h-11 md:min-h-0 inline-flex items-center text-xs px-2.5 py-1 rounded-full border ${
                openTask === t.key
                  ? 'bg-[var(--sys-heading)] text-[var(--sys-primary-foreground)] border-[var(--sys-heading)]'
                  : TASK_TONE[URGENCY[t.key].tone]
              }`}
            >
              {URGENCY[t.key].label} {t.rows.length}
            </button>
          ))}
        </div>
      )}

      {/* Manual settlement: a مندوب — and any company that sends no file —
          has no statement to import, so collection is done by naming the
          orders here. Only delivered, unsettled ones can be chosen. */}
      {collectable.length > 0 && (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-[var(--sys-muted-foreground)]">
            {chosen.length > 0
              ? `مختار ${chosen.length} طلب · صافي ${netOfChosen}`
              : `${collectable.length} طلب مسلَّم بانتظار التحصيل اليدوي`}
          </span>
          <button
            onClick={() => setSelected(Object.fromEntries(collectable.map((o) => [o.id, true])))}
            className="text-xs text-[var(--sys-primary)] hover:underline"
          >
            اختر الكل
          </button>
          {chosen.length > 0 && (
            <>
              <button onClick={() => setSelected({})} className="text-xs text-[var(--sys-muted-foreground)] hover:underline">
                إلغاء الاختيار
              </button>
              <button
                onClick={() => setCollecting(true)}
                className="h-11 md:h-8 px-3 rounded-lg bg-[var(--sys-success)] text-[var(--sys-primary-foreground)] text-xs font-medium inline-flex items-center gap-1.5 mr-auto"
              >
                <RiHandCoinLine className="w-4 h-4" /> استلمت منه
              </button>
            </>
          )}
        </div>
      )}

      {!data ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <Rows
          rows={visible}
          keyOf={(o) => o.id}
          empty={
            <EmptyState
              title="لا شحناتٍ في هذا المرشِّح"
              why={
                openTask === 'all'
                  ? 'لا شحنة تطابق البحث أو الحالة المختارة أعلاه. وسّع البحث أو اختر «الكل» في الحالة.'
                  : `لا شحنة ${URGENCY[openTask].label} الآن. اضغط «الكل» لترى كل ما هو قيد الشحن.`
              }
            />
          }
          /*
            THE RED MEANS THE ALERT NOW, NOT LATENESS.
            Measured: 152 of 171 rows are late, so tinting late rows red
            tinted nine rows in ten — which is not a signal, it is the
            background colour. The 9 rows carrying a live alert were the same
            red as everything else. Lateness is still said, loudly, in its own
            column: destructive colour, the day count, and «متأخرة N يوماً».
          */
          alert={(o) => !!o.alert && !o.alert.acknowledged}
          /*
            AND THE ALERT IS THE FIRST THING ON THE CARD, WITH ITS BUTTON.
            On a phone it used to be a small chip beside the reference and the
            button was a text link at the bottom of the card among five
            others. All 9 live alerts in the database are unacknowledged,
            which is what a button nobody can find looks like.
          */
          notice={(o) =>
            o.alert && (
              <div
                className={`rounded-lg border p-2.5 ${
                  o.alert.acknowledged ? ALERT_TONE[o.alert.kind].seen : ALERT_TONE[o.alert.kind].live
                }`}
              >
                <p className="text-sm font-bold leading-relaxed">
                  {ALERT_AR[o.alert.kind]}
                  {o.alert.acknowledged && ' · رآه'}
                </p>
                {!o.alert.acknowledged && (
                  <>
                    {/* What to DO, not what the button writes — the dialog
                        says that when it is pressed. A phone has room for one
                        sentence and it should be the actionable one. */}
                    <p className="mt-0.5 text-xs leading-relaxed">{URGENCY[o.alert.kind].why}</p>
                    <button
                      onClick={() => void acknowledge(o)}
                      disabled={acking === o.id}
                      className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-current px-3 text-sm font-bold disabled:opacity-50"
                    >
                      {acking === o.id ? (
                        <RiLoader4Line className="h-4 w-4 animate-spin" />
                      ) : (
                        <RiEyeLine className="h-4 w-4" aria-hidden />
                      )}
                      أدركتُ الإجراء
                    </button>
                  </>
                )}
              </div>
            )
          }
          selection={{
            canSelect: canCollect,
            isSelected: (o) => !!selected[o.id],
            onToggle: (o, next) => setSelected((sel) => ({ ...sel, [o.id]: next })),
          }}
          columns={[
            {
              key: 'ref',
              label: 'المرجع',
              primary: true,
              render: (o) => (
                <>
                  <span dir="ltr" className="font-medium text-[var(--sys-heading)]">
                    {o.merchantRef ?? o.orderNumber}
                  </span>
                  {/*
                    WHY THIS ROW IS IN FRONT OF YOU, BESIDE ITS NAME.
                    The list is sorted by this, so the chip is also what
                    explains the order: a run of «أُلغي والطرد يسير», then
                    «تعذّر التوصيل», then «متأخرة». Without it the new order
                    would look arbitrary.
                  */}
                  {trackingUrgency(o) !== 'NONE' && (
                    <HealthChip
                      className="mt-1 flex"
                      health={{
                        tone: URGENCY[trackingUrgency(o)].tone,
                        label: URGENCY[trackingUrgency(o)].label,
                        why: URGENCY[trackingUrgency(o)].why,
                      }}
                    />
                  )}
                  {/*
                    On the desk the alert is a cell read at a glance beside
                    everything else. On a phone it is the card's notice, at the
                    top and full width with its own button — so this one is the
                    desk's copy and says so, rather than being drawn twice.
                  */}
                  {o.alert && (
                    <span
                      className={`mt-1 hidden w-fit rounded-md border px-2 py-0.5 text-xs font-semibold md:block ${
                        o.alert.acknowledged
                          ? ALERT_TONE[o.alert.kind].seen
                          : ALERT_TONE[o.alert.kind].live
                      }`}
                    >
                      {ALERT_AR[o.alert.kind]}
                      {o.alert.acknowledged && ' · رآه'}
                    </span>
                  )}
                </>
              ),
            },
            { key: 'customer', label: 'العميل', primary: true, render: (o) => o.customer.fullName },
            {
              key: 'barcode',
              label: 'الباركود',
              // Measured: null on 100% of the default in-flight view and 15%
              // overall, so on a phone this was a labelled line reading «—».
              // The «بلا باركود» chip is how the missing ones are found.
              hideOnPhone: true,
              render: (o) => (
                <span dir="ltr" className="text-[var(--sys-muted-foreground)]">
                  {o.trackingNumber ?? '—'}
                </span>
              ),
            },
            {
              key: 'region',
              label: 'المحافظة',
              render: (o) => o.region?.name ?? o.customer.city,
            },
            {
              key: 'courier',
              label: 'جهة الشحن',
              render: (o) =>
                o.deliveryProvider ? (
                  <span className="inline-flex items-center gap-1 text-[var(--sys-foreground)]">
                    {o.deliveryProvider.kind === 'AGENT' ? (
                      <RiEBike2Line className="h-4 w-4 text-[var(--sys-primary)]" />
                    ) : (
                      <RiTruckLine className="h-4 w-4 text-[var(--sys-muted)]" />
                    )}
                    {o.deliveryProvider.name}
                  </span>
                ) : (
                  <span className="text-[var(--sys-muted)]">—</span>
                ),
            },
            {
              key: 'status',
              label: 'حالة الشحن',
              render: (o) => (
                <>
                  {STATUS_LABEL[o.shippingStatus] ?? o.shippingStatus}
                  {o.deliveryFailureReason && (
                    <span className="block text-xs text-[var(--sys-destructive)]">
                      {o.deliveryFailureReason}
                    </span>
                  )}
                </>
              ),
            },
            {
              key: 'days',
              label: 'أيام الشحن',
              render: (o) => (
                <span
                  className={`tabular-nums ${o.late ? 'font-semibold text-[var(--sys-destructive)]' : 'text-[var(--sys-foreground)]'}`}
                >
                  {o.daysInTransit ?? '—'}
                  {o.lateThresholdDays > 0 && (
                    <span className="text-xs text-[var(--sys-muted)]"> / {o.lateThresholdDays}</span>
                  )}
                  {o.late && o.daysInTransit !== null && (
                    <span className="block text-xs font-medium">{lateLabel(o.daysInTransit)}</span>
                  )}
                </span>
              ),
            },
            {
              key: 'attempts',
              label: 'المحاولات',
              // Measured: 0 on 97% of 171 rows and never above 1. A line that
              // reads «0» on every card is a line nobody reads twice.
              hideOnPhone: true,
              render: (o) => (
                <span className="text-xs">
                  <span
                    className={`tabular-nums ${(o._count?.deliveryAttempts ?? 0) > 1 ? 'font-semibold text-[var(--sys-destructive)]' : 'text-[var(--sys-muted-foreground)]'}`}
                  >
                    {o._count?.deliveryAttempts ?? 0}
                  </span>
                  {(o._count?.notes ?? 0) > 0 && (
                    <span className="mr-2 text-[var(--sys-muted)]"> · {o._count?.notes} ملاحظة</span>
                  )}
                </span>
              ),
            },
            {
              key: 'collection',
              label: 'حالة التحصيل',
              // Measured: the same single value on 91% of rows. What actually
              // varies is whether money is waiting, and that is now the
              // «بانتظار التحصيل» chip, the row's own rank, and the collect
              // bar above the list.
              hideOnPhone: true,
              render: (o) => COLLECTION_LABEL[o.collectionStatus] ?? o.collectionStatus,
            },
            {
              key: 'amount',
              label: 'المبلغ',
              render: (o) => (
                <span dir="ltr" className="tabular-nums">
                  <Money value={o.totalAmount} currency={o.currency} />
                </span>
              ),
            },
            {
              key: 'contact',
              label: 'تواصل',
              /*
                ON A DESK IT IS A COLUMN. ON A CARD IT IS A ROW OF ITS OWN.
                That is what the comment here always said, and it was not what
                happened: a card renders every visible column as a
                label/value line, so the one action this screen exists for was
                squeezed into the right half of a «تواصل» row. It is hidden
                here and rendered full width in `actions` below, from the one
                `contactFor` description of it — so the two cannot drift.
              */
              hideOnPhone: true,
              render: (o) => <ContactButtons compact {...contactFor(o)} />,
            },
          ]}
          actions={(o) => (
            <>
              {/*
                THE BUTTONS THIS SCREEN EXISTS FOR, WHERE A THUMB IS.
                Full width and first on the card, hidden on the desk where the
                «تواصل» column already carries them. Chasing a parcel is a
                phone call; it should not be the hardest thing to press.
              */}
              <div className="w-full md:hidden">
                <ContactButtons {...contactFor(o)} />
              </div>
              {/*
                «مجرد ما تشوف، لازم زر» — and pressing it records who saw
                it, on the order, rather than hiding a colour. A warning
                anybody can switch off is a warning people learn to switch
                off; this one asks first and says what it will write.

                On a phone the card's notice carries this button at the TOP,
                full width, so this copy is the desk's.
              */}
              {o.alert && !o.alert.acknowledged && (
                <button
                  onClick={() => void acknowledge(o)}
                  disabled={acking === o.id}
                  className="hidden min-h-11 items-center gap-1 text-xs font-semibold text-[var(--sys-primary)] hover:underline disabled:opacity-50 md:inline-flex md:min-h-0"
                >
                  {acking === o.id ? <RiLoader4Line className="w-4 h-4 animate-spin" /> : <RiEyeLine className="w-4 h-4" />}
                  أدركتُ الإجراء
                </button>
              )}
              {/*
                THE TWO ANSWERS THE DOOR ACTUALLY GIVES, AS TWO BUTTONS.

                This was one «تسجيل التسليم» that opened a dialog asking
                which lines were taken. Almost every parcel is all of it or
                none of it, and making somebody open a dialog and read a
                line list to say «استلم» is the reason it was reported as
                heavy. The partial case is real but rare, and it keeps the
                dialog — reached from the same place, one tap further.

                NEITHER SETTLES MONEY. What is written here is what
                HAPPENED at the door; the collected amount is written when
                the courier's statement is matched. Both buttons go to the
                one endpoint that has always known that.
              */}
              {['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.shippingStatus) && (
                <>
                  {/*
                    AND THEY STOP LOOKING LIKE THE SAME LINK.
                    «استلم» and «رفض / ملغى» sat next to each other as two
                    bare text links about sixteen pixels tall, eight pixels
                    apart. A mis-tap there marks a parcel returned. Each is a
                    bordered target now, 44px on a phone, sharing the row
                    evenly so neither is the small one.
                  */}
                  <button
                    onClick={() => void settle(o, 'ALL')}
                    disabled={settling === o.id}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--sys-success)]/40 bg-[var(--sys-success-soft)] px-3 text-xs font-bold text-[var(--sys-success)] disabled:opacity-50 md:min-h-0 md:flex-none md:border-0 md:bg-transparent md:px-0 md:hover:underline"
                    title="استلم الطلب كاملاً — يُسجَّل ما حدث، والمبلغ يُكتب عند مطابقة كشف الشركة"
                  >
                    {settling === o.id ? (
                      <RiLoader4Line className="w-4 h-4 animate-spin" />
                    ) : (
                      <RiCheckLine className="w-4 h-4" aria-hidden />
                    )}
                    استلم
                  </button>
                  <button
                    onClick={() => void settle(o, 'NONE')}
                    disabled={settling === o.id}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] px-3 text-xs font-bold text-[var(--sys-destructive)] disabled:opacity-50 md:min-h-0 md:flex-none md:border-0 md:bg-transparent md:px-0 md:hover:underline"
                    title="رفضه أو أُلغي — لم يستلم شيئاً، ويصير مرتجعاً"
                  >
                    <RiCloseLine className="w-4 h-4" aria-hidden />
                    رفض / ملغى
                  </button>
                  <button
                    onClick={() => setDeliverFor(o)}
                    className="inline-flex min-h-11 items-center text-xs text-[var(--sys-muted-foreground)] hover:text-[var(--sys-foreground)] hover:underline md:min-h-0"
                    title="استلم بعض البنود فقط — أشّر ما أخذه بالضبط"
                  >
                    استلم جزءاً
                  </button>
                </>
              )}
              <button
                onClick={() => setTransferFor(o)}
                className="inline-flex min-h-11 items-center text-xs text-[var(--sys-primary)] hover:underline md:min-h-0"
                title={
                  o.deliveryProvider?.kind === 'AGENT'
                    ? 'استلام من المندوب وتحويلها لجهة أخرى'
                    : 'سحب الشحنة وإصدار طلب بديل لجهة أخرى'
                }
              >
                تحويل
              </button>
              {/* The third one, and the only one that settles nothing. */}
              <button
                onClick={() => void addNote(o)}
                disabled={noting === o.id}
                className="inline-flex min-h-11 items-center gap-1 text-xs text-[var(--sys-muted-foreground)] hover:text-[var(--sys-foreground)] hover:underline disabled:opacity-50 md:min-h-0"
                title="اكتب ما حدث — تُضاف كملاحظة داخلية على الطلب ولا تُغيّر حالته"
              >
                {noting === o.id ? (
                  <RiLoader4Line className="w-4 h-4 animate-spin" />
                ) : (
                  <RiChat1Line className="w-4 h-4" aria-hidden />
                )}
                ملاحظة
              </button>
            </>
          )}
        />
      )}

      {collecting && chosen.length > 0 && (
        <CollectDialog
          orders={chosen}
          onClose={() => setCollecting(false)}
          onDone={async (message) => {
            setCollecting(false);
            setSelected({});
            setDone(message);
            setError(null);
            await load();
          }}
        />
      )}

      {deliverFor && (
        <DeliverDialog
          order={deliverFor}
          onClose={() => setDeliverFor(null)}
          onDone={async (message) => {
            setDeliverFor(null);
            setDone(message);
            setError(null);
            await load();
          }}
        />
      )}

      {transferFor && (
        <TransferDialog
          order={transferFor}
          onClose={() => setTransferFor(null)}
          onDone={async (message) => {
            setTransferFor(null);
            setDone(message);
            setError(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
