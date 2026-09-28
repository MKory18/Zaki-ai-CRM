import { describe, expect, it, vi } from 'vitest';
import { duePostponedWhere, readyToPullWhere, waitingCount, postponedNotDueCount } from './confirmation-queue';
import { repoFile, stripComments } from './guard-source';

/**
 * THE COUNTER COUNTS WHAT THE BUTTON CAN ACTUALLY HAND OVER.
 *
 * A postponed order whose day has not come is waiting, and must not be
 * given to anybody — the customer asked to be rung on Thursday. The picker
 * always honoured that; the counter did not. So a pool holding nothing but
 * far-off promises showed «٣ طلبات بانتظار التأكيد» above a live button
 * that answered «لا توجد طلبات» every single press.
 *
 * That is the shape of the report: «بعدين ببطل أقدر أسحب أي طلب جديد» —
 * a number that promises work, and a button that never yields any.
 */

const SCOPE = { companyId: 'c1', storeId: 's1' };
const NOW = new Date('2026-09-28T09:00:00Z');

describe('the two predicates', () => {
  it('take a postponed order only once its day is near', () => {
    const w = duePostponedWhere(SCOPE, NOW) as Record<string, unknown>;
    expect(w.confirmationStatus).toBe('POSTPONED');
    expect(w.claimedById).toBeNull();
    const or = w.OR as { postponedUntil?: { lte: Date }; nextFollowUpAt?: { lte: Date } }[];
    const lead = or[0].postponedUntil!.lte;
    // The window opens ahead of the date, never behind it.
    expect(lead.getTime()).toBeGreaterThan(NOW.getTime());
    // Both dates are honoured: «تأجيل» writes one or the other.
    expect(or[1].nextFollowUpAt).toBeTruthy();
  });

  it('and everything else regardless of a date', () => {
    const w = readyToPullWhere(SCOPE) as Record<string, unknown>;
    expect(w.confirmationStatus).toEqual({ not: 'POSTPONED' });
    expect(w.shippingStatus).toBe('NOT_READY');
    expect(w.claimedById).toBeNull();
  });
});

describe('the waiting number', () => {
  it('is the sum of exactly those two, and nothing else', async () => {
    const seen: unknown[] = [];
    const tx = {
      order: {
        count: vi.fn(async ({ where }: { where: unknown }) => {
          seen.push(where);
          return 1;
        }),
      },
    } as never;

    await waitingCount(tx, SCOPE, NOW);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(duePostponedWhere(SCOPE, NOW));
    expect(seen[1]).toEqual(readyToPullWhere(SCOPE));
  });

  it('and the far-off promises are counted apart, not folded in', async () => {
    let asked: Record<string, unknown> = {};
    const tx = {
      order: {
        count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          asked = where;
          return 3;
        }),
      },
    } as never;

    expect(await postponedNotDueCount(tx, SCOPE, NOW)).toBe(3);
    expect(asked.confirmationStatus).toBe('POSTPONED');
    /**
     * Both dates must be BEYOND the window. An order due on either one is
     * takeable, and counting it here too would show it twice — once as
     * ready and once as waiting on a date.
     */
    const and = asked.AND as { OR: ({ postponedUntil?: unknown; nextFollowUpAt?: unknown } | null)[] }[];
    expect(and).toHaveLength(2);
    const clauses = JSON.stringify(and);
    expect(clauses, 'العدُّ يشمل ما حان موعده').toContain('"gt"');
    expect(clauses, 'العدُّ يعدّ ما هو جاهزٌ للسحب').not.toContain('"lte"');
  });
});

describe('the picker and the counter', () => {
  it('draw from the same two predicates', () => {
    const src = stripComments(repoFile('src/lib/confirmation-queue.ts'));
    const at = src.indexOf('export async function pickNextCandidate');
    const body = src.slice(at, src.indexOf('\nexport', at + 10));
    expect(body).toContain('duePostponedWhere(scope, now)');
    expect(body).toContain('readyToPullWhere(scope)');
    // No third opinion about what is takeable.
    expect(body, 'المنتقي يكتب شرطَه بنفسه').not.toMatch(/claimedById: null/);
  });

  it('and the screen says which number is which', () => {
    const src = stripComments(repoFile('src/components/screens/ConfirmationQueueScreen.tsx'));
    expect(src).toContain('طلب جاهز للسحب الآن');
    // The RENDER, not merely the field's declaration: a block switched off
    // still leaves the name in the interface above it.
    expect(src, 'الرقمُ المؤجَّل لا يُعرَض').toMatch(/\{!!data\.waitingOnADate && \(/);
    expect(src).toContain('مؤجَّلة حتى موعدها');
  });
});
