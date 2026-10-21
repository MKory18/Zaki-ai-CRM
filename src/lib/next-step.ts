/**
 * THE STEP AFTER THIS ONE — WHAT IT IS CALLED, WHERE IT GOES, AND WHEN IT IS OFFERED.
 *
 * The owner, 21/10: «الخطوة يتودي للثانية». `next-stop.ts` answers it for the
 * two numbered roads, from the menu's own order. This answers it for the
 * moments that are not a stop of a road — an order was just made, the last
 * order on a desk was just confirmed, a batch was just built — where the
 * next thing is not «the next screen in a list» but the place the thing that
 * just happened can be found.
 *
 * One file, so the wording and the address of each are written once and
 * tested once, instead of living inside three screens' success handlers where
 * a rename of a route would have to be remembered in three places.
 *
 * ── A STEP IS OFFERED ONLY WHEN IT CAN BE TAKEN ──
 *
 * Every function takes the permission question as an argument (`mayOpen`, the
 * same shape `useMayOpen` returns) and answers `undefined` when the person
 * may not open the screen it points at. A link that ends in a refusal is
 * worse than no link, and the caller never has to remember to ask.
 *
 * Pure, with no React: the decisions are testable without a screen.
 */

export interface Step {
  label: string;
  href: string;
}

type MayOpen = (path: string) => boolean;

/** An order's id is a uuid. The same test the order's own page applies. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * «افتح الطلب» — after one was made.
 *
 * The id is checked for its shape here as well as on the page: a link built
 * from something that is not an id is a link to a 404, and offering one in a
 * success message is a worse failure than offering none.
 */
export function openOrderStep(orderId: unknown, mayOpen: MayOpen): Step | undefined {
  if (typeof orderId !== 'string' || !UUID.test(orderId)) return undefined;
  if (!mayOpen('/orders')) return undefined;
  return { label: 'افتح الطلب', href: `/orders/${orderId}` };
}

/** What an agent's desk holds, as `GET /api/confirmation/mine` answers it. */
export interface Desk {
  /** Nobody has failed to reach this customer yet — these are calls to make. */
  work: readonly unknown[];
  /** One or two no-answers — these are decisions to take. */
  noAnswer: readonly unknown[];
}

/**
 * Is there anything left to DO on this desk?
 *
 * Calls to make and decisions to take — and nothing else. The orders already
 * confirmed today, the one the third no-answer closed, and the ones
 * postponed to a later day are not on the list of work: they are history and
 * a promise, and an agent with only those left has an empty desk.
 *
 * `null` — the desk could not be read — is NOT empty. «I do not know» must
 * never be rendered as «you are done».
 */
export function deskIsEmpty(desk: Desk | null | undefined): boolean {
  return !!desk && desk.work.length === 0 && desk.noAnswer.length === 0;
}

/**
 * «اسحب طلبات جديدة» — only when that was the last thing on her desk.
 *
 * Not before: with forty rows still there, offering to take on more work is
 * an instruction to start something while what is in front of her is not
 * done. And a LINK to the pull screen, not a second pull: the pull has one
 * door and one set of refusals — the cap, the empty pool, «not your desk» —
 * and a button here that called it directly would need all of them again.
 */
export function pullMoreStep(desk: Desk | null | undefined, mayOpen: MayOpen): Step | undefined {
  if (!deskIsEmpty(desk)) return undefined;
  if (!mayOpen('/confirmation/queue')) return undefined;
  return { label: 'اسحب طلبات جديدة', href: '/confirmation/queue' };
}

/** «اطبع البوالص» — after a batch was made; printing lives on the batches screen. */
export function printLabelsStep(mayOpen: MayOpen): Step | undefined {
  if (!mayOpen('/ops/batches')) return undefined;
  return { label: 'اطبع البوالص', href: '/ops/batches' };
}
