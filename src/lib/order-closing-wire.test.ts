import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * THE RULE REACHES THE SCREEN, OR IT IS A LIBRARY NOBODY READS.
 *
 * `order-closing` can be perfect and change nothing: the route may never
 * compute it, or compute it and not send it, or the screen may receive it
 * and draw nothing. Each of those leaves every test in `order-closing.test`
 * green while the person looking at a delivered, unpaid order still sees
 * one word that says it is done.
 */

const route = () => stripComments(repoFile('src/app/api/orders/[id]/route.ts'));
const modal = () => stripComments(repoFile('src/components/orders/OrderDetailModal.tsx'));

describe('the order detail computes the two stages', () => {
  it('asks the counting desk whether the goods came back', () => {
    const src = route();
    expect(src.length).toBeGreaterThan(2000);
    // THE RECEIPT, NOT THE STATUS. «تم إرجاعها» is the courier's word for a
    // parcel that may still be on his van; a receipt is somebody counting.
    expect(src).toMatch(/db\.returnReceipt\.count\(\{ where: \{ orderId: order\.id, companyId \} \}\)\) > 0/);
  });

  it('and hands the verdict to the screen', () => {
    const src = route();
    expect(src).toMatch(/const closing = closingStages\(\{/);
    expect(src).toMatch(/zone: getZone\(state\), commission, closing \}/);
  });

  it('without a second opinion of its own about what «closed» means', () => {
    // The route reads the rule; it does not re-decide it. A `=== 'SETTLED'`
    // written here would be the second answer that wins whichever screen
    // the owner opens first.
    const src = route();
    const after = src.slice(src.indexOf('const closing = closingStages'));
    expect(after.slice(0, 400)).not.toMatch(/SETTLED/);
  });
});

describe('and the screen draws them', () => {
  it('shows every stage that applies, and hides the ones that do not', () => {
    const src = modal();
    expect(src.length).toBeGreaterThan(2000);
    expect(src).toMatch(/order\.closing && \(order\.closing\.cash !== 'NONE' \|\| order\.closing\.goods !== 'NONE'\)/);
    expect(src).toMatch(/\.filter\(\(k\) => order\.closing\[k\] !== 'NONE'\)/);
  });

  it('names both stages from the one place they are named', () => {
    const src = modal();
    expect(src).toMatch(/STAGE_AR\[k\]/);
    expect(src).toMatch(/STAGE_STATE_AR\[order\.closing\[k\]/);
    expect(src, 'الشاشة تسمّي المراحل بنفسها').not.toMatch(/'الكاش'/);
  });

  it('and carries the reason, so a pending chip is never a bare colour', () => {
    expect(modal()).toMatch(/title=\{order\.closing\.why\}/);
  });
});
