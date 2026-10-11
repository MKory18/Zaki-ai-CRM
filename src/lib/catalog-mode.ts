/**
 * WHICH CATALOGUE A SHOP IS ON, IN A SENTENCE.
 *
 * The `/store` card already showed «منتجات معروضة» and «صفحات منشورة
 * مخفية». Both are true and neither is the answer: they are the INPUTS to
 * the catalogue rule, and a seller reading «٠» and «٤» has been handed
 * the arithmetic instead of the fact — while the fact is the one that
 * decides what a shopper actually sees on their shelf.
 *
 * ── THE RULE, SAID ONCE ──
 *
 * A store with at least one published shown page selling a product has
 * switched: its shelf is those pages' products, everywhere — the home
 * grid, `/shop`, search, the cards door, the sitemap, the catalogue block
 * (`storeShelf`). A store with none keeps every active product, exactly as
 * before. So `shownProducts` IS the switch, and this says so.
 *
 * ── WHY A FUNCTION AND NOT A TERNARY IN THE CARD ──
 *
 * `StoresScreen` is a client component and the shelf lives on the server,
 * so the sentence cannot be built where the rule is. A function here is
 * pure, carries no `db`, and can be asked for all three answers with real
 * numbers in a test — which a ternary inside JSX cannot.
 */

export interface CatalogMode {
  /** The store reads its shelf from its landing pages. */
  switched: boolean;
  /** The sentence for the card. */
  text: string;
  /** The label for the way out of here, or null when there is nothing to press. */
  action: string | null;
}

export function catalogModeAr(shownProducts: number, hiddenPublishedPages: number): CatalogMode {
  if (shownProducts > 0) {
    /*
     * Switched. No action: the shop is on the new catalogue and the seller
     * has nothing to press — a button here would be a thing to undo, and
     * «اخفِها» is a per-page decision on the page's own row.
     */
    return {
      switched: true,
      text: `الكتالوج: منتجات صفحات الهبوط (${shownProducts})`,
      action: null,
    };
  }

  if (hiddenPublishedPages > 0) {
    // The press has something to flip, so it is offered by name.
    return {
      switched: false,
      text: `لسا على الكتالوج القديم — ${hiddenPublishedPages} صفحة منشورة مخفية`,
      action: 'اعرضها كلها بضغطة',
    };
  }

  /*
   * Nothing published. Offering «اعرضها كلها» here would be a button that
   * cannot do what it says — the press flips published pages and there are
   * none — so the honest next step is to publish one.
   */
  return {
    switched: false,
    text: 'لسا على الكتالوج القديم — ولا صفحة منشورة بعد',
    action: 'انشر صفحة أول',
  };
}
