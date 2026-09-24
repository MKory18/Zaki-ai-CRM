import { z } from 'zod';
import type { AttributionRow } from './attribution-performance';

/**
 * WHAT AN AD COST, AND WHAT IT BROUGHT BACK.
 *
 * The attribution engine already answers the second half for moderators and
 * channels, and a campaign is judged the same way — so it reuses that, and
 * this file only adds the half the system cannot witness: the money that
 * left for Meta or TikTok.
 *
 * That money is TYPED IN. It could be fetched from an ad account's API, and
 * one day it should be, but a seller reading their own ads manager enters
 * it in ten seconds and every number beside it is already real. Waiting for
 * API keys to ship a screen that is 90% measured would have been waiting
 * for the wrong thing.
 *
 * All arithmetic is here and none of it is in a component. A ratio worked
 * out in the browser is a ratio that disagrees with the one in the export
 * the first time somebody rounds differently.
 */

export const CAMPAIGN_PLATFORMS = [
  { key: 'META', label: 'ميتا — فيسبوك وإنستغرام' },
  { key: 'TIKTOK', label: 'تيك توك' },
  { key: 'SNAPCHAT', label: 'سناب شات' },
  { key: 'GOOGLE', label: 'جوجل ويوتيوب' },
  { key: 'OTHER', label: 'أخرى' },
] as const;

export const CAMPAIGN_STATUSES = [
  { key: 'ACTIVE', label: 'تعمل الآن' },
  { key: 'PAUSED', label: 'متوقفة مؤقتاً' },
  { key: 'ENDED', label: 'انتهت' },
] as const;

export type CampaignPlatform = (typeof CAMPAIGN_PLATFORMS)[number]['key'];
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]['key'];

/**
 * The code that goes in the ad's link.
 *
 * Short, unambiguous, and typed into a phone if it has to be: no vowels
 * that could be read as each other, no characters a URL would escape. It
 * appears as `?c=CODE` and is the only thing connecting a click to a spend.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

export function generateCampaignCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export const campaignCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,16}$/, 'الرمز حروف إنجليزية وأرقام فقط، من ٣ إلى ١٦ خانة');

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2, 'اسم الحملة مطلوب').max(80),
  platform: z.enum(['META', 'TIKTOK', 'SNAPCHAT', 'GOOGLE', 'OTHER']).default('META'),
  code: campaignCodeSchema.optional(),
  landingPageId: z.string().uuid().nullable().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']).default('ACTIVE'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  // A campaign that has not run yet has spent nothing; that is a real state
  // and not a missing value.
  spend: z.coerce.number().min(0).max(100_000_000).default(0),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;

/** A campaign cannot end before it starts. */
export function datesMakeSense(start: Date, end: Date | null | undefined): boolean {
  if (!end) return true;
  return end.getTime() >= start.getTime();
}

export interface CampaignResult {
  /** Money spent on the ad, as the seller entered it. */
  spend: number;
  /** Collected where known, order total where not — the profit screen's definition. */
  revenue: number;
  /** Revenue minus spend. NOT profit: the goods cost something too. */
  net: number;
  /** Revenue per unit of spend. null when nothing has been spent yet. */
  roas: number | null;
  /** What one DELIVERED order cost in ad money. null with none delivered. */
  costPerDelivered: number | null;
  /** What one order cost, delivered or not — the cost of a lead. */
  costPerOrder: number | null;
}

/**
 * The money view of a campaign.
 *
 * `net` is deliberately not called profit. Profit needs the cost of the
 * goods, the delivery fee and the commission, and those live in the profit
 * service where they belong. Calling this profit would have a seller reading
 * a number that is too high by the cost of everything they sold.
 */
export function campaignResult(spend: number, row: Pick<AttributionRow, 'revenue' | 'brought' | 'delivered'> | null): CampaignResult {
  const revenue = row?.revenue ?? 0;
  const brought = row?.brought ?? 0;
  const delivered = row?.delivered ?? 0;
  const money = Math.max(0, Number(spend) || 0);

  return {
    spend: round(money),
    revenue: round(revenue),
    net: round(revenue - money),
    roas: money > 0 ? round(revenue / money) : null,
    costPerDelivered: delivered > 0 ? round(money / delivered) : null,
    costPerOrder: brought > 0 ? round(money / brought) : null,
  };
}

function round(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * The link to paste into the ad.
 *
 * Built from the page the campaign points at, or the store's shopfront when
 * it points at no page in particular. The code rides in `c` — short because
 * it is typed into an ads manager by hand often enough to matter, and its
 * own parameter rather than `utm_campaign` because utm values get rewritten
 * by every tool that touches them.
 */
export function campaignLink(origin: string, code: string, target: { kind: 'lp'; slug: string } | { kind: 'store'; slug: string }): string {
  const path = target.kind === 'lp' ? `/lp/${target.slug}` : `/s/${target.slug}`;
  return `${origin.replace(/\/+$/, '')}${path}?c=${encodeURIComponent(code)}`;
}

/**
 * Does this campaign count an order made on this date?
 *
 * Attribution is by the CODE the visitor arrived with, not by the window —
 * an order carries the campaign it was resolved to and keeps it. The window
 * is for reading the report, and this says whether a campaign was even
 * running then, so a row showing zero can say WHY.
 */
export function wasRunning(c: { startDate: Date; endDate: Date | null }, start?: Date, end?: Date): boolean {
  if (end && c.startDate.getTime() > end.getTime()) return false;
  if (start && c.endDate && c.endDate.getTime() < start.getTime()) return false;
  return true;
}
