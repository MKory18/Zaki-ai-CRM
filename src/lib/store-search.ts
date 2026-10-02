import { z } from 'zod';
import { normalizeArabic } from './order-parser';
import type { ProductAttributes } from './product-attributes';

/**
 * WHAT A SHOPPER MEANT, NOT WHAT THEY TYPED.
 *
 * The spelling rule is NOT written here. `normalizeArabic` already strips
 * diacritics and the tatweel and unifies أ/إ/آ/ٱ → ا, ة → ه, ى → ي, ؤ → و,
 * ئ → ي — the brief's whole list — and six places in this system already
 * ask it. A second spelling rule beside it would be a second answer to
 * «هل «اذن» هي «الأُذُن»؟», and the two would part on the first addition.
 *
 * Three things are new, and each is a rule with a reason:
 *
 * SYNONYMS ARE THE SELLER'S. «طنين» and «صفير الأذن» are the same complaint
 * in two people's words, and only the person selling the remedy knows that.
 * A list we shipped would be wrong for the next shop.
 *
 * A TYPO IS A FALLBACK, NEVER A WIDENER. Tolerance runs only when the
 * ordinary match found nothing. A shopper who typed a real word and got
 * eleven near-misses mixed in with their four real results has been given
 * a worse answer, not a kinder one — and on a cheap phone they will not
 * scroll past the noise to find out.
 *
 * AND IT RANKS. A list that merely CONTAINS the match puts the thing they
 * asked for eighth. Starts-with beats contains, the name beats the code,
 * and a tolerated typo comes last, always, behind every real match.
 *
 * THE ANSWERS ARE SEARCHED, NOT JUST THE NAME. A shopper types the
 * complaint, not the product: «بثور» is nobody's product name and it is
 * exactly what a category asked about under «مناسب لـ». product-attributes
 * already says of its prose field that it «is shown and searched, never
 * faceted» — this is the half of that sentence that was missing, and
 * without it a shop fills in its answers and none of them are reachable.
 *
 * Behind the category and ahead of a typo, because an answer is a real
 * match on a real word and still not the thing the shopper named. Only
 * text: a number answered «50» would match a shopper typing a price.
 */

export interface SearchableProduct {
  id: string;
  name: string;
  sku?: string | null;
  category?: { name: string } | null;
  /** What this product answered to its category's questions. */
  attributes?: ProductAttributes | null;
}

/** A pair of words this shop treats as the same thing, in both directions. */
export interface Synonym {
  from: string;
  to: string;
}

/** Enough to be useful, few enough that a search stays one pass. */
export const MAX_SYNONYMS = 60;

export const synonymsSchema = z
  .array(
    z
      .object({
        from: z.string().trim().min(2, 'الكلمة قصيرة جداً').max(40),
        to: z.string().trim().min(2, 'الكلمة قصيرة جداً').max(40),
      })
      .refine((s) => normalizeArabic(s.from) !== normalizeArabic(s.to), {
        message: 'الكلمتان واحدة بعد التطبيع — لا شيء يضيفه هذا الزوج',
      })
  )
  .max(MAX_SYNONYMS, `لا أكثر من ${MAX_SYNONYMS} زوجاً`);

/**
 * The shop's vocabulary out of whatever is in the column.
 *
 * Never throws and never returns something the search has to check again: a
 * pair that no longer parses is dropped and the rest still work, because a
 * shop whose vocabulary stopped loading should lose a synonym, not its
 * search.
 */
export function parseSynonyms(raw: string | null | undefined): Synonym[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const whole = synonymsSchema.safeParse(value);
  if (whole.success) return whole.data;
  // Pair by pair. The cap is applied again here on purpose: the whole-list
  // schema carries it, and a list that failed the whole-list parse never
  // went through it — which is how a column holding sixty-five pairs came
  // back with all sixty-five.
  return value
    .flatMap((row) => {
      const one = synonymsSchema.safeParse([row]);
      return one.success ? one.data : [];
    })
    .slice(0, MAX_SYNONYMS);
}

/**
 * How far a token may be wrong before it stops being a typo.
 *
 * Nothing for a short word: at three letters, one edit reaches a different
 * word entirely, and «جل» matching «حل» is not tolerance, it is noise. Two
 * edits only once a word is long enough that two wrong letters still leave
 * five right ones.
 */
export function typoBudget(token: string): number {
  if (token.length <= 3) return 0;
  if (token.length <= 6) return 1;
  return 2;
}

/**
 * Levenshtein distance, and it stops counting once it passes `max`.
 *
 * A search runs this against every product on every keystroke, and the
 * answer «further than you care about» is the one wanted almost every
 * time — computing the exact distance to a word that shares no letters is
 * work thrown away.
 */
export function withinDistance(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  if (max <= 0) return false;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      row.push(value);
      if (value < best) best = value;
    }
    // Every path through this row is already too long; nothing below it
    // can come back under the budget.
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/**
 * The queries this shop's own vocabulary turns one query into.
 *
 * Both directions, because a shopper may type either side, and the seller
 * wrote the pair rather than an arrow. The original is always first: what
 * they actually typed outranks what we decided they meant.
 */
