import { foldForMatch, matchProduct } from '../order-parser';

/**
 * WHICH PRODUCT A TELEGRAM ORDER NAMES — THE DECISION, TAKEN OUT OF THE DOOR SO IT CAN BE CHECKED ON ITS OWN.
 *
 * This was inline in `processStoredMessage`, between the customer's phone and the blacklist, where nothing could ask it a question
 * without a database behind it. Three steps, in order, and the order is the policy:
 *
 *   1. EXACT — the text IS a product's name, its English name or its SKU;
 *   2. CONTAINS — the text is inside a name, or a name is inside the text; one such product is the answer, SEVERAL are not («أكثر من
 *      منتج» goes to a person, because guessing between two products is how an order ships the wrong one);
 *   3. FUZZY — `matchProduct`, the same scorer the AI intake and the import use.
 *
 * Everything is compared in the form `foldForMatch` gives — spelling folded AND digits Latin — so a message typed on an Arabic keypad
 * («صوبة القدس ٤ شعلات») is the catalogue's «صوبة القدس 4 شعلات». Before, steps 1 and 2 missed it and step 3 could not tell the
 * 2-burner from the 4-burner (a one-digit token is under its floor), so the first product in the list won — and THIS door creates the
 * order without a person looking at it.
 *
 * It decides nothing else: the customer, the price, the stock and the order are the door's, and untouched.
 */
export interface ProductCandidate {
  id: string;
  name: string;
  nameEn?: string | null;
  sku: string;
}

export type ProductResolution<T> =
  | { kind: 'found'; product: T; how: 'exact' | 'contains' | 'fuzzy' }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

export function resolveProductText<T extends ProductCandidate>(productText: string, products: readonly T[]): ProductResolution<T> {
  const q = foldForMatch(productText);

  const exact = products.find(
    (p) => foldForMatch(p.name) === q || (p.nameEn && foldForMatch(p.nameEn) === q) || foldForMatch(p.sku) === q
  );
  if (exact) return { kind: 'found', product: exact, how: 'exact' };

  const contains = products.filter((p) => foldForMatch(p.name).includes(q) || q.includes(foldForMatch(p.name)));
  if (contains.length === 1) return { kind: 'found', product: contains[0], how: 'contains' };
  if (contains.length > 1) return { kind: 'ambiguous' };

  const fuzzy = matchProduct(productText, products.map((p) => ({ id: p.id, name: p.name, sku: p.sku })));
  if (!fuzzy) return { kind: 'none' };
  return { kind: 'found', product: products.find((p) => p.id === fuzzy.id) as T, how: 'fuzzy' };
}
