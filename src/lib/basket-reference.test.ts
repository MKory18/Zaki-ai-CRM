import { describe, expect, it } from 'vitest';
import { MIN_CONFIRMED } from './channel-score';
import { repoFile, stripComments } from './guard-source';

/**
 * A REFERENCE IS A CLAIM ABOUT WHAT THIS SHOP CAN DO.
 *
 * The channels screen scores each door's basket against the best basket in
 * the shop — and that best was the maximum over EVERY door, with no sample
 * behind it. So one delivered order at an unusual price became the bar
 * every other door was measured against, and the doors doing the real work
 * scored a fraction of what they had earned.
 *
 * It is not hypothetical. The same fault was measured on the products
 * screen: the shop's best single delivered order was 50.01 and belonged to
 * a product with two of them. Letting it set the reference scored the three
 * real products 8, 9 and 9 out of 20 instead of 17, 20 and 20.
 *
 * The floor is `MIN_CONFIRMED`, the one this file already refuses to score
 * a rate below — a door whose delivery rate the product will not state must
 * not be the yardstick for everybody else's money.
 */

const route = () => stripComments(repoFile('src/app/api/settings/channels/performance/route.ts'));

describe('the money ceiling on the channels screen', () => {
  it('is taken only from doors that clear the sample floor', () => {
    const src = route();
    expect(src.length).toBeGreaterThan(1000);
    expect(src).toMatch(/\.filter\(\(c\) => \(attributed\.get\(c\.id\)\?\.confirmed \?\? 0\) >= MIN_CONFIRMED\)/);
    expect(src, 'السقف عاد يُؤخذ من كلّ الأبواب').not.toMatch(
      /Math\.max\(0, \.\.\.channels\.map\(\(c\) => basketOf\(c\.id\) \?\? 0\)\)/
    );
  });

  it('and it is the same floor the rest of the screen scores against', () => {
    expect(MIN_CONFIRMED).toBe(10);
    expect(route()).toContain('MIN_CONFIRMED');
  });

  /**
   * AND WHEN NO DOOR CLEARS IT THERE IS NO CEILING.
   *
   * Zero is not «the best basket is nothing» — it is «nobody has earned the
   * right to set the bar». `scoreChannel` already withholds a band whose
   * reference is missing, so the honest value to hand it is the one that
   * means absent, not the loudest accident in the table.
   */
  it('and falls back to no reference rather than to an accident', () => {
    expect(route()).toMatch(/eligibleBaskets\.length \? Math\.max\(\.\.\.eligibleBaskets\) : 0/);
  });
});
