import { describe, expect, it } from 'vitest';
import { approvalRefusal, isApproved, rematchRefusal, type StatementState } from './settlement-gates';

/**
 * The gates round a courier settlement.
 *
 * Every test here is a NEGATIVE one by construction: the subject is what the
 * system must refuse. The one that matters most is the last pair — an approved
 * statement whose `status` was written back to MATCHED by a re-match must still
 * be unapprovable, because the second approval writes the courier's cash into
 * the wallet twice.
 */

const ok = (over: Partial<StatementState> = {}): StatementState => ({
  status: 'MATCHED',
  approvedAt: null,
  receipts: 1,
  matches: 12,
  gap: { gap: 0, needsExplanation: false },
  explanation: null,
  ...over,
});

describe('isApproved', () => {
  it('reads the stamp of the act, not the place in the flow', () => {
    expect(isApproved({ status: 'MATCHED', approvedAt: new Date('2026-09-20') })).toBe(true);
  });

  it('still recognises a row approved before the stamp existed', () => {
    expect(isApproved({ status: 'APPROVED', approvedAt: null })).toBe(true);
  });

  it('is false for one that has never been approved', () => {
    expect(isApproved({ status: 'MATCHED', approvedAt: null })).toBe(false);
  });
});

describe('re-running matching', () => {
  it('is allowed while the statement is unapproved — a fixed barcode is asked again', () => {
    expect(rematchRefusal({ status: 'RECEIPTED', approvedAt: null })).toBeNull();
  });

  it('is REFUSED once the money has moved', () => {
    expect(rematchRefusal({ status: 'APPROVED', approvedAt: new Date() })?.code).toBe('ALREADY_APPROVED');
  });

  it('is refused even when something wrote the status back to MATCHED', () => {
    // This is the hole that double-posted 1,889.48 on the dev database.
    expect(rematchRefusal({ status: 'MATCHED', approvedAt: new Date('2026-09-20') })?.code).toBe(
      'ALREADY_APPROVED'
    );
  });
});

describe('approving a statement', () => {
  it('passes when a receipt exists, matching ran and there is no gap', () => {
    expect(approvalRefusal(ok())).toBeNull();
  });

  it('refuses with no receipt — nothing arrived yet', () => {
    expect(approvalRefusal(ok({ receipts: 0 }))?.code).toBe('NO_RECEIPTS');
  });

  it('refuses a receipt in another currency with no rate — its money is nowhere', () => {
    const refusal = approvalRefusal(ok({ gap: { gap: 0, needsExplanation: false, unconvertible: 1 } }));
    expect(refusal?.code).toBe('RECEIPT_RATE_MISSING');
  });

  it('refuses it BEFORE the gap, so nobody explains away a missing number', () => {
    const refusal = approvalRefusal(
      ok({ gap: { gap: -709, needsExplanation: true, unconvertible: 1 }, explanation: 'الشركة خصمت' })
    );
    expect(refusal?.code).toBe('RECEIPT_RATE_MISSING');
  });

  it('passes when every receipt could be converted', () => {
    expect(approvalRefusal(ok({ gap: { gap: 0, needsExplanation: false, unconvertible: 0 } }))).toBeNull();
  });

  it('refuses before matching has run', () => {
    expect(approvalRefusal(ok({ matches: 0 }))?.code).toBe('MATCHING_REQUIRED');
  });

  it('refuses an unexplained gap, and says how much it is', () => {
    const refusal = approvalRefusal(ok({ gap: { gap: -10, needsExplanation: true } }));
    expect(refusal?.code).toBe('GAP_REQUIRES_EXPLANATION');
    expect(refusal?.error).toContain('-10');
  });

  it('accepts a gap that carries a written reason', () => {
    expect(
      approvalRefusal(ok({ gap: { gap: -10, needsExplanation: true }, explanation: 'خصمت الشركة رسوم إرجاع' }))
    ).toBeNull();
  });

  it('refuses an approved statement — the money is already in the wallet', () => {
    expect(approvalRefusal(ok({ status: 'APPROVED' }))?.code).toBe('ALREADY_APPROVED');
  });

  /**
   * THE DOUBLE-POST. Re-running matching used to set `status = 'MATCHED'` on an
   * approved statement, and every gate below then passed a second time.
   */
  it('refuses one whose status was reset but whose money already moved', () => {
    expect(
      approvalRefusal(ok({ status: 'MATCHED', approvedAt: new Date('2026-09-20') }))?.code
    ).toBe('ALREADY_APPROVED');
  });

  it('checks approval BEFORE the other gates, so a re-matched row is never re-approved', () => {
    // Receipts and matches present, gap clean — only the stamp refuses it.
    const refusal = approvalRefusal(ok({ approvedAt: '2026-09-20T00:00:00.000Z' }));
    expect(refusal?.code).toBe('ALREADY_APPROVED');
  });
});
