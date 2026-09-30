import { STATE_LABEL_AR } from './order-state';
/**
 * SALESFLOW — Phase D1: Confirmation Workflow Validator
 *
 * All confirmation status transitions are controlled server-side.
 * The frontend dropdown is UX only — arbitrary transitions are rejected here.
 * Server time is authoritative for all follow-up state.
 */

export const CONFIRMATION_STATUSES = [
  'NEW', 'IN_PROGRESS', 'NO_ANSWER', 'FOLLOW_UP_REQUIRED',
  'POSTPONED', 'CONFIRMED', 'REJECTED', 'CANCELLED',
] as const;
export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number];

/**
 * Explicit allowed transitions. Anything not listed here is rejected.
 * Any status → CANCELLED only via SUPER_ADMIN override (with reason).
 */
export const CONFIRMATION_TRANSITIONS: Record<ConfirmationStatus, ConfirmationStatus[]> = {
  NEW: ['IN_PROGRESS', 'NO_ANSWER', 'FOLLOW_UP_REQUIRED', 'POSTPONED', 'CONFIRMED', 'REJECTED'],
  IN_PROGRESS: ['NO_ANSWER', 'FOLLOW_UP_REQUIRED', 'POSTPONED', 'CONFIRMED', 'REJECTED'],
  NO_ANSWER: ['IN_PROGRESS', 'FOLLOW_UP_REQUIRED'],
  FOLLOW_UP_REQUIRED: ['IN_PROGRESS'],
  POSTPONED: ['IN_PROGRESS'],
  CONFIRMED: [],            // terminal for confirmation stage (D2 shipping takes over)
  REJECTED: [],             // terminal
  CANCELLED: [],            // terminal
};

export const TERMINAL_CONFIRMATION_STATUSES: ConfirmationStatus[] = ['CONFIRMED', 'REJECTED', 'CANCELLED'];

export function isValidTransition(from: string, to: string): boolean {
  const fromList = CONFIRMATION_TRANSITIONS[from as ConfirmationStatus];
  if (!fromList) return false; // unknown current status → fail closed
  return fromList.includes(to as ConfirmationStatus);
}

/** Reject reason codes (structured — not free text) */
export const REJECTION_REASONS = [
  'PRICE_TOO_HIGH', 'CUSTOMER_CHANGED_MIND', 'CUSTOMER_DOES_NOT_WANT_PRODUCT',
  'DUPLICATE_ORDER', 'WRONG_NUMBER', 'FAKE_ORDER', 'OUT_OF_SERVICE_AREA',
  // NOT the same as «السعر مرتفع», and the difference is a decision.
  // «غالي» says our price is beyond what this customer will pay; «لقاها
  // أرخص» says somebody else is selling it for less. The first is a
  // question about the customer, the second is a question about the
  // market — and rolling them together hides the only one that can be
  // answered by changing a number.
  'FOUND_CHEAPER_ELSEWHERE',
  // Its own distinct reason: the third no-answer closes the order by rule,
  // so it is never mixed with a customer's refusal in any report.
  'NO_ANSWER_3_ATTEMPTS',
  // Voiding an entry issue wrote FAKE_ORDER, and an entry issue is a
  // MODERATOR'S MISTAKE — a wrong number typed, a product mis-picked. Calling
  // it a fake order accuses a customer of something they did not do, and
  // every report that counts fake orders counted our own typing errors.
  // The contract already names this as its own thing: it is one of the
  // commission exclusions.
  'MODERATOR_DATA_ERROR',
  'OTHER',
] as const;

/**
 * REASONS A SERVER MAY NOT CHOOSE FOR A PERSON.
 *
 * `OTHER` means «none of these, and here is a sentence» — it is only ever a
 * human's answer, and the door that accepts it demands the sentence with it.
 * A server writing it fills the record with the one value that says nothing,
 * and every later analysis of why orders are lost reads it as a real answer.
 */
export const HUMAN_ONLY_REJECTION_REASONS = ['OTHER'] as const;

/**
 * REASONS ONLY THE SYSTEM EVER WRITES.
 *
 * Neither is a choice anybody makes: the first is what three unanswered calls
 * come to, the second is what voiding an entry issue means. They are real
 * stored values that every report must be able to read — and offering them in
 * the picker would invite an agent to close an order as «our own mistake»
 * because it is the shortest way out of a hard call.
 */
export const SYSTEM_ONLY_REJECTION_REASONS = ['NO_ANSWER_3_ATTEMPTS', 'MODERATOR_DATA_ERROR'] as const;

/** What a person may choose — the whole list, less what the system owns. */
export const PICKABLE_REJECTION_REASONS = REJECTION_REASONS.filter(
  (r) => !(SYSTEM_ONLY_REJECTION_REASONS as readonly string[]).includes(r)
);

/**
 * EVERY REASON IN WORDS, INCLUDING THE ONES NOBODY PICKS.
 *
 * One map, because the screen used to keep its own copy of eight while the
 * list here held ten — so a stored value the screen had never heard of
 * rendered as a raw English constant to an Arabic reader. The same divergence
 * that the delivery-attempt vocabulary already cost once.
 */