export function expandQuery(query: string, synonyms: Synonym[]): string[] {
  const q = normalizeArabic(query.trim());
  if (!q) return [];
  const out = [q];

  /**
   * THE DEFINITE ARTICLE, TRIED SECOND.
   *
   * «الأُذُن» and «اذن» are the same word to a shopper and were two
   * different searches here: a product called «قطرة للأذن» answered the
   * second and not the first, because «للاذن» does not contain «الاذن» as
   * a run of letters. The brief names these three spellings and says they
   * must return the same results; the spelling rule unified the letters
   * and nobody had looked at the article.
   *
   * ADDED, NOT SUBSTITUTED. «الماس» and «التين» begin with those two
   * letters as part of the word, and a search that stripped them would
   * answer «ماس» and «تين» — so the query as TYPED is still first and
   * still outranks this, exactly as a synonym does.
   *
   * Four letters at least, so «الم» does not become «م» and match
   * everything.
   */
  if (q.startsWith('ال') && q.length >= 4) {
    const bare = q.slice(2);
    if (!out.includes(bare)) out.push(bare);
  }
  for (const s of synonyms) {
    const from = normalizeArabic(s.from);
    const to = normalizeArabic(s.to);
    if (!from || !to) continue;
    if (q.includes(from) && !out.includes(q.replace(from, to))) out.push(q.replace(from, to));
    if (q.includes(to) && !out.includes(q.replace(to, from))) out.push(q.replace(to, from));
  }
  return out;
}

/**
 * Why a product came back, and in what order the shopper sees it.
 *
 * Lower is better. The numbers are gaps rather than 1,2,3 so a rank can be
 * added between two of them later without renumbering the rest.
 */
export const RANK = {
  nameStarts: 10,
  nameContains: 20,
  skuContains: 30,
  categoryContains: 40,
  attributeContains: 50,
  /** Always behind every real match — see the note at the top. */
  typo: 90,
} as const;

export interface SearchHit<T> {
  product: T;
  rank: number;
}

const tokens = (s: string): string[] => s.split(/\s+/).filter(Boolean);

/**
 * Every word a product answered with — a `select`'s one choice, a `multi`'s
 * several, a `text`'s prose. Numbers are left out on purpose.
 */
function answeredWords(attributes: ProductAttributes | null | undefined): string[] {
  if (!attributes) return [];
  return Object.values(attributes).flatMap((v) => {
    if (typeof v === 'string') return [normalizeArabic(v)];
    if (Array.isArray(v)) return v.map((x) => normalizeArabic(x));
    return [];
  });
}

function rankOf(p: SearchableProduct, q: string): number | null {
  const name = normalizeArabic(p.name);
  if (name.startsWith(q)) return RANK.nameStarts;
  if (name.includes(q)) return RANK.nameContains;
  if (normalizeArabic(p.sku ?? '').includes(q)) return RANK.skuContains;
  if (p.category && normalizeArabic(p.category.name).includes(q)) return RANK.categoryContains;
  if (answeredWords(p.attributes).some((w) => w.includes(q))) return RANK.attributeContains;
  return null;
}

/** Does any word of the name come within a typo's reach of any word typed? */
function nearlyMatches(p: SearchableProduct, q: string): boolean {
  const wanted = tokens(q);
  if (wanted.length === 0) return false;
  const have = tokens(normalizeArabic(p.name));
  return wanted.every((w) => have.some((h) => withinDistance(w, h, typoBudget(w))));
}

/**
 * The shop's search, over the products it was given.
 *
 * IN MEMORY, over this shop's catalogue, and that is a real boundary rather
 * than an oversight: matching Arabic in the database would need a second
 * copy of the spelling rule written in SQL, and two copies of that rule is
 * the defect this file opens by refusing. It is the right answer for a shop
 * of hundreds of products and the wrong one for a shop of tens of
 * thousands; the day one exists, what changes is a normalised column
 * written from THIS function, not a new rule beside it.
 *
 * An empty query returns nothing rather than everything: a search box that
 * answers a blank with the whole catalogue has answered a question nobody
 * asked, and the page that wanted the catalogue already has it.
 */
export function searchProducts<T extends SearchableProduct>(
  products: T[],
  query: string,
  options: { synonyms?: Synonym[]; limit?: number } = {}
): SearchHit<T>[] {
  const queries = expandQuery(query, options.synonyms ?? []);
  if (queries.length === 0) return [];
  const limit = options.limit ?? 40;

  const best = new Map<string, SearchHit<T>>();
  queries.forEach((q, qi) => {
    for (const p of products) {
      const rank = rankOf(p, q);
      if (rank === null) continue;
      // A synonym's hit ranks just behind the same hit on what was typed:
      // the shopper's own words win a tie.
      const scored = rank + qi;
      const had = best.get(p.id);
      if (!had || scored < had.rank) best.set(p.id, { product: p, rank: scored });
    }
  });

  // Only when nothing was found at all. Tolerance rescues a search that
  // failed; it never dilutes one that worked.
  if (best.size === 0) {
    for (const p of products) {
      if (queries.some((q) => nearlyMatches(p, q))) best.set(p.id, { product: p, rank: RANK.typo });
    }
  }

  return [...best.values()]
    .sort((a, b) => a.rank - b.rank || a.product.name.localeCompare(b.product.name, 'ar'))
    .slice(0, limit);
}

/**
 * What the box offers while somebody is still typing.
 *
 * The same search — a suggestion that led somewhere the results page does
 * not is worse than no suggestion. Short, because this is drawn under a
 * field on a phone.
 */
export const SUGGESTION_LIMIT = 6;

export function suggestProducts<T extends SearchableProduct>(
  products: T[],
  query: string,
  synonyms: Synonym[] = []
): T[] {
  return searchProducts(products, query, { synonyms, limit: SUGGESTION_LIMIT }).map((h) => h.product);
}
