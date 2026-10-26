/**
 * WHAT THE CAMPAIGNS SCREEN SAYS ABOUT ITSELF — the smart cards and the duplicates.
 *
 * Worked out on the server from figures the server already computed (`campaignResult`), so the screen draws an
 * answer and never adds up money of its own. Pure, so every branch is reachable from a test.
 */

export interface InsightCampaign {
  id: string;
  name: string;
  externalId: string | null;
  hasProduct: boolean;
  money: { spend: number; net: number; roas: number | null };
  funnel: { brought: number };
}

/** One name, however it was typed: spaces collapsed, case folded. */
export function sameName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar');
}

/**
 * «حذف المكرر» — a campaign typed in by hand (no platform id) whose name is the name of one the platform sent.
 * Measured: 143 of 146 hand-typed campaigns on «كيوان 3» had a twin pulled from Meta, the old one holding the orders
 * and the new one the spend. Returns hand-typed id → the platform twin's id. A name the platform has twice is
 * ambiguous and matched to neither — guessing there would move orders onto the wrong campaign.
 */
export function duplicatesOf(list: Pick<InsightCampaign, 'id' | 'name' | 'externalId'>[]): Map<string, string> {
  const linked = new Map<string, string | null>();
  for (const c of list) {
    if (!c.externalId) continue;
    const key = sameName(c.name);
    linked.set(key, linked.has(key) ? null : c.id);
  }
  const out = new Map<string, string>();
  for (const c of list) {
    if (c.externalId) continue;
    const twin = linked.get(sameName(c.name));
    if (twin) out.set(c.id, twin);
  }
  return out;
}

export interface CampaignInsights {
  best: { id: string; name: string; roas: number } | null;
  worst: { id: string; name: string; net: number } | null;
  spentNoOrders: number;
  noProduct: number;
  duplicates: number;
}

export function campaignInsights(list: InsightCampaign[], duplicates: Map<string, string>): CampaignInsights {
  const spent = list.filter((c) => c.money.spend > 0);
  // A return of 0× is not a «best» of anything: with nothing earned, the card says so instead of crowning a loser.
  const withRoas = spent.filter((c) => c.money.roas !== null && c.money.roas > 0);
  const best = withRoas.reduce<InsightCampaign | null>((b, c) => (!b || (c.money.roas as number) > (b.money.roas as number) ? c : b), null);
  const worst = spent.reduce<InsightCampaign | null>((w, c) => (!w || c.money.net < w.money.net ? c : w), null);
  return {
    best: best ? { id: best.id, name: best.name, roas: best.money.roas as number } : null,
    worst: worst && worst.money.net < 0 ? { id: worst.id, name: worst.name, net: worst.money.net } : null,
    spentNoOrders: spent.filter((c) => c.funnel.brought === 0).length,
    noProduct: list.filter((c) => !c.hasProduct).length,
    duplicates: duplicates.size,
  };
}
