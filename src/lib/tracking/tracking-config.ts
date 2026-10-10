/**
 * GLOBAL TRACKING — server-side pixel configuration (DB → client engine).
 *
 * Scope is resolved HERE, on the server. The client never decides which
 * pixels it "owns" — it only receives an already-filtered, re-validated
 * list for the page being rendered. IDs are re-validated on the way out
 * (fail closed: an invalid row is silently excluded).
 *
 * Tenant isolation: every query is companyId-scoped, and the companyId
 * always comes from the page being rendered — the landing page's row or the
 * storefront's store — never from whoever happens to be signed in.
 */

import { db } from '@/lib/db';
import {
  filterPixelsForPage,
  pixelReaches,
  PageOrigin,
  TrackingPageContext,
  TrackingPixelView,
  TrackingPlatform,
  TrackingScope,
} from './tracking-types';
import { validateTrackingPixelId } from './tracking-validation';

/**
 * EVERY COLUMN OF A PIXEL THAT MAY LEAVE THE SERVER.
 *
 * Written once, used by every route that returns one. The pixel row now
 * carries an encrypted Conversions API token, and the way that token gets
 * leaked is not a mistake in the sending — it is a route that returns the
 * whole row because it always did, on the day somebody adds a column.
 *
 * `capiToken` is absent rather than stripped afterwards: a field that is
 * never selected cannot be accidentally serialised. `capiTokenHint` is the
 * last four characters and is safe — it is there so a seller can tell which
 * token is in there.
 */
export const PIXEL_PUBLIC_SELECT = {
  id: true, platform: true, name: true, pixelId: true, enabled: true,
  scope: true, createdAt: true, capiTokenHint: true, capiTestCode: true, capiDatasetId: true,
  // Where it fires. Not a secret, and a settings screen that cannot show it
  // is a screen on which «كل المتاجر» and «هذا المتجر» look identical.
  storeId: true, countryId: true,
} as const;

function toView(row: {
  id: string;
  platform: string;
  name: string;
  pixelId: string;
  scope: string;
  enabled: boolean;
  storeId: string | null;
  countryId: string | null;
}): TrackingPixelView | null {
  const platform = row.platform as TrackingPlatform;
  const scope = row.scope as TrackingScope;
  const pixelId = validateTrackingPixelId(platform, row.pixelId);
  if (!pixelId) return null; // fail closed — never serve an invalid ID
  return {
    id: row.id,
    platform,
    name: row.name,
    pixelId,
    scope,
    enabled: row.enabled === true,
    storeId: row.storeId,
    countryId: row.countryId,
  };
}

const SCOPE_COLUMNS = {
  id: true, platform: true, name: true, pixelId: true, scope: true,
  enabled: true, storeId: true, countryId: true,
} as const;

export async function getCompanyTrackingPixels(companyId: string): Promise<TrackingPixelView[]> {
  try {
    const rows = await db.trackingPixel.findMany({
      where: { companyId, enabled: true },
      orderBy: { createdAt: 'asc' },
      select: SCOPE_COLUMNS,
    });
    return rows.map(toView).filter((p): p is TrackingPixelView => p !== null);
  } catch {
    return []; // tracking must never break a page render
  }
}

/**
 * Pixels for one page: the right KIND of page, and the right SHOP.
 *
 * ── WHY THE ORIGIN IS REQUIRED AND NOT OPTIONAL ──
 *
 * It was `(companyId, page)` and every call site had the store to hand and
 * did not pass it, because there was nothing to pass it to. An optional
 * origin would compile at all four call sites and silently mean «every
 * pixel» at any one that forgot — which is the exact defect this is for.
 * Required, the compiler asks the question.
 *
 * ── AND THE FILTERING IS IN ONE PLACE, NOT TWO ──
 *
 * The narrowing could be done in SQL (`storeId IN (null, :store)`), and
 * that query would be faster and would be a SECOND copy of the rule — one
 * in Prisma's `where`, one in `pixelReaches`, and nothing to notice when
 * they disagree. A company has tens of pixels, not thousands. The rule
 * stays a pure function and the query stays «this company's enabled rows».
 */
export async function getTrackingPixelsForPage(
  companyId: string,
  page: TrackingPageContext,
  origin: PageOrigin
): Promise<TrackingPixelView[]> {
  const all = await getCompanyTrackingPixels(companyId);
  return filterPixelsForPage(
    all.filter((p) => pixelReaches(p, origin)),
    page
  );
}
