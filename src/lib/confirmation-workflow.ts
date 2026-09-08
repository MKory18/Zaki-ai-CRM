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
  'DUPLICATE_ORDER', 'WRONG_NUMBER', 'FAKE_ORDER', 'OUT_OF_SERVICE_AREA', 'OTHER',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** Follow-up reasons */
export const FOLLOW_UP_REASONS = [
  'NO_ANSWER', 'CUSTOMER_REQUESTED_CALLBACK', 'POSTPONED', 'FAILED_CONFIRMATION', 'OTHER',
] as const;
export type FollowUpReason = (typeof FOLLOW_UP_REASONS)[number];

export const CONTACT_METHODS = ['PHONE', 'WHATSAPP', 'SMS', 'OTHER'] as const;
export const CONTACT_RESULTS = [
  'ANSWERED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'CONFIRMED', 'REJECTED', 'OTHER',
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
