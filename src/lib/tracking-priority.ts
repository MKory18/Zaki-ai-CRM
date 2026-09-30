import type { HealthTone } from './health';
import type { TrackingAlertKind } from './tracking-alert';

/**
 * WHY THIS PARCEL IS IN FRONT OF YOU, IN ONE WORD.
 *
 * The owner's note: «متابعة الشحن مش منظمة، لازم أنظمها... وبدي أنظمها أكثر
 * كمان لنسخة الـ Mobile Version». The screen was not missing data — it had
 * eleven columns of it. What it was missing was an ORDER and a reason: two
 * hundred parcels arrived in the order they were shipped, each row saying
 * eleven things and none of them saying which of the eleven is why somebody
 * should look at this row rather than the next one.
 *
 * Measured on the dev database before any of this was written, over the 171
 * rows the screen can load:
 *
 *   152 of 171 (89%) are late. The list tinted every late row red, so nine
 *   rows in ten were red — which is not a signal, it is the background
 *   colour. Meanwhile the 9 rows carrying a real alert (7 cancelled while
 *   the parcel moves, 2 changed after it left) were tinted the same red as
 *   everything else, and all 9 were unacknowledged. Nobody had ever pressed
 *   the button.
 *
 *   Of the default in-flight view, 6 rows: 4 late, 2 with a live alert.
 *
 * So the row needs a rank, the list needs to be sorted by it, and the red
 * must go back to meaning something.
 *
 * ONE ROW, ONE REASON. A parcel can be late AND cancelled AND missing a
 * barcode; a row that says all three says nothing, and the reader has to
 * decide which matters — which is the work this is supposed to do for them.
 * So the worst true thing wins, and `MATCHES` is still exported separately
 * for the filter chips, which legitimately count a row under every condition
 * it meets.
 */

export const URGENCIES = [
  'CANCELLED',
  'CHANGED',
  'FAILED',
  'RETURNING',
  'LATE',
  'NO_BARCODE',
  'COLLECT',
  'NONE',
] as const;

export type UrgencyKey = (typeof URGENCIES)[number];
export type ConditionKey = Exclude<UrgencyKey, 'NONE'>;

export interface UrgencyFacts {
  /** Lower is more urgent. The list is sorted by this. */
  rank: number;
  /** The chip beside the reference. Short: it shares a line on a phone. */
  label: string;
  /** What to DO about it — never left to be inferred from a colour. */
  why: string;
  /** From the one palette the whole product paints verdicts with. */
  tone: HealthTone;
}

/**
 * THE ORDER, AND WHY EACH BEATS THE NEXT.
 *
 * A LIVE ALERT COMES FIRST, above even a failed delivery, because it does
 * not describe the parcel — it describes whether ANY action on this row is
 * still correct. Ringing a customer about a cancelled order, or reading an
 * address that a change request has since rewritten, is worse than being
 * slow: it is confidently wrong. `tracking-alert.ts` calls these "the two
 * things that make chasing a parcel pointless or wrong", and that is a
 * statement about precedence.
 *
 * AN ACKNOWLEDGED ALERT SETS NO URGENCY. The same file: the alert fades once
 * acknowledged, it does not disappear — "the row still says what happened;
 * it stops shouting". A row whose alert has been seen is ranked on what is
 * physically true of the parcel instead.
 *
 * LATE ABOVE NO_BARCODE keeps the judgement the screen had already made in
 * its own chips (rose for late, amber for barcode), rather than re-deciding
 * it here. A missing barcode is money that will silently fall out of
 * settlement; being late is money that is late. The screen ranked the clock
 * higher and nothing measured here contradicts it.
 *
 * COLLECT IS NOT A PROBLEM. It is cash waiting to be taken in, so it sorts
 * last of the real conditions and is painted as good news, not as a fault.
 */
