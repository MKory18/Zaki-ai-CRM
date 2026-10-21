import type { Prisma } from '@prisma/client';
import { DORMANT_DAYS, scoreCustomer, type CustomerHistory } from './customer-score';
import type { CustomerFacts } from './customer-insights';

/**
 * WHAT A SELLER ASKS OF THE CUSTOMER BOOK, AS ONE SET OF DEFINITIONS.
 *
 * «العملاء بدي الهم فلاتر». The strip above the list already counts the
 * book five ways — طلبوا, كرّروا الطلب, رفضوا طرداً — and a number that
 * cannot be pressed is a question the screen asks and will not let you
 * follow. So each of those counts is also a filter, and the word means the
 * same thing in both places because both are written HERE and nowhere else:
 *
 *   · `segmentWhere`   — the database's reading of the word (the list),
 *   · `segmentMatches` — the same word read in JS (the strip's counting),
 *   · `segmentCount`   — the number printed beside it in the dropdown.
 *
 * `customer-filters.test.ts` runs the three over the same rows and fails
 * the day they disagree, which is the only way «رفضوا طرداً (3)» stays a
 * promise that three rows will appear.
 *
 * NO NEW COLUMN, NO MIGRATION. Everything below is a comparison on the
 * counters the customer row already keeps — the same ones `scoreCustomer`
 * derives its grade from. A stored «segment» would be a label that was true
 * in March and goes stale the moment an order moves.
 *
 * AND A LIMITED VIEW GETS NONE OF IT. An agent who holds only
 * `customers.view_basic` may see a name, a number and a city, and is
 * deliberately not shown a customer's history or the history of all of them
 * added up. A filter «رفضوا طرداً» would hand them that history one row at
 * a time, and a sort by purchase value would hand them the ranking — so for
 * them every parameter below is ignored and the list stays what it was.
 * The search box, which they have always had, is unchanged.
 *
 * This module imports nothing from the server: the screen reads it too.
 */

export const SEGMENTS = ['ordered', 'never', 'repeat', 'received', 'refused', 'dormant'] as const;
export type Segment = (typeof SEGMENTS)[number];

/** The words on the strip where they exist, so a tile and its filter read alike. */
export const SEGMENT_AR: Record<Segment, string> = {
  ordered: 'طلبوا',
  never: 'لم يطلبوا بعد',
  repeat: 'كرّروا الطلب',
  received: 'استلموا',
  refused: 'رفضوا طرداً',
  dormant: `خاملون — بلا طلب منذ ${DORMANT_DAYS} يوماً`,
};

export const SORTS = ['orders', 'value', 'recent', 'newest'] as const;
export type CustomerSort = (typeof SORTS)[number];

/** Where the list has always started: the customers who matter first. */
export const DEFAULT_SORT: CustomerSort = 'orders';

export const SORT_AR: Record<CustomerSort, string> = {
  orders: 'الأكثر طلباً',
  value: 'الأعلى قيمة مشتريات',
  recent: 'الأحدث طلباً',
  newest: 'الأحدث إضافة',
};

export const isSegment = (v: unknown): v is Segment => typeof v === 'string' && (SEGMENTS as readonly string[]).includes(v);
export const isSort = (v: unknown): v is CustomerSort => typeof v === 'string' && (SORTS as readonly string[]).includes(v);

/** A governorate name is typed by nobody — it comes from the strip's own list — but a URL is typed by anyone. */
export const MAX_CITY_LENGTH = 80;
export function cleanCity(raw: string | null | undefined): string | undefined {
  const city = (raw ?? '').trim().slice(0, MAX_CITY_LENGTH);
  return city && city !== 'all' ? city : undefined;
}

/**
 * THE DATABASE'S READING OF EACH WORD.
 *
 * Plain comparisons, exactly the conditions `customerFacts` counts by.
 * «خاملون» is «ordered, and the last order is at least `DORMANT_DAYS` old»:
 * `daysQuiet >= N` where `daysQuiet = floor(elapsed / day)` is the same
 * statement as `elapsed >= N days`, so the boundary is `lte` on the date and
 * a customer who ordered exactly N days ago is in. A row with orders but no
 * `lastOrderDate` is not dormant in `scoreCustomer` (no date, no days), and
 * `lte` on a null date matches nothing — the two agree without a special case.
 */
