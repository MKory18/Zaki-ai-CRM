/**
 * GLOBAL TRACKING — server-side pixel configuration (DB → client engine).
 *
 * Scope is resolved HERE, on the server. The client never decides which
 * pixels it "owns" — it only receives an already-filtered, re-validated
 * list for the page being rendered. IDs are re-validated on the way out
 * (fail closed: an invalid row is silently excluded).
 *
 * Tenant isolation: every query is companyId-scoped. On public pages the
 * companyId comes from the landing page row; the app is single-company by
 * design (resolveSingleCompanyId) — layout falls back to it when there is
 * no session (public pages) so GLOBAL/PUBLIC pixels work site-wide.
 */

import { db } from '@/lib/db';
import {
  filterPixelsForPage,
  TrackingPageContext,
  TrackingPixelView,
  TrackingPlatform,
  TrackingScope,
} from './tracking-types';
import { validateTrackingPixelId } from './tracking-validation';

function toView(row: {
  id: string;
  platform: string;
  name: string;
  pixelId: string;
  scope: string;
  enabled: boolean;
}): TrackingPixelView | null {
  const platform = row.platform as TrackingPlatform;
  const scope = row.scope as TrackingScope;
  const pixelId = validateTrackingPixelId(platform, row.pixelId);
  if (!pixelId) return null; // fail closed — never serve an invalid ID
  return { id: row.id, platform, name: row.name, pixelId, scope, enabled: row.enabled === true };
}

export async function getCompanyTrackingPixels(companyId: string): Promise<TrackingPixelView[]> {
  try {
    const rows = await db.trackingPixel.findMany({
      where: { companyId, enabled: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, platform: true, name: true, pixelId: true, scope: true, enabled: true },
    });
    return rows.map(toView).filter((p): p is TrackingPixelView => p !== null);
  } catch {
    return []; // tracking must never break a page render
  }
}

/** Pixels for a specific page context (GLOBAL + matching scope). */
export async function getTrackingPixelsForPage(
  companyId: string,
  page: TrackingPageContext
): Promise<TrackingPixelView[]> {
  return filterPixelsForPage(await getCompanyTrackingPixels(companyId), page);
}

/**
 * Site-wide pixels (GLOBAL + PUBLIC) for the root layout.
 * With a session → the user's company; public pages → the single company
 * (this deployment is single-company; errors are swallowed → no pixels).
 */
export async function getSiteTrackingPixels(sessionCompanyId?: string | null): Promise<TrackingPixelView[]> {
  try {
    let companyId = sessionCompanyId || null;
    if (!companyId) {
      const company = await db.company.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
      companyId = company?.id || null;
    }
    if (!companyId) return [];
    return filterPixelsForPage(await getCompanyTrackingPixels(companyId), 'PUBLIC');
  } catch {
    return [];
  }
}
