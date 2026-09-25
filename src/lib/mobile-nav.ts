import type { NavGroup, RouteDef } from './route-registry';

/**
 * THE FIVE THINGS A PHONE SHOWS — AND WHY THEY ARE NOT THE SAME FIVE.
 *
 * A bottom bar has room for five. Picking the same five for everybody means
 * a confirmation agent's phone opens on a dashboard she cannot act on, with
 * the one screen she uses all day behind a menu.
 *
 * So the five are chosen from what THIS person may open, ordered by how
 * close each screen is to work they actually do on a phone:
 *
 *   a screen they act on standing up, with a customer waiting, outranks
 *   a screen they read sitting down, which outranks a screen they
 *   configure once a month.
 *
 * Everything else is still reachable — the sixth slot is "المزيد" and it
 * opens the whole list. Nothing is hidden; the frequent things are simply
 * not behind a menu.
 *
 * The server has already removed every route this person may not open, so
 * nothing here decides access. It only decides order.
 */

/**
 * How near a screen is to work done on a phone. Lower comes first.
 *
 * Written as a list of paths rather than a number per route so the ordering
 * can be read top to bottom and argued with: "why is the picking screen
 * above the products list" has an answer you can see.
 */
const PHONE_ORDER = [
  // Work done standing, with somebody waiting.
  '/confirmation/mine',
  '/confirmation/queue',
  '/ops/preparation',
  '/ops/tracking',
  '/orders',
  '/confirmation/postponed',
  '/ops/shipments/new',
  '/ops/returns',
  '/finance/collection',
  // Looked at often, acted on sometimes.
  '/dashboard',
  '/confirmation/issues',
  '/control/change-requests',
  '/inventory/balances',
  '/customers',
  '/products',
  // Read, rarely typed into on a phone.
  '/growth/performance',
  '/finance/wallets',
  '/assistant',
];

const rank = (path: string): number => {
  const i = PHONE_ORDER.indexOf(path);
  // Anything unlisted sits after everything listed, in registry order —
  // a new screen appears in "المزيد" rather than silently taking a slot
  // from a screen somebody uses every hour.
  return i === -1 ? PHONE_ORDER.length + 1 : i;
};

/** How many fit across the bottom of a phone beside "المزيد". */
export const BOTTOM_SLOTS = 4;

export interface MobileNav {
  /** The ones with their own tab, best first. */
  primary: RouteDef[];
  /** Everything else, grouped as the sidebar groups it. */
  rest: NavGroup[];
}

/**
 * Split what this person can reach into a bottom bar and a sheet.
 *
 * `current` is the page they are on. It is forced into the bar even when it
 * did not earn a slot: a tab bar that does not contain the page you are
 * looking at reads as broken, and somebody taps around trying to find where
 * they already are.
 */
export function mobileNav(groups: NavGroup[], current?: string | null): MobileNav {
  const all = groups.flatMap((g) => g.routes);
  const byRank = [...all].sort((a, b) => rank(a.path) - rank(b.path));

  const primary = byRank.slice(0, BOTTOM_SLOTS);

  if (current) {
    const here = all.find((r) => current === r.path || current.startsWith(r.path + '/'));
    if (here && !primary.some((r) => r.path === here.path)) {
      // Takes the last slot — the one that earned its place least.
      primary[primary.length - 1] = here;
    }
  }

  const taken = new Set(primary.map((r) => r.path));
  const rest = groups
    .map((g) => ({ ...g, routes: g.routes.filter((r) => !taken.has(r.path)) }))
    .filter((g) => g.routes.length > 0);

  return { primary, rest };
}
