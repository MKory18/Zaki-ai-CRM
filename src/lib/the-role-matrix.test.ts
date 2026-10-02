import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '../types/auth';
import { repoFile, stripComments } from './guard-source';

/**
 * تشطيب ٢ — PASS 4: ROLE MATRIX.
 *
 * «The defect to hunt: a control hidden in the UI but permitted by the API.
 * That is not a permission, it is a decoration.»
 *
 * So nothing here reads a sidebar. Each row is the API's own answer — the
 * permission a route demands, the grant a role actually ends up with, or the
 * field a payload does not contain.
 *
 * TWO OF THE BRIEF'S TWELVE CHECKS ARE ABOUT ABSENCE, and absence is the
 * easiest thing to be wrong about: «the route does not exist», «the button
 * is impossible». Those are swept rather than asserted of one file.
 */

describe('moderator vs the confirmation queue — the contract’s hard stop', () => {
  it('the queue endpoint demands a permission she does not have', () => {
    const route = stripComments(repoFile('src/app/api/confirmation/queue/route.ts'));
    expect(route).toMatch(/requirePermission\('confirmation\.pull'\)/);
    // And the fallback is the supervisor's, not something broader.
    expect(route).toMatch(/requirePermission\('confirmation\.supervise'\)/);
  });

  it('and her legacy permissions contain neither, nor anything that reads as either', () => {
    const hers = ROLE_PERMISSIONS.MODERATOR as readonly string[];
    expect(hers).not.toContain('confirmation.pull');
    expect(hers).not.toContain('confirmation.supervise');
    // The whole confirmation family, so a new key cannot be added to her by
    // looking like one of the others.
    expect(hers.filter((p) => p.startsWith('confirmation.'))).toEqual([]);
  });
});

describe('an accountant may read an order and not touch it', () => {
  it('has orders.view and nothing that edits', () => {
    const hers = ROLE_PERMISSIONS.ACCOUNTANT as readonly string[];
    expect(hers).toContain('orders.view');
    for (const forbidden of ['orders.update', 'orders.update_own', 'orders.confirmation_status', 'orders.delete']) {
      expect(hers, forbidden).not.toContain(forbidden);
    }
  });
});

describe('a warehouse hand sees goods, never a customer', () => {
  it('the picking payload drops the lines that carry a name and a town', () => {
    const route = stripComments(repoFile('src/app/api/ai/picking/route.ts'));
    // THE CALL. `pickingPayload` alone is satisfied by the import line, and
    // a mutation that stopped calling it passed — the fifth time in one day
    // that a guard in this repository has accepted a name for a use.
    expect(route).toMatch(/pickingPayload\(\s*\w/);
    // The route must not reach past the payload builder for a customer.
    expect(route).not.toMatch(/customer\s*:/);
    expect(route).not.toMatch(/\bphone\b/);
    expect(route).not.toMatch(/\baddress\b/);
  });

  it('and the role carries no order permission of its own', () => {
    expect(ROLE_PERMISSIONS.WAREHOUSE as readonly string[]).toEqual([]);
  });
});

describe('a wallet movement cannot be deleted by anybody', () => {
  it('because the route has no DELETE at all', () => {
    // «any role deleting a wallet movement → route does not exist». Not a
    // permission check that could be loosened — a verb that was never
    // written.
    const route = repoFile('src/app/api/finance/wallets/[id]/movements/route.ts');
    expect(route).not.toMatch(/export\s+(async\s+)?function\s+DELETE/);
    // And the thing that exists instead.
    expect(route).toContain('reverseMovement');
  });
});

describe('a Telegram button cannot move money', () => {
  it('no handler in the channel approves, settles, pays or touches a wallet', () => {
    /*
     * Swept across the whole channel rather than asserted of one file: the
     * brief's check is «impossible», and impossible is a property of the set.
     */
    const FILES = [
      'src/lib/telegram/inbound.ts',
      'src/lib/telegram/order-creation.ts',
      'src/lib/telegram/parser.ts',
    ];
    for (const f of FILES) {
      const src = stripComments(repoFile(f));
      for (const forbidden of ['recordMovement', 'walletMovement', 'approveSettlement', 'payFromWallet', 'commissionPayout']) {
        expect(src, `${f}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe('product cost is behind its own grant', () => {
  it('and the payload omits it rather than sending it hidden', () => {
    // A cost that reaches the browser and is hidden by CSS is a cost that
    // reached the browser.
    const route = stripComments(repoFile('src/app/api/products/route.ts'));
    expect(route).toContain('maySeeCost(user)');
    expect(route).toMatch(/showCost \? prod\.batches : prod\.batches\.map\(withoutCost\)/);
    expect(route).toMatch(/\.\.\.\(showCost/);
  });
});

/**
 * THE ONE THE MATRIX CANNOT SETTLE BY ITSELF.
 *
 * A MODERATOR ends up with `orders.claim = ALL_COMPANY` and
 * `orders.confirm = ALL_COMPANY`, and the claim route lets an unclaimed
 * order be taken. The queue SCREEN refuses her — the contract's hard stop
 * holds where it is written — but claiming an order and confirming it is
 * the queue's work reached through another door.
 *
 * Whether that is right is an operations decision, not a code one: a
 * moderator who sourced an order and knows the customer may be exactly who
 * should confirm it. So the current behaviour is PINNED here rather than
 * changed, and reported. If the answer is that she should not, the fix is
 * her grant — not another check in the route.
 */
describe('what a moderator can reach by another door — pinned, not judged', () => {
  it('she may claim, and she may confirm', () => {
    const hers = ROLE_PERMISSIONS.MODERATOR as readonly string[];
    expect(hers).toContain('orders.claim');
    expect(hers).toContain('orders.confirmation_status');
  });

  it('and the claim route lets an unclaimed NEW order be taken', () => {
    const route = stripComments(repoFile('src/app/api/orders/[id]/claim/route.ts'));
    expect(route).toMatch(/!maybe\.claimedById/);
    expect(route).toMatch(/confirmationStatus === 'NEW'/);
  });

  it('but never one somebody else is holding', () => {
    const route = stripComments(repoFile('src/app/api/orders/[id]/claim/route.ts'));
    expect(route).toMatch(/order\.claimedById && order\.claimedById !== user\.id/);
  });
});
