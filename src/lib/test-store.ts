/**
 * A TEST BENCH IS NOT A SHOP, AND ITS NUMBERS ARE NOT THE BUSINESS'S.
 *
 * «منتج تيست — بيئةٌ منعزلة … أرقامٌ لا تدخل أيَّ حسبة». The owner wants to
 * put a product in front of real traffic without the result landing in the
 * books: fifty niche products tried, forty-six abandoned, and not one dinar
 * of that in the profit report.
 *
 * ── WHY A STORE CARRIES THE MARK ──
 *
 * MEASURED before anything was written: 253 queries in this product already
 * filter by `storeId`, and every one of them excludes a test store for free.
 * 31 are company-wide AND touch money, in 22 files — a surface a person can
 * read in an afternoon. A flag on the PRODUCT would inherit none of the 253
 * and would have to defend all 284, which is the «guard that is a list»
 * trap: the one site nobody thought of is the one that puts a test sale in
 * the owner's profit.
 *
 * A second COMPANY would have been perfect isolation with no exclusion
 * needed at all — and it was refused by the requirement that put this here.
 * «إنشاءُ منتج من DNA منتجاتك الناجحة» means the bench READS the real
 * products, and a cross-company read is the one thing this system refuses
 * everywhere. The bench lives inside the company it learns from.
 *
 * ── AND IT HIDES NOTHING ──
 *
 * Categories, couriers, regions, delivery fees and settings belong to the
 * COMPANY and stay shared: a bench with its own courier list tests nothing
 * about delivery, and a bench with its own categories cannot be compared to
 * the shop it is a bench for. What this file marks is the boundary for
 * FIGURES — and it is the only place that says which figures, so that
 * «which» can be read in one sitting instead of grepped for.
 */

/**
 * THE FILTER, FOR A COMPANY-WIDE QUERY OVER ROWS THAT CARRY MONEY.
 *
 * Spread into a `where` beside `companyId`, on a model whose rows reach a
 * store through `store`:
 *
 *     where: { companyId, ...realStoresOnly() }
 *
 * A FUNCTION, NOT A CONSTANT, for the reason `leftWarehouseWhere()` is one:
 * a module-level object spread into a query is shared mutable state, and one
 * caller editing it changes the rule for every other caller for the life of
 * the process.
 *
 * `isTest: false` AND NOT `{ not: true }`: the column is `NOT NULL DEFAULT
 * false`, so the two are the same set today — and `false` is the one that
 * stays correct if the column ever becomes nullable, because `not: true`
 * would then also match a row that has not been decided.
 */
export function realStoresOnly(): { store: { isTest: false } } {
  return { store: { isTest: false } };
}

/**
 * THE SAME RULE WHERE THE STORE IS THE ROW ITSELF.
 *
 * `store.findMany({ where: { companyId, ...realStoresHere() } })` — used by
 * anything that lists or totals STORES rather than rows inside them.
 */
export function realStoresHere(): { isTest: false } {
  return { isTest: false };
}

/**
 * AND THE INVERSE, FOR THE BENCH'S OWN SCREENS.
 *
 * «جدولُ النتائج، لوحةٌ خاصّة». The results table is the whole point: the
 * figures are refused everywhere EXCEPT the one place built to read them.
 * Named rather than written inline at those screens, so a reader greping for
 * `isTest` finds both halves of the rule in one file.
 */
export function benchOnly(): { store: { isTest: true } } {
  return { store: { isTest: true } };
}

/**
 * WHY A FIGURE LEFT A TEST SALE OUT, IN A SENTENCE A SCREEN CAN PRINT.
 *
 * A total that silently differs from the orders list is a total somebody
 * spends an afternoon on. When a company has a bench at all, the figure says
 * so beside itself.
 */
export function benchExcludedAr(benchOrders: number): string | null {
  if (benchOrders <= 0) return null;
  return `لا يشمل ${benchOrders} طلباً على منصّة التجريب — أرقامها خارج كل حسبة.`;
}
