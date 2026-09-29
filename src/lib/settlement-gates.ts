/**
 * THE GATES ROUND A COURIER SETTLEMENT — as a rule, not as a shape of code.
 *
 * Approving a statement is the moment money is written into a wallet. Three
 * things had to be true before it, and one thing had to STAY true after it:
 *
 *   before — a receipt exists, matching has run, and any gap between what
 *            the courier claimed and what arrived carries a written reason;
 *   after  — it is approved, and approving it again is refused.
 *
 * The "after" was the hole. `status` carried both facts — where the statement
 * is in the flow, and whether the money has moved — and re-running matching
 * wrote `status = 'MATCHED'` over an APPROVED one. Every gate then passed a
 * second time and a second IN movement was written for the same receipt:
 * measured on the dev database, 1,889.48 USD posted twice from a button
 * labelled «تشغيل المطابقة».
 *
 * So approval is read from `approvedAt` — the stamp of the act — and never
 * from `status` alone, and the rule lives here, where the route that approves,
 * the route that matches and the screen that offers both buttons all read the
 * same one. Nothing in this file touches the database: it is given the facts
 * and returns the refusal, so a screen can grey a button out for exactly the
 * reason the server would refuse it.
 */

export interface Refusal {
  /** Machine code, for the client. */
  code: string;
  /** Arabic, for the person. */
  error: string;
}

/** What approval needs to know about a statement. */
export interface StatementState {
  status: string;
  /** Set once, when the money moved. The only honest answer to "approved?". */
  approvedAt?: Date | string | null;
  /** How many receipts have been recorded against it. */
  receipts: number;
  /** How many match rows matching produced. */
  matches: number;
  /**
   * The gap between claimed and received, whether it needs a reason, and how
   * many receipts could not be expressed in the statement's currency at all.
   */
  gap: { gap: number; needsExplanation: boolean; unconvertible?: number };
  /** A written explanation of the gap, from the row or from this request. */
  explanation?: string | null;
}

/**
 * Has this statement's money already been written?
 *
 * `approvedAt` first, because it is the record of the act and nothing resets
 * it. `status` second, so a row approved before the stamp existed is still
 * recognised.
 */
export function isApproved(s: { status: string; approvedAt?: Date | string | null }): boolean {
  return s.approvedAt != null || s.status === 'APPROVED';
}

/**
 * May matching run again on this statement?
 *
 * Re-running it on an unapproved statement is normal and wanted: the operator
 * fixes a barcode and asks again. On an APPROVED one it is refused, because
 * matching rewrites the match rows that decide which orders were settled and
 * whose commission became payable — and it used to reopen the approval itself.
 */
export function rematchRefusal(s: { status: string; approvedAt?: Date | string | null }): Refusal | null {
  if (isApproved(s)) {
    return {
      code: 'ALREADY_APPROVED',
      error: 'الكشف معتمد — لا تُعاد مطابقته. أيّ تصحيح بعد الاعتماد يكون بقيد عكسي.',
    };
  }
  return null;
}

/**
 * May this statement be approved? The gates in the order a person meets them.
 *
 * Returns null when it may. Never throws, never reads anything: the route
 * turns the refusal into a 409 and the screen turns it into a disabled button
 * with the same sentence on it.
 */
export function approvalRefusal(s: StatementState): Refusal | null {
  if (isApproved(s)) {
    return { code: 'ALREADY_APPROVED', error: 'الكشف معتمد مسبقاً' };
  }
  if (s.receipts === 0) {
    return { code: 'NO_RECEIPTS', error: 'لا يمكن اعتماد كشف بلا إيصالات استلام' };
  }
  /**
   * A receipt in another currency with no rate stored is money nobody can
   * place. Its amount is in neither «وصل فعلاً» nor the gap, so the gap that
   * follows would be explained away as a shortfall that is really a missing
   * number. It is refused on its own terms, with its own sentence.
   */
  if ((s.gap.unconvertible ?? 0) > 0) {
    return {
      code: 'RECEIPT_RATE_MISSING',
      error: 'إيصالٌ بعملةٍ تختلف عن عملة الكشف بلا سعر صرف — لا يُعرف كم وصل. صحّح الإيصال قبل الاعتماد.',
    };
  }
  if (s.gap.needsExplanation && !s.explanation) {
    return {
      code: 'GAP_REQUIRES_EXPLANATION',
      error: `الفرق ${s.gap.gap} بين ما أقرّته الشركة وما وصل يحتاج تفسيراً مكتوباً قبل الاعتماد`,
    };
  }
  if (s.matches === 0) {
    return { code: 'MATCHING_REQUIRED', error: 'شغّل المطابقة قبل الاعتماد' };
  }
  return null;
}