export function segmentWhere(segment: Segment, now: Date): Prisma.CustomerWhereInput {
  switch (segment) {
    case 'ordered':
      return { totalOrders: { gt: 0 } };
    case 'never':
      return { totalOrders: { lte: 0 } };
    case 'repeat':
      return { totalOrders: { gte: 2 } };
    case 'received':
      return { deliveredOrders: { gt: 0 } };
    case 'refused':
      return { cancelledOrders: { gt: 0 } };
    case 'dormant':
      return {
        totalOrders: { gt: 0 },
        lastOrderDate: { lte: new Date(now.getTime() - DORMANT_DAYS * 86_400_000) },
      };
  }
}

/** The same word, read on a row in memory — what `customerFacts` does when it counts. */
export function segmentMatches(segment: Segment, row: CustomerHistory, now: Date): boolean {
  const orders = row.totalOrders;
  switch (segment) {
    case 'ordered':
      return orders > 0;
    case 'never':
      return orders <= 0;
    case 'repeat':
      return orders >= 2;
    case 'received':
      return (row.deliveredOrders ?? 0) > 0;
    case 'refused':
      return (row.cancelledOrders ?? 0) > 0;
    case 'dormant':
      return orders > 0 && scoreCustomer(row, now).dormant;
  }
}

/** The number printed beside the word, from the figures the strip already holds. */
export function segmentCount(segment: Segment, facts: CustomerFacts): number {
  switch (segment) {
    case 'ordered':
      return facts.ordered;
    case 'never':
      return facts.total - facts.ordered;
    case 'repeat':
      return facts.repeat;
    case 'received':
      return facts.received;
    case 'refused':
      return facts.refused;
    case 'dormant':
      return facts.dormant;
  }
}

/**
 * EVERY SORT ENDS IN THE ID. Two customers with the same value are still
 * two customers, and a page is a place only if equal rows can be told
 * apart — otherwise the «التالي» of one reader hands him a row he has
 * already seen and skips another.
 */
export function orderByOf(sort: CustomerSort): Prisma.CustomerOrderByWithRelationInput[] {
  switch (sort) {
    case 'value':
      return [{ totalPurchaseValue: 'desc' }, { id: 'asc' }];
    case 'recent':
      // Never-ordered customers have no date; they go last, not first.
      return [{ lastOrderDate: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'asc' }];
    case 'orders':
      return [{ totalOrders: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }];
  }
}

export interface CustomerFilterInput {
  /** `customers.view`. False is the limited view, which gets no filters at all. */
  full: boolean;
  now: Date;
}

export type CustomerFilterResult =
  | {
      ok: true;
      where: Prisma.CustomerWhereInput;
      orderBy: Prisma.CustomerOrderByWithRelationInput[];
      /** What was actually applied — the limited view's is always empty. */
      applied: { segment: Segment | null; city: string | null; sort: CustomerSort };
    }
  | { ok: false; error: string; errorAr: string };

/**
 * THE URL'S FILTERS, READ ONCE, IN ONE PLACE.
 *
 * `all` and an absent value mean «no filter». A value this module does not
 * know is REFUSED rather than ignored: ignoring it would answer a question
 * nobody asked with a list nobody filtered, which is how «رفضوا» became
 * «everyone» on a typo. The orders list refuses an unknown state the same
 * way.
 */
export function customerFilters(params: URLSearchParams, input: CustomerFilterInput): CustomerFilterResult {
  const none = { segment: null, city: null, sort: DEFAULT_SORT } as const;
  if (!input.full) return { ok: true, where: {}, orderBy: orderByOf(DEFAULT_SORT), applied: { ...none } };

  const rawSegment = params.get('segment')?.trim();
  let segment: Segment | null = null;
  if (rawSegment && rawSegment !== 'all') {
    if (!isSegment(rawSegment)) {
      return { ok: false, error: `Unknown customer segment: ${rawSegment}`, errorAr: `فئة عملاء غير معروفة: ${rawSegment}` };
    }
    segment = rawSegment;
  }

  const rawSort = params.get('sort')?.trim();
  let sort: CustomerSort = DEFAULT_SORT;
  if (rawSort) {
    if (!isSort(rawSort)) {
      return { ok: false, error: `Unknown customer sort: ${rawSort}`, errorAr: `ترتيب غير معروف: ${rawSort}` };
    }
    sort = rawSort;
  }

  const city = cleanCity(params.get('city')) ?? null;

  const where: Prisma.CustomerWhereInput = {
    ...(segment ? segmentWhere(segment, input.now) : {}),
    // Case-blind and exact: «عمّان» is one governorate however it was typed,
    // and it must not also match «عمّان الجديدة» the way a search would.
    ...(city ? { city: { equals: city, mode: 'insensitive' as const } } : {}),
  };

  return { ok: true, where, orderBy: orderByOf(sort), applied: { segment, city, sort } };
}
