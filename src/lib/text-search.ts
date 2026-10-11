/**
 * WHAT A PERSON TYPED, MATCHED THE WAY A PERSON EXPECTS.
 *
 * The owner's note: «ما بطلع بحث في المرتجعات». Measured on the live
 * database before anything was written: the waybill `GPMAINMUR6E5FO` is
 * found by `GPMAINMUR6E5FO` and NOT by `gpmainmur6e5fo` — one row against
 * zero. The order number behaves the same: `ord-2026-0039` finds nothing.
 *
 * Prisma's `contains` compiles to `LIKE`, which Postgres applies with case.
 * So every search box in this product was asking the person at the keyboard
 * to match the capitals of a code printed on a label — and a warehouse hand
 * typing a waybill, or a seller looking for «sara» among the «Sara»s, got
 * «لا نتائج» and concluded the search is broken. It was.
 *
 * ── WHY A HELPER AND NOT TWENTY-SEVEN EDITS ──
 *
 * It was twenty-eight sites in eight files. Spelling `mode: 'insensitive'`
 * at each one is twenty-eight chances to forget it, and the twenty-ninth
 * search box somebody adds next month inherits the defect by default. One
 * function is one answer to «how does this product match text», and the
 * sweep in `a-search-box-is-not-a-password.test.ts` WALKS the repository
 * for `contains:` rather than listing the places it knows about.
 *
 * ── WHAT IS DELIBERATELY NOT THIS ──
 *
 * A case-sensitive `contains` is right when the needle is not something a
 * person typed. `storefront.ts` looks a handle up inside a stored JSON
 * array with `contains: '"<handle>"'`; a slug is lowercase by construction
 * and that match is a containment test on a serialised string, not a
 * search. Those sites name themselves in the sweep's exemptions, with the
 * reason, rather than being quietly skipped.
 *
 * And this is NOT the shopper's search. `store-search.ts` folds Arabic
 * spelling, ranks starts-with above contains, and tolerates a typo only
 * after an exact pass found nothing. That engine answers «what did the
 * shopper mean»; this one answers «ignore the shift key», which is the
 * smallest possible version of the same courtesy and the only one a
 * `where` clause can express.
 */

/** A Prisma string filter for a term a person typed into a box. */
export interface TypedMatch {
  contains: string;
  mode: 'insensitive';
}

/**
 * Match `term` anywhere in the column, ignoring case.
 *
 * Returns the filter object rather than taking the whole `where`, so it
 * drops into the `OR` arrays these searches already build and reads at the
 * call site as what it is: `{ orderNumber: typed(term) }`.
 */
export function typed(term: string): TypedMatch {
  return { contains: term, mode: 'insensitive' };
}
