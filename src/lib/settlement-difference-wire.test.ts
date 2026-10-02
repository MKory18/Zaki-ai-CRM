import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * THE TWO BUTTONS AND THE NOTES REACH THE SCREEN WHERE THE DIFFERENCE IS.
 *
 * «حط زر أشاهد التعليقات الداخلية، وزر ترحيل على اعتماد… بس بضل الطلب
 * معلّم.» A rule that decides what a resolution means changes nothing while
 * the row still shows two numbers and no way to answer them.
 */

const route = () => stripComments(repoFile('src/app/api/finance/statements/[id]/matches/[matchId]/resolve/route.ts'));
const screen = () => stripComments(repoFile('src/components/screens/finance/MatchingScreen.tsx'));
const actions = () => stripComments(repoFile('src/components/screens/finance/DifferenceActions.tsx'));

describe('the route that records which figure stands', () => {
  it('refuses to record a reason on a line that matched', () => {
    const src = route();
    expect(src.length).toBeGreaterThan(500);
    expect(src).toMatch(/if \(!isDifference\(match\)\)/);
    expect(src).toContain("code: 'NOT_A_DIFFERENCE'");
  });

  /**
   * AND IT MOVES NO MONEY. A resolution records WHY two figures differ; the
   * money is moved by the receipt and the approval, each with its own
   * permission and its own audit. A wallet write from here would be a
   * second money path into settlement, reached from a button whose label
   * says «record the reason».
   */
  it('and writes no money anywhere', () => {
    const src = route();
    for (const forbidden of ['walletMovement', 'financialTransaction', 'settlementStatus', 'collectedAmount']) {
      expect(src, `${forbidden} في مسار تسجيل السبب`).not.toContain(forbidden);
    }
  });

  it('writes the decision back to the order, where the discount was written', () => {
    const src = route();
    expect(src).toMatch(/tx\.orderNote\.create\(\{/);
    expect(src).toMatch(/kind: 'internal'/);
    expect(src).toMatch(/action: 'SETTLEMENT_DIFFERENCE_RESOLVED'/);
  });

  it('and is asked for the settlement permission, not merely a login', () => {
    expect(route()).toContain("requirePermission('settlement.review')");
  });
});

describe('the screen', () => {
  it('offers the actions on every difference queue and on none of the matched', () => {
    const src = screen();
    expect(src.length).toBeGreaterThan(2000);
    // Three difference queues carry it; «مطابق» must not.
    expect((src.match(/resolvable/g) ?? []).length).toBeGreaterThanOrEqual(4);
    const matched = src.slice(src.indexOf('title="مطابق"'), src.indexOf('title="فرق في المبلغ"'));
    expect(matched.length).toBeGreaterThan(50);
    expect(matched, 'طابور المطابق صار فيه بتّ').not.toContain('resolvable');
  });

  it('and redraws the queue after an answer, so the chip is the saved one', () => {
    expect(screen()).toMatch(/onResolved=\{\(\) => void load\(selected!\)\}/);
  });

  it('carries the resolution down from the API rather than guessing it', () => {
    expect(screen()).toMatch(/resolution: string \| null;/);
    expect(screen()).toMatch(/resolution=\{m\.resolution\}/);
  });
});

describe('the actions themselves', () => {
  it('show both answers, each with what it does to the money', () => {
    const src = actions();
    expect(src).toMatch(/RESOLUTIONS\.map/);
    expect(src).toMatch(/title=\{RESOLUTION_MEANING\[r\]\}/);
  });

  it('and the notes button reads the order’s own notes, internal only', () => {
    /*
     * The button and its modal moved to `OrderNotesPeek` on 2026-10-02, so the
     * returns desk could have them too — the contract surfaces notes in four
     * places and that was the one with an input and no way to read. This
     * screen now says WHICH kinds it wants, and the shared component is what
     * fetches; both halves are still checked, in their new homes.
     */
    const src = actions();
    expect(src).toMatch(/<OrderNotesPeek/);
    expect(src).toMatch(/kinds=\{INTERNAL_ONLY\}/);
    expect(src).toMatch(/const INTERNAL_ONLY = \['internal'\] as const;/);

    const peek = repoFile('src/components/orders/OrderNotesPeek.tsx');
    expect(peek).toMatch(/\/api\/orders\/\$\{orderId\}\/notes/);
    // The filter is the component's, and it must honour the kinds it is given
    // rather than showing everything when a screen asked for one kind.
    expect(peek).toMatch(/kinds \? \(notes \?\? \[\]\)\.filter\(\(n\) => kinds\.includes\(n\.kind\)\) : \(notes \?\? \[\]\)/);
  });

  /**
   * «بس بضل الطلب معلّم» — answering does not remove the row from the
   * difference queue, and the chip is not a green tick that says it never
   * happened.
   */
  it('and an answered row keeps its place, with the answer shown on it', () => {
    const src = actions();
    expect(src).toMatch(/if \(resolution\) \{/);
    expect(src).toMatch(/RESOLUTION_AR\[resolution as Resolution\]/);
    expect(src, 'الصفّ يختفي بعد البتّ').not.toMatch(/return null;/);
  });
});
