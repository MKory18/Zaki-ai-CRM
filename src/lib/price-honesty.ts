import type { Prisma } from '@prisma/client';
import type { db } from './db';

/**
 * A STRUCK-THROUGH PRICE MUST BE A PRICE SOMEBODY ACTUALLY PAID.
 *
 * `Offer.compareAtPrice` is typed by hand, and its own comment says «display
 * only». Nothing checked it against anything, and the offers screen used to
 * FILL IT IN — `basePrice × (quantity + free)` — so the discount a customer
 * saw was arithmetic the shop invented about a price it had never charged.
 *
 * The rule now: a «was» price is shown only when this exact bundle was sold
 * at it, and DELIVERED at it, enough times to be a price rather than an
 * anecdote. No evidence, no strike-through — the line disappears instead of
 * guessing, exactly as `delivery-time.ts` refuses to promise a date from
 * fewer than five deliveries.
 *
 * DELIVERED, not placed. An order that was cancelled at the door is not a
 * sale, and a price nobody ever handed over money for is not a former price.
 *
 * THE SELLER'S NUMBER IS A CEILING, NOT A CLAIM. They may still type one,
 * and it may be LOWER than the evidence — a shop is free to advertise less
 * of a discount than it could prove. It can never be higher.
 */

const MIN = 5;

/**
 * How many delivered orders at one price make it a price.
 *
 * Five, the same floor `delivery-time.ts` uses, and for the same reason: one
 * sale at a high price is an anecdote, and a discount measured against an
 * anecdote is a discount measured against nothing. The two numbers are kept
 * separate rather than shared because they answer different questions and
 * will move apart the first time either is tuned.
 */
export const MIN_PRICE_SAMPLE = MIN;

type Tx = Prisma.TransactionClient | typeof db;

/**
 * What each of these offers was really sold at before, or null.
 *
 * One query for the whole page. A product page shows three or four bundles
 * and asking per bundle would be four round trips to prove one line of text.
 *
 * The LOWEST qualifying price above the current one, not the highest: of the
 * prices this bundle genuinely carried, the least flattering is the one we
 * can least be argued with about.
 */
export async function evidencedWasPrices(
  tx: Tx,
  offers: { id: string; sellingPrice: number }[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (offers.length === 0) return out;

  const rows = await tx.order.groupBy({
    by: ['offerId', 'sellingPrice'],
    where: {
      offerId: { in: offers.map((o) => o.id) },
      // The door, not the placing: a cancelled order is not a sale.
      deliveredAt: { not: null },
    },
    _count: { _all: true },
  });

  const current = new Map(offers.map((o) => [o.id, o.sellingPrice]));
  for (const row of rows) {
    if (!row.offerId) continue;
    if (row._count._all < MIN) continue;
    const now = current.get(row.offerId);
    if (now === undefined || row.sellingPrice <= now) continue;
    const best = out.get(row.offerId);
    if (best === undefined || row.sellingPrice < best) out.set(row.offerId, row.sellingPrice);
  }
  return out;
}

/**
 * The «was» price this bundle may show — or null, which means show nothing.
 *
 * Pure, so the rule can be tested without a database. The order of the three
 * refusals is the rule itself: no evidence beats any claim, a claim below
 * the evidence is honoured, and a number that is not above what the customer
 * pays is not a saving — it is noise.
 */
export function struckThroughPrice(args: {
  /** What the customer pays for this bundle. */
  price: number;
  /** What the seller typed, if anything. A ceiling, never a source. */
  claim: number | null;
  /** What this bundle was really delivered at before, from `evidencedWasPrices`. */
  evidence: number | undefined;
}): number | null {
  const { price, claim, evidence } = args;
  if (evidence === undefined) return null;
  const shown = claim !== null ? Math.min(claim, evidence) : evidence;
  return shown > price ? shown : null;
}