export const URGENCY: Record<UrgencyKey, UrgencyFacts> = {
  CANCELLED: {
    rank: 0,
    label: 'أُلغي والطرد يسير',
    why: 'الطلب ملغى والطرد ما زال عند الشحن — أوقفه قبل أن يُسلَّم، ولا تتصل بالعميل عن تسليم لن يحدث.',
    tone: 'bad',
  },
  CHANGED: {
    rank: 1,
    label: 'تغيّرت بياناته',
    why: 'كُتب تعديل معتمد على الطلب بعد إرساله — اقرأ العنوان والمبلغ من جديد قبل أي اتصال.',
    tone: 'ok',
  },
  FAILED: {
    rank: 2,
    label: 'فشل التوصيل',
    why: 'المندوب حاول ولم يُسلّم — يحتاج قراراً اليوم: إعادة محاولة، أو تحويل، أو إرجاع.',
    tone: 'bad',
  },
  RETURNING: {
    rank: 3,
    label: 'بانتظار الإرجاع',
    why: 'طُلب إرجاعه — البضاعة لا تعود إلى المخزون حتى تُستلم فعلاً في المرتجعات.',
    tone: 'ok',
  },
  LATE: {
    rank: 4,
    label: 'متأخرة',
    why: 'تجاوزت مهلة محافظتها وهي في الطريق — اسأل جهة الشحن عنها.',
    tone: 'bad',
  },
  NO_BARCODE: {
    rank: 5,
    label: 'بلا باركود',
    why: 'شُحنت بلا باركود، فكشف الشركة لا يمكن أن يُطابق عليها — وتسقط من التحصيل بصمت.',
    tone: 'ok',
  },
  COLLECT: {
    rank: 6,
    label: 'بانتظار التحصيل',
    why: 'سُلّمت ولم تُسوَّ — مبلغها ما زال عند جهة الشحن.',
    tone: 'good',
  },
  NONE: {
    rank: 7,
    label: '',
    why: 'في الطريق وفي مهلتها — لا شيء مطلوب الآن.',
    tone: 'unknown',
  },
};

/** What the rule needs from a row, and nothing more. */
export interface TrackingFacts {
  shippingStatus: string;
  settlementStatus?: string | null;
  trackingNumber?: string | null;
  daysInTransit: number | null;
  late: boolean;
  alert?: { kind: TrackingAlertKind; acknowledged: boolean } | null;
}

/** A live alert is one nobody has said they saw yet. */
const shouting = (row: TrackingFacts, kind: TrackingAlertKind): boolean =>
  !!row.alert && row.alert.kind === kind && !row.alert.acknowledged;

/**
 * EVERY CONDITION, EACH ON ITS OWN.
 *
 * The filter chips count a row under every condition it meets — a late
 * parcel that also has no barcode belongs in both counts, and hiding it
 * from one of them would make a chip lie about how much work it holds. So
 * the predicates live here, once, and are read two ways: independently by
 * the chips, and in rank order by `trackingUrgency`.
 */
export const MATCHES: Record<ConditionKey, (row: TrackingFacts) => boolean> = {
  CANCELLED: (row) => shouting(row, 'CANCELLED'),
  CHANGED: (row) => shouting(row, 'CHANGED'),
  FAILED: (row) => row.shippingStatus === 'FAILED_DELIVERY',
  RETURNING: (row) => row.shippingStatus === 'RETURN_REQUESTED',
  LATE: (row) => row.late,
  // Shipped with no barcode. A parcel still waiting to be picked up has not
  // been given one yet, which is not the same fault.
  NO_BARCODE: (row) => !row.trackingNumber && row.shippingStatus !== 'READY_FOR_PICKUP',
  // Only a delivered parcel owes anything, and only once. A returned one
  // owes nothing; one still in transit has not been collected yet. A partial
  // delivery owes money too — the customer took some lines and paid for them
  // at the door.
  COLLECT: (row) =>
    ['DELIVERED', 'PARTIALLY_DELIVERED'].includes(row.shippingStatus) && row.settlementStatus !== 'SETTLED',
};

/** In rank order, so the worst true thing is found first. */
const IN_RANK_ORDER: ConditionKey[] = (URGENCIES.filter((k) => k !== 'NONE') as ConditionKey[]).sort(
  (a, b) => URGENCY[a].rank - URGENCY[b].rank
);

/** The one reason this row needs a human, or NONE. */
export function trackingUrgency(row: TrackingFacts): UrgencyKey {
  for (const key of IN_RANK_ORDER) if (MATCHES[key](row)) return key;
  return 'NONE';
}

/** The exact predicate the collect button and the checkbox both ask. */
export const canCollect = MATCHES.COLLECT;

/**
 * WORST FIRST, AND WITHIN THAT, LONGEST WAITING FIRST.
 *
 * The API returns oldest-shipped-first, on the stated ground that "the ones
 * waiting longest are the work". That is right and it is kept — as the
 * TIEBREAK. It was the only ordering, which is why a cancelled parcel
 * shipped this morning sat below a hundred and forty parcels that were
 * merely slow.
 *
 * A parcel with no days in transit has never shipped, so it cannot be the
 * one waiting longest; it sorts after those that have.
 */
export function byUrgency(a: TrackingFacts, b: TrackingFacts): number {
  const byRank = URGENCY[trackingUrgency(a)].rank - URGENCY[trackingUrgency(b)].rank;
  if (byRank !== 0) return byRank;

  const da = a.daysInTransit;
  const db = b.daysInTransit;
  if (da === db) return 0;
  if (da === null) return 1;
  if (db === null) return -1;
  return db - da;
}

/** How many rows meet one condition — what a filter chip counts. */
export function countMatching(rows: readonly TrackingFacts[], key: ConditionKey): number {
  return rows.filter(MATCHES[key]).length;
}
