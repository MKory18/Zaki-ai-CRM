import { describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/types/auth';
import { entryOwnership, recordEntryClaim, MANUAL_ENTRY_REASON, CLAIM_CAPS } from './confirmation-queue';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE CLAIM IS WRITTEN, AND EVERY ORDER A LIST SHOWS OPENS.
 *
 * Review round 1 found three things the first version of C2 claimed and
 * did not do, and all three were the same mistake: a rule applied at ONE
 * of the places it belongs, and a test that read the source of that one
 * place rather than asking the behaviour.
 *
 *   The AI intake claimed orders for the agent and wrote NO claim history
 *   and returned NO cap notice. `MANUAL_ENTRY_REASON` and
 *   `ENTRY_CAP_FULL_MESSAGE` were imported there and never used — and the
 *   tests passed, because they grepped the quick-entry file.
 *
 *   The two entry windows never read `notice`, so an agent whose cap was
 *   full read «تم إنشاء الطلب» and went looking for it in «طلباتي».
 *
 *   The READ envelope did not carry `createdById` while the LIST envelope
 *   did, so an order she typed that somebody else now holds sat in her
 *   list and opened as «غير موجود».
 *
 * So these ask the behaviour: the writer writes, both doors call it, and
 * the two envelopes are compared against each other rather than described.
 * ═══════════════════════════════════════════════════════════════════════
 */

const NOW = new Date('2026-10-14T12:00:00.000Z');
const agent = (held = 0) =>
  entryOwnership({
    userId: 'a1',
    holds: (p) => p === 'confirmation.work',
    heldTotal: held,
    now: NOW,
  });

describe('the claim an entry creates is recorded, by one writer', () => {
  const tx = () => {
    const create = vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: 'h1' }));
    return { create, tx: { orderClaimHistory: { create } } as never };
  };

  it('writes a CLAIMED row with MANUAL_ENTRY, for the person who typed it', async () => {
    const { create, tx: t } = tx();
    await recordEntryClaim(t, { companyId: 'c1', orderId: 'o1', ownership: agent() });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({
      data: {
        companyId: 'c1',
        orderId: 'o1',
        userId: 'a1',
        action: 'CLAIMED',
        reason: MANUAL_ENTRY_REASON,
      },
    });
  });

  it('and writes nothing when the entry went to the queue', async () => {
    // Nobody claimed it, so there is no claim to record. A row here would
    // say an order is held by somebody who is not holding it.
    const { create, tx: t } = tx();
    await recordEntryClaim(t, {
      companyId: 'c1',
      orderId: 'o1',
      ownership: agent(CLAIM_CAPS.total),
    });
    expect(create, 'سُجِّلَ حجزٌ لطلبٍ راحَ للطابور').not.toHaveBeenCalled();
  });

  it('and MANUAL_ENTRY is not the word a pull uses', async () => {
    // The auto-release, the caps and the transfer screen all read this
    // history: «she typed it» must be tellable from «she drew it».
    expect(MANUAL_ENTRY_REASON).toBe('MANUAL_ENTRY');
    expect(MANUAL_ENTRY_REASON).not.toMatch(/PULL|QUEUE|AUTO/i);
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * A ROW A LIST SHOWS IS A ROW THAT OPENS.
 *
 * Asked by comparing the two envelopes against each other, for every
 * scope, instead of describing either one. This is the shape that would
 * have caught the original defect: the list grew a branch and the read
 * did not, and nothing was holding them to each other.
 * ───────────────────────────────────────────────────────────────────────
 */
vi.mock('./authorization', () => ({
  can: () => true,
  requirePermission: vi.fn(),
  getPermissionScope: (u: SessionUser & { __scope?: string }) =>
    u.__scope ? { scope: u.__scope } : null,
}));

const { orderVisibilityWhere, orderListWhere } = await import('./rbac');

const user = (scope: string, id = 'u1'): SessionUser =>
  ({ id, status: 'ACTIVE', role: 'CUSTOM', __scope: scope }) as unknown as SessionUser;

/** Does this order satisfy a Prisma-shaped `{ OR: [...] }` envelope? */
function matches(envelope: Record<string, unknown>, order: Record<string, unknown>): boolean {
  if (Object.keys(envelope).length === 0) return true; // ALL_COMPANY
  const branches = (envelope.OR as Record<string, unknown>[] | undefined) ?? [envelope];
  return branches.some((branch) =>
    Object.entries(branch).every(([field, want]) => {
      if (field === 'OR') return true; // the lock sub-clause: not about ownership
      return order[field] === want;
    })
  );
}

describe('every order a list returns also opens', () => {
  /*
   * The orders one agent can be in any relation to. Each is a real state
   * the system produces: she pulled it, it was assigned to her, she typed
   * it and still holds it, she typed it and a colleague now holds it
   * (released · auto-released then pulled · transferred · pushed to the
   * queue by a full cap), and one that is nothing to do with her.
   */
  const ORDERS = [
    { name: 'سَحَبَتْه', claimedById: 'u1', createdById: null, assignedToId: null, currentOwnerId: null, moderatorId: null },
    { name: 'أُسنِدَ إليها', claimedById: null, createdById: null, assignedToId: 'u1', currentOwnerId: null, moderatorId: null },
    { name: 'كَتَبَتْه وتَحمِلُه', claimedById: 'u1', createdById: 'u1', assignedToId: null, currentOwnerId: null, moderatorId: null },
    { name: 'كَتَبَتْه ويَحمِلُه زميل', claimedById: 'u2', createdById: 'u1', assignedToId: null, currentOwnerId: 'u2', moderatorId: null },
    { name: 'كَتَبَتْه وراحَ للطابور', claimedById: null, createdById: 'u1', assignedToId: null, currentOwnerId: null, moderatorId: null },
    { name: 'طلبُ زميلٍ لا شأنَ لها به', claimedById: 'u2', createdById: 'u2', assignedToId: null, currentOwnerId: 'u2', moderatorId: null },
  ];

  for (const scope of ['ASSIGNED', 'OWN', 'ALL_COMPANY']) {
    it(`${scope}: nothing the list shows is refused by the read`, () => {
      const list = orderListWhere(user(scope));
      const read = orderVisibilityWhere(user(scope));
      const stranded = ORDERS.filter((o) => matches(list, o) && !matches(read, o));
      expect(
        stranded.map((o) => o.name),
        `صفوفٌ تُعرَضُ في القائمةِ وتُفتَحُ بـ«غير موجود»:\n${stranded.map((o) => `  ${o.name}`).join('\n')}`
      ).toEqual([]);
    });
  }

  it('and the one the review found opens for her by name', () => {
    // She typed it; a colleague holds it now. It is in her list, so it
    // must open — this is the exact order that answered «غير موجود».
    const hers = ORDERS.find((o) => o.name === 'كَتَبَتْه ويَحمِلُه زميل')!;
    expect(matches(orderListWhere(user('ASSIGNED')), hers), 'ليست في قائمتِها').toBe(true);
    expect(
      matches(orderVisibilityWhere(user('ASSIGNED')), hers),
      'في قائمتِها ولا تَفتَح'
    ).toBe(true);
  });

  it('and a colleague’s own order is still none of her business', () => {
    // The read must not have become a door onto everything.
    const theirs = ORDERS.find((o) => o.name === 'طلبُ زميلٍ لا شأنَ لها به')!;
    expect(matches(orderListWhere(user('ASSIGNED')), theirs)).toBe(false);
    expect(
      matches(orderVisibilityWhere(user('ASSIGNED')), theirs),
      'صارت تَقرأُ طلبَ زميلٍ لا تَملِكُه'
    ).toBe(false);
  });

  it('and the read still carries the pool, which the list still does not', () => {
    const pool = { claimedById: null, createdById: null, assignedToId: null, currentOwnerId: null, moderatorId: null, confirmationStatus: 'NEW', signatureStatus: 'UNSIGNED' };
    expect(
      matches(orderVisibilityWhere(user('ASSIGNED')), pool),
      'غلافُ القراءةِ فقدَ الطابور — السحبُ سيَنكسِر'
    ).toBe(true);
    expect(
      matches(orderListWhere(user('ASSIGNED')), pool),
      'الطابورُ رجعَ إلى قائمتِها'
    ).toBe(false);
  });
});
