import { describe, expect, it } from 'vitest';
import { LOST_STATUSES, WINBACK_COOLING_DAYS, winbackVerdict, type WinbackSource } from './winback';
import { repoFile, stripComments } from './guard-source';

/**
 * WHEN A CANCELLED ORDER WAS CLOSED.
 *
 * `LOST_STATUSES` holds both words for an order that did not happen —
 * REJECTED when the agent records the customer's no, CANCELLED when a manager
 * closes it or the no-answer rule does. Widening it was supposed to end
 * «الإلغاء لا يظهر في استرجاع الملغي».
 *
 * It half did. `GET /api/confirmation/winback` read the closing moment out of
 * the status log with `newValue: 'REJECTED'`, so every CANCELLED order
 * arrived with `rejectedAt: null`, and the verdict answered «لا تاريخَ
 * لإلغائه» — about an order whose cancellation is stamped in that very log.
 * NO_DATE has no way out, so the order was listed among the refused for ever.
 *
 * Measured on this database: SY-2026-0147, cancelled 2026-09-22 with reason
 * NO_ANSWER_3_ATTEMPTS — one of the three reasons this screen names as worth
 * a second call, and the one its own comments call the most winnable.
 *
 * The POST has read both words all along. Two halves of one feature must not
 * disagree about which orders exist.
 */

const base: WinbackSource = {
  confirmationStatus: 'CANCELLED',
  rejectionReason: 'NO_ANSWER_3_ATTEMPTS',
  rejectedAt: null,
  shippedAt: null,
  replacedByOrderNumber: null,
  replacesOrderNumber: null,
  sellingPrice: 100,
  discountAmount: 0,
};

const now = new Date('2026-09-29T12:00:00.000Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('an order closed by the no-answer rule', () => {
  it('is one of the lost, by both words', () => {
    expect(LOST_STATUSES).toContain('CANCELLED');
    expect(LOST_STATUSES).toContain('REJECTED');
  });

  it('can be won back once its cancellation date is known and cooled', () => {
    const verdict = winbackVerdict(
      { ...base, rejectedAt: daysAgo(WINBACK_COOLING_DAYS + 1) },
      now
    );
    expect(verdict.eligible).toBe(true);
  });

  it('is still cooling inside the window, and says the date', () => {
    const verdict = winbackVerdict({ ...base, rejectedAt: daysAgo(1) }, now);
    expect(verdict.eligible).toBe(false);
    if (!verdict.eligible) {
      expect(verdict.code).toBe('COOLING');
      expect(verdict.dueAt).toBeInstanceOf(Date);
    }
  });

  /**
   * THE STATE THE BUG PINNED IT IN. Without a closing date there is no way
   * out of NO_DATE — not tomorrow, not in a year. So a lookup that cannot
   * find a CANCELLED order's date is not a cosmetic fault: it is the feature
   * refusing the exact orders it was widened to reach.
   */
  it('is refused for ever when no closing date can be found', () => {
    const verdict = winbackVerdict(base, now);
    expect(verdict.eligible).toBe(false);
    if (!verdict.eligible) expect(verdict.code).toBe('NO_DATE');
  });
});

describe('the winback route', () => {
  const src = stripComments(repoFile('src/app/api/confirmation/winback/route.ts'));

  it('reads the closing moment by both words, in the listing and in the offer', () => {
    const lookups = [...src.matchAll(/newValue:\s*([^,\n]+)/g)].map((m) => m[1].trim());
    expect(lookups.length).toBeGreaterThanOrEqual(2);
    for (const lookup of lookups) {
      expect(lookup).toContain('LOST_STATUSES');
    }
  });

  /** The escape the bug came through, closed by name. */
  it('never asks the status log for REJECTED alone', () => {
    expect(src).not.toMatch(/newValue:\s*'REJECTED'/);
    expect(src).not.toMatch(/newValue:\s*\{\s*in:\s*\[\s*'REJECTED'\s*\]\s*\}/);
  });

  it('and both handlers are still there', () => {
    expect(src).toMatch(/export async function GET\b/);
    expect(src).toMatch(/export async function POST\b/);
    expect(src.length).toBeGreaterThan(2000);
  });
});
