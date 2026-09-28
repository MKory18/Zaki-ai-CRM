import { scoreCustomer, type CustomerGrade, type CustomerHistory } from './customer-score';

/**
 * WHAT THE CUSTOMER BOOK SAYS, AS ONE SET OF FIGURES.
 *
 * Read twice: by the customers screen, for the strip above the list, and
 * by the assistant, as the data it is allowed to see. One function so the
 * two can never disagree — the thing that happens the moment a screen adds
 * up its own rows and an endpoint adds up the same rows differently.
 *
 * MEASURED BEFORE IT WAS WRITTEN. 178 customers: 167 have ordered, 111
 * have received something, ONE has refused, ONE has ordered twice. Which
 * settles what this can honestly say. A per-customer verdict needs three
 * decided orders and almost nobody has them, so a screen of 178 chips
 * reading «لا يكفي» would be 178 pieces of noise. The counts, the repeat
 * rate and the refusals are real, and they are what this returns.
 *
 * NO NAME, NO PHONE, NO ADDRESS. The assistant is given this object, and
 * a customer's identity is not part of any question worth asking a model.
 * Cities are counted, never listed against a person.
 */

export interface CustomerFacts {
  total: number;
  /** Ordered at least once. */
  ordered: number;
  /** Ordered twice or more — the only real evidence of a returning buyer. */
  repeat: number;
  /** Took delivery of at least one. */
  received: number;
  /** Refused or cancelled at least one. */
  refused: number;
  /** How many fall in each grade, including those with too little history. */
  byGrade: Record<CustomerGrade, number>;
  /** Quiet for longer than the dormancy line, among those who ever ordered. */
  dormant: number;
  /** The governorates they are in, biggest first. */
  cities: { city: string; count: number }[];
  /**
   * Delivered ÷ decided across everybody, or null when nothing is decided.
   * The one rate that means anything at this size: per-customer rates are
   * mostly one order divided by one order.
   */
  deliveryRate: number | null;
}

/**
 * A row as the database hands it over: the counters are non-null columns
 * with defaults, and the city may be blank.
 */
export interface CustomerRow extends CustomerHistory {
  city?: string | null;
}

const EMPTY_GRADES: Record<CustomerGrade, number> = {
  loyal: 0,
  good: 0,
  watch: 0,
  risky: 0,
  new: 0,
};

export function customerFacts(rows: CustomerRow[], now: Date): CustomerFacts {
  const byGrade = { ...EMPTY_GRADES };
  const cityCount = new Map<string, number>();
  let ordered = 0;
  let repeat = 0;
  let received = 0;
  let refused = 0;
  let dormant = 0;
  let delivered = 0;
  let decided = 0;

  for (const row of rows) {
    const score = scoreCustomer(row, now);
    byGrade[score.grade] += 1;

    const orders = row.totalOrders;
    if (orders > 0) ordered += 1;
    if (orders >= 2) repeat += 1;
    if ((row.deliveredOrders ?? 0) > 0) received += 1;
    if ((row.cancelledOrders ?? 0) > 0) refused += 1;
    // Dormancy is only a fact about somebody who ever ordered; a customer
    // added by hand and never sold to is not "quiet", they are new.
    if (orders > 0 && score.dormant) dormant += 1;

    delivered += row.deliveredOrders ?? 0;
    decided += (row.deliveredOrders ?? 0) + (row.cancelledOrders ?? 0);

    const city = row.city?.trim();
    if (city) cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
  }

  return {
    total: rows.length,
    ordered,
    repeat,
    received,
    refused,
    byGrade,
    dormant,
    cities: [...cityCount.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count),
    deliveryRate: decided > 0 ? Math.round((delivered / decided) * 1000) / 10 : null,
  };
}