/**
 * ONE WORD PER CONFIRMATION STATUS — AND THE CORE AXIS'S WORD WHERE IT
 * NAMES THE SAME STATE.
 *
 * This vocabulary was written FOUR times, and the copies disagreed on
 * five of the eight values:
 *
 *   NO_ANSWER           لا يرد (six files)  ·  لا يجيب (the order dialog)
 *   IN_PROGRESS         قيد التأكيد  ·  قيد المعالجة
 *   FOLLOW_UP_REQUIRED  يحتاج متابعة  ·  يتطلب متابعة  ·  بحاجة متابعة
 *   POSTPONED           مؤجل  ·  مؤجَّل
 *   CONFIRMED           مؤكد  ·  مؤكَّد
 *
 * So an agent read «لا يجيب» in the order dialog and «لا يرد» in the list
 * about the same order, and «يحتاج متابعة» in its timeline while the
 * server refused in «بحاجة متابعة».
 *
 * WHICH WORD WINS is not a taste: `shipping-workflow.ts` wrote the rule
 * when it settled the shipping axis — «where a core state carries the
 * same name, its word wins». Six of these are core states under another
 * name, so six of these read from `STATE_LABEL_AR` rather than repeating
 * it. The two the core axis does not name are spelled here, once.
 */
export const CONFIRMATION_STATUS_AR: Record<ConfirmationStatus, string> = {
  NEW: STATE_LABEL_AR.NEW,
  // The confirmation axis's name for what the core axis calls CLAIMED.
  IN_PROGRESS: STATE_LABEL_AR.CLAIMED,
  NO_ANSWER: STATE_LABEL_AR.NO_ANSWER,
  POSTPONED: STATE_LABEL_AR.POSTPONED,
  CONFIRMED: STATE_LABEL_AR.CONFIRMED,
  CANCELLED: STATE_LABEL_AR.CANCELLED,
  FOLLOW_UP_REQUIRED: 'يحتاج متابعة',
  REJECTED: 'مرفوض',
};

export const REJECTION_REASON_AR: Record<string, string> = {
  PRICE_TOO_HIGH: 'السعر مرتفع',
  CUSTOMER_CHANGED_MIND: 'غيّر رأيه',
  CUSTOMER_DOES_NOT_WANT_PRODUCT: 'لا يريد المنتج',
  DUPLICATE_ORDER: 'طلب مكرّر',
  WRONG_NUMBER: 'رقم خاطئ',
  FAKE_ORDER: 'طلب وهميّ',
  OUT_OF_SERVICE_AREA: 'خارج نطاق التغطية',
  FOUND_CHEAPER_ELSEWHERE: 'وجدها أرخص عند غيرنا',
  NO_ANSWER_3_ATTEMPTS: 'أُغلق بعد ثلاث محاولات بلا ردّ',
  MODERATOR_DATA_ERROR: 'خطأ إدخال من المُعدِّل',
  OTHER: 'سبب آخر',
};

/** No-answer attempts before the order closes itself (contract: 1/2/3). */
export const NO_ANSWER_LIMIT = 3;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** Follow-up reasons */
export const FOLLOW_UP_REASONS = [
  'NO_ANSWER', 'CUSTOMER_REQUESTED_CALLBACK', 'POSTPONED', 'FAILED_CONFIRMATION', 'OTHER',
] as const;
export type FollowUpReason = (typeof FOLLOW_UP_REASONS)[number];

export const CONTACT_METHODS = ['PHONE', 'WHATSAPP', 'SMS', 'OTHER'] as const;
export const CONTACT_RESULTS = [
  'ANSWERED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'CONFIRMED', 'REJECTED',
  // Writing to somebody is a contact attempt with its own outcome, and it is
  // NOT «answered». Filing a sent message under ANSWERED inflates the answer
  // rate — the number that decides whether the problem is the script or the
  // hour of day — with messages nobody has replied to yet.
  //
  // It is deliberately not counted toward the 1/2/3 no-answer close either:
  // that counter reads NO_ANSWER and BUSY, and closing an order because
  // three messages were sent would punish the agent for trying twice more.
  'MESSAGE_SENT',
  'OTHER',
] as const;

/**
 * Derive follow-up queue bucket from SERVER time (never browser time).
 * Stored followUpStatus is SCHEDULED / COMPLETED / CANCELLED;
 * DUE and OVERDUE are derived at query time.
 */
export function deriveFollowUpState(
  nextFollowUpAt: Date | null | undefined,
  followUpStatus: string | null | undefined,
  now = new Date()
): 'SCHEDULED' | 'DUE' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED' | null {
  if (!nextFollowUpAt) return null;
  if (followUpStatus === 'COMPLETED' || followUpStatus === 'CANCELLED') {
    return followUpStatus as 'COMPLETED' | 'CANCELLED';
  }
  const diffMs = nextFollowUpAt.getTime() - now.getTime();
  const HOUR = 60 * 60 * 1000;
  if (diffMs < -HOUR) return 'OVERDUE';
  if (diffMs <= 0) return 'DUE';
  return 'SCHEDULED';
}

/** Contact attempt results that resolve the follow-up */
export const RESOLVING_RESULTS = ['CONFIRMED', 'REJECTED'] as const;
