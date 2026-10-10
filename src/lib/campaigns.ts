import { z } from 'zod';
import type { AttributionRow } from './attribution-performance';
import { publicPath } from './public-address';
import { money as moneyInput } from './numeric-input';
import { omittedMeansOmitted } from './zod-patch';

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
  .regex(/^[A-Z0-9]{3,16}$/, 'الرمز حروف إنجليزية وأرقام فقط، من 3 إلى 16 خانة');

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2, 'اسم الحملة مطلوب').max(80),
  platform: z.enum(['META', 'TIKTOK', 'SNAPCHAT', 'GOOGLE', 'OTHER']).default('META'),
  code: campaignCodeSchema.optional(),
  landingPageId: z.string().uuid().nullable().optional(),
  /**
   * WHICH PRODUCT THIS CAMPAIGN ADVERTISES — «اقدر احدد كل حملة لاي منتج».
   *
   * Offered, and usually unnecessary: 44 of 44 landing pages name a
   * product, so a campaign pointing at a page already knows. This is for a
   * campaign with NO page — an ad to a storefront product, or to WhatsApp.
   *
   * Nullable as well as optional, because clearing it is a real edit and a
   * schema that only took a uuid could set one and never unset it.
   */
  productId: z.string().uuid().nullable().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']).default('ACTIVE'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  /**
   * WHAT LEFT FOR META, TYPED BY THE PERSON WHO PAID IT.
   *
   * A campaign that has not run yet has spent nothing; that is a real state
   * and not a missing value, so the `.default(0)` stays.
   *
   * But `z.coerce.number()` is `Number(value)`, and `Number(null)` is
   * **0** — while `.default()` fires only on `undefined`. So a body
   * carrying `spend: null` did not get the default and did not get refused:
   * it stored a zero, and the audit entry recorded the zero as the edit the
   * seller asked for. `dad59c9` closed the other half of this — `.partial()`
   * kept the `.default()`, so a bare `{ name }` arrived as a whole row and a
   * rename wiped a 1250 spend to 0. That fix made an OMITTED spend absent;
   * this one makes an EXPLICIT `null` a 400 instead of a silent zero. The
   * two are the same column losing real money by two different routes, and
   * both routes had to be closed for the column to be safe.
   *
   * `money()` from `numeric-input` also refuses `'0x10'` (which `Number()`
   * reads as 16), `''` and `[]` (both 0), and `'1e400'` (Infinity). The
   * ceiling is unchanged at 100_000_000 — `Campaign.spend` is
   * `Decimal(14, 2)`, so this is well inside the column, and it is the same
   * figure `production/route.ts` declares for money a person types.
   */
  spend: moneyInput(100_000_000).default(0),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;

/**
 * EDITING A CAMPAIGN MAY ONLY WRITE WHAT THE SELLER TYPED.
 *
 * `PATCH /api/growth/campaigns/:id` read
 * `campaignInputSchema.omit({ code: true }).partial()` and merged on
 * `!== undefined`. `.partial()` in zod 4 keeps every `.default()`, so a
 * rename arrived as a whole row. MEASURED:
 *
 *     campaignInputSchema.omit({ code: true }).partial()
 *       .safeParse({ name: 'new name' })
 *       → { name: 'new name', platform: 'META', status: 'ACTIVE', spend: 0 }
 *
 * So renaming a campaign reset its platform, re-activated an ENDED or
 * PAUSED one, and wiped its recorded ad spend to 0 — and the audit entry
 * recorded the loss as though it were the edit the seller asked for,
 * because `spend` is exactly what that entry carries. Money that left for
 * Meta, typed in by the person who paid it, erased by a rename.
 *
 * The link branch a few lines above the merge says unlinking «does not
 * erase what was pulled, which was real money». The branch below it erased
 * precisely that.
 *
 * `code` stays out: it is stamped on every order the campaign brought, so
 * a campaign needing a new code is a new campaign.
 */
export const campaignPatchSchema = z.object(
  omittedMeansOmitted(campaignInputSchema.omit({ code: true }).shape)
);

export type CampaignPatch = z.infer<typeof campaignPatchSchema>;

/**
 * WHICH PRODUCT A CAMPAIGN ADVERTISES — ONE PLACE, ONE ANSWER.
 *
 * The question has two possible sources and therefore needs exactly one
 * function, or it becomes a figure that disagrees with itself depending on
 * which screen asked:
 *
 *   1. the landing page the ad points at, which NAMES a product
 *      (measured: 44 of 44 pages do)
 *   2. the campaign's own `productId`, for a campaign with no page at all
 *
 * The PAGE WINS when there is one, and that is not arbitrary: the page is
 * what the click actually lands on, so it is what the visitor is being
 * sold. A column saying otherwise would be a note about intent, and intent
 * does not take an order.
 *
 * `null` means «not stated», which is a real answer for an ad pointing at a
 * shop front rather than at anything in particular — not a missing value to
 * be filled in with a guess.
 */
export function campaignProductId(campaign: {
  productId?: string | null;
  landingPage?: { productId: string | null } | null;
}): string | null {
  return campaign.landingPage?.productId ?? campaign.productId ?? null;
}

/**
 * AND A CONTRADICTION IS REFUSED, NOT RESOLVED.
 *
 * A campaign whose page sells product A while its own column names B is
 * somebody having made a mistake — almost certainly by changing the page
 * after setting the product. `campaignProductId` would quietly answer A and
 * the screen would show A beside a dropdown reading B, which teaches a
 * person that the screen lies.
 *
 * So the door refuses it and says which two things disagree. Returns the
 * Arabic sentence to show, or null when there is nothing wrong.
 */
export function productConflict(
  chosen: string | null | undefined,
  pageProductId: string | null | undefined,
  names: { chosen?: string | null; page?: string | null } = {}
): string | null {
  if (!chosen || !pageProductId || chosen === pageProductId) return null;
  const a = names.page ?? 'منتجاً آخر';
  const b = names.chosen ?? 'منتجاً مختلفاً';
  return `صفحة الهبوط المرتبطة تبيع ${a}، والمنتج المختار ${b} — صحِّح أحدهما`;
}

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
  // Where a selling page answers is decided in ONE place (public-address.ts);
  // this adds the campaign code and nothing else. A second copy of the
  // /lp-or-/s decision is a second answer waiting to disagree.
  return `${origin.replace(/\/+$/, '')}${publicPath(target)}?c=${encodeURIComponent(code)}`;
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
