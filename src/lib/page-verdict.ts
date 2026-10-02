/**
 * WHICH PAGE WON — AND REFUSING TO ANSWER UNTIL IT CAN BE ANSWERED.
 *
 * «الصفحة الفائزة هي الي بتطلّع أكتر طلبات مُسلَّمة ومحصَّلة لكل ١٠٠ زائر
 * — مش الي بتطلّع أكتر فورمات. صفحة بتجيب فورمات كتير ومرتجعات كتير
 * خاسرة.»
 *
 * That sentence is the whole module. The number that is easy to measure —
 * forms submitted per visitor — is the one that misleads: a page that
 * promises more than the product does fills more forms and loses more of
 * them at the door, and the seller pays the courier both ways. The number
 * that is true is money that arrived.
 *
 * SO THE VERDICT IS A SUGGESTION AND NEVER AN ACTION.
 *
 * «النظام بيقترح الفائز مع حجم العيّنة — ما بيطفّي الخاسر لحاله». Nothing
 * in this file turns a page off, and nothing calls anything that could. A
 * seller who is shown a winner and a sample size can disagree; a system
 * that switched the pages off would be deciding with the same thin numbers
 * and no way to be argued with.
 *
 * AND IT IS NOT A SIGNIFICANCE TEST, AND DOES NOT PRETEND TO BE.
 *
 * The floors below stop the obvious nonsense — a winner declared on nine
 * visitors — and the margin stops the coin flip. What they do not do is
 * tell a seller the result is statistically sound, because with the volumes
 * a single shop sees it usually is not, and a p-value printed beside a
 * sample of forty would be a lie dressed as rigour. The sample travels with
 * the verdict so a person can judge it.
 */

/**
 * A page's numbers over one window.
 *
 * `orders` is every order the page took. `delivered` is the ones that
 * reached the customer. `collected` is the ones whose money came back —
 * and it is a SUBSET of delivered: an order can be delivered and the cash
 * still be with the courier.
 */
export interface PageNumbers {
  pageId: string;
  label: string;
  visitors: number;
  orders: number;
  delivered: number;
  collected: number;
}

/**
 * The floors, per variant, before any verdict is offered.
 *
 * They are floors for LOOKING, not thresholds for significance. Three
 * hundred visitors is roughly a day of a small campaign, and ten delivered
 * orders is the point below which one returned parcel moves the rate by
 * ten percent — which is to say, below which the rate is noise with a
 * decimal point.
 */
export const MIN_VISITORS = 300;
export const MIN_DELIVERED = 10;

/**
 * How far apart two rates must be before one is called the winner.
 *
 * Relative, not absolute: two points between 4% and 6% is a real
 * difference, and the same two points between 40% and 42% is not. Ten
 * percent of the leader's own rate is the line.
 */
export const MIN_MARGIN = 0.1;

/** Orders that arrived AND were paid for, per hundred visitors. */
export function collectedPer100(numbers: PageNumbers): number | null {
  if (numbers.visitors <= 0) return null;
  return (numbers.collected / numbers.visitors) * 100;
}

/** How many of the orders a page took actually became orders. */
export function conversionRate(numbers: PageNumbers): number | null {
  if (numbers.visitors <= 0) return null;
  return numbers.orders / numbers.visitors;
}

/**
 * How many of the orders a page took were delivered.
 *
 * «نسبة التحويل ونسبة التسليم منفصلين» — separate on purpose, because they
 * fail in opposite directions and a single blended number hides which one
 * is wrong. A page with a high conversion and a low delivery rate is
 * over-promising; one with the reverse is simply not being read.
 */
export function deliveryRate(numbers: PageNumbers): number | null {
  if (numbers.orders <= 0) return null;
  return numbers.delivered / numbers.orders;
}

export type Verdict =
  | {
      ok: false;
      /** Which variants are still short, and of what. */
      waiting: { pageId: string; needVisitors: number; needDelivered: number }[];
    }
  | {
      ok: true;
      /** Named only when the lead is wider than the margin. */
      winner: string | null;
      /** Why there is no winner, when there is none. */
      tooClose: boolean;
      ranked: {
        pageId: string;
        label: string;
        collectedPer100: number;
        conversionRate: number | null;
        deliveryRate: number | null;
        visitors: number;
        delivered: number;
      }[];
    };

/**
 * The verdict, or an honest refusal to give one.
 *
 * It answers in one of exactly two ways, and the caller cannot mistake
 * them: either every variant has cleared the floors and there is a ranking
 * (with or without a named winner), or it says who is still short and by
 * how much. There is no third shape where a winner arrives with a caveat
 * attached — a caveat beside a name is read as a name.
 */
export function pageVerdict(variants: PageNumbers[]): Verdict {
  const waiting = variants
    .map((v) => ({
      pageId: v.pageId,
      needVisitors: Math.max(0, MIN_VISITORS - v.visitors),
      needDelivered: Math.max(0, MIN_DELIVERED - v.delivered),
    }))
    .filter((w) => w.needVisitors > 0 || w.needDelivered > 0);

  // EVERY variant has to clear them, not the leader. A winner called
  // against a variant nobody has seen yet is a winner against nothing.
  if (waiting.length > 0 || variants.length < 2) return { ok: false, waiting };

  const ranked = variants
    .map((v) => ({
      pageId: v.pageId,
      label: v.label,
      collectedPer100: collectedPer100(v)!,
      conversionRate: conversionRate(v),
      deliveryRate: deliveryRate(v),
      visitors: v.visitors,
      delivered: v.delivered,
    }))
    .sort((a, b) => b.collectedPer100 - a.collectedPer100);

  const [first, second] = ranked;
  const lead = first.collectedPer100 - second.collectedPer100;
  // `<= 0` IS AN EARLY EXIT, NOT A RULE. If the leader collected nothing
  // then every variant did, the lead is zero, and the division would give
  // zero anyway — a mutation replacing it with a guard against division by
  // zero was caught by nothing, and that is the honest reading. It is here
  // so the expression cannot produce NaN, not because it decides anything.
  const tooClose = first.collectedPer100 <= 0 || lead / first.collectedPer100 < MIN_MARGIN;

  return { ok: true, winner: tooClose ? null : first.pageId, tooClose, ranked };
}
