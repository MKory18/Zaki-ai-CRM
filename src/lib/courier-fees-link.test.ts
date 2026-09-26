import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * A COURIER AND ITS FEES ARE ONE DECISION, ON TWO SCREENS.
 *
 * `DeliveryFee` already carries `deliveryProviderId`: in the data a fee IS
 * «this courier, this region». Only the SCREENS were split, and both said
 * so in their own comments — «their per-region fees live in
 * /settings/delivery-fees; a courier without fee rows cannot ship».
 *
 * Merging them into one page was the obvious move and the wrong one: 489
 * lines plus 459, and a fee table of fourteen regions per courier. What
 * was actually missing was not one page but the FACT — a courier that
 * cannot ship looked identical to one that can, and the list said «نشطة»
 * beside both.
 *
 * So the coverage is on the courier, and it links to that courier's fees.
 * This file keeps the two ends tied: a number that links nowhere, or a
 * screen that ignores the link, puts the split back.
 */

describe('a courier says whether it can ship', () => {
  it('and the list is told how many regions it is priced for', () => {
    const api = stripComments(repoFile('src/app/api/delivery-providers/route.ts'));
    expect(api, 'القائمة لا تعرف تغطية الأجور').toContain('pricedRegions');
    // The denominator too: «٨» is not an answer, «٨ من ١٢» is.
    expect(api, 'لا مقام للنسبة').toContain('totalRegions');
    // Counted for the current country, because a region belongs to one.
    expect(api).toMatch(/countryId:\s*country\.id/);
  });

  it('and shows it where the courier is, linking to that courier’s fees', () => {
    const src = stripComments(repoFile('src/components/screens/CouriersScreen.tsx'));
    expect(src).toContain('/settings/delivery-fees?courier=');
    // The state that matters most is the one that reads as fine today:
    // a courier with no fees at all.
    expect(src, 'لا تمييز للشركة التي لا تشحن').toContain('بلا أجور');
  });

  it('and the fees screen opens on the courier it was asked for', () => {
    const src = stripComments(repoFile('src/components/screens/DeliveryFeesScreen.tsx'));
    expect(src).toContain("useSearchParams().get('courier')");
    // Seeded from the query, not merely read and ignored.
    expect(src).toMatch(/useState\(asked \?\? ''\)/);
  });
});
