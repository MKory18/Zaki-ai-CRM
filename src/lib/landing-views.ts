import { randomUUID } from 'node:crypto';
import { db } from './db';

/**
 * A LANDING PAGE VIEW, COUNTED WHERE A DATE WINDOW CAN FIND IT.
 *
 * One row per page, day, device class and campaign, incremented by one per
 * public render. The page's lifetime `viewsCount` stays for the list and
 * the detail screens; this is what the performance screen reads, because a
 * lifetime number cannot answer "last week", "from phones" or "from this
 * advert".
 *
 * No personal data: the device is reduced to a class before it is stored,
 * and a link-preview crawler (the bot that draws the card when somebody
 * pastes the link into a chat) is not a visitor and is not counted.
 */

export type DeviceClass = 'mobile' | 'tablet' | 'desktop';

export const DEVICE_LABEL: Record<DeviceClass, string> = {
  mobile: 'جوال',
  tablet: 'تابلت',
  desktop: 'حاسوب',
};

const CRAWLER = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|telegrambot|twitterbot|linkedinbot|embedly|preview|headless|lighthouse/i;

/** The kind of device a user agent is, or null for a crawler (not a visitor). */
export function deviceClassOf(userAgent: string | null | undefined): DeviceClass | null {
  const ua = userAgent ?? '';
  if (!ua || CRAWLER.test(ua)) return null;
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** "yyyy-MM-dd" of a moment in the server's own day — the same day the date filters use. */
export function localDay(at: Date = new Date()): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

/**
 * Count one view. Atomic — two visitors at the same second both count —
 * and never throws: a view that fails to count must not fail the page.
 */
export async function recordLandingView(view: {
  companyId: string;
  storeId: string | null;
  landingPageId: string;
  campaignId: string | null;
  device: DeviceClass;
  at?: Date;
}): Promise<void> {
  try {
    await db.$executeRaw`
      INSERT INTO "landing_page_views" ("id", "companyId", "storeId", "landingPageId", "day", "device", "campaignId", "count")
      VALUES (${randomUUID()}, ${view.companyId}, ${view.storeId}, ${view.landingPageId},
              ${localDay(view.at)}::date, ${view.device}, ${view.campaignId ?? ''}, 1)
      ON CONFLICT ("landingPageId", "day", "device", "campaignId")
      DO UPDATE SET "count" = "landing_page_views"."count" + 1`;
  } catch {
    /* counting is never worth a failed page */
  }
}
