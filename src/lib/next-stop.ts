import { ALL_ROUTES, NAV, type RouteDef } from './route-registry';
import { activePath } from './active-route';

/**
 * WHERE YOU ARE ON A ROAD, AND THE STOP AFTER IT.
 *
 * The owner, 21/10: «الخطوة يتودي للثانية». The two roads the product
 * exists for — a parcel from the shelf to the courier and back, and the
 * courier's money from his hand to the books — are numbered in the menu
 * (`RouteDef.step`), and this is what the numbers are FOR: every screen on
 * a road says which stop it is and offers the next one.
 *
 * It is derived, not written per screen. Nine screens are stops, and a
 * «next» button hand-placed on each is nine places to forget when a stop is
 * added, renumbered or moved. The registry already knows the order; this
 * reads it.
 *
 * ── THE IMMEDIATE NEXT STOP, OR NOTHING ──
 *
 * Not «the next stop this person may open». A warehouse keeper holds the
 * first stop and the last and nothing between, and «التالي: المرتجعات» after
 * packing would say a parcel goes from the shelf straight to returns. The
 * stops in between are somebody else's job; the honest thing to say is
 * nothing, and to keep saying which stop this is.
 *
 * Pure, with no React and no session: the permission check arrives as an
 * argument, as it does for `canAccessRoute`, so the same answer can be
 * asked in the browser and in a test.
 */

export interface RoadPosition {
  /** The road's name — the group it is drawn under. */
  road: string;
  /** The stop this screen is. */
  here: RouteDef;
  /** How many stops the road has. */
  of: number;
  /** The very next stop, when this person may open it. */
  next: RouteDef | null;
}

const ALL_PATHS = ALL_ROUTES.map((r) => r.path);

/**
 * The road position for a pathname, or `null` when the screen is not a stop.
 *
 * `activePath` is the same «which item is lit» rule the menu uses (longest
 * match), so a nested address — a detail panel under a stop — still counts
 * as that stop, and a screen is never on two roads at once.
 */
export function roadPosition(
  pathname: string,
  mayOpen: (route: RouteDef) => boolean
): RoadPosition | null {
  const at = activePath(pathname, ALL_PATHS);
  const here = at ? ALL_ROUTES.find((r) => r.path === at) : undefined;
  if (!here || here.step === undefined) return null;

  const group = NAV.find((g) => g.routes.some((r) => r.path === here.path));
  if (!group) return null;

  const stops = group.routes.filter((r) => r.step !== undefined);
  const after = stops.find((r) => r.step === here.step! + 1);

  return {
    road: group.label,
    here,
    of: stops.length,
    next: after && mayOpen(after) ? after : null,
  };
}
