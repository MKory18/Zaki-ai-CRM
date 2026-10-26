/**
 * The campaigns screen's filters — «فلاتر بطاقات». Pure, so each one is testable and the screen only chooses.
 *
 * Every filter COMPARES a figure the server already computed (`money`, `funnel`, `duplicateOf`); none adds one up.
 */

export const QUICK_FILTERS = [
  { key: 'winning', label: 'رابحة' },
  { key: 'losing', label: 'خاسرة' },
  { key: 'spentNoOrders', label: 'صرفت بلا طلبات' },
  { key: 'noProduct', label: 'بلا منتج' },
  { key: 'noOrders', label: 'بلا طلبات' },
  { key: 'duplicates', label: 'مكررة' },
] as const;
export type QuickFilter = '' | (typeof QUICK_FILTERS)[number]['key'];

export interface CampaignFilter {
  q: string;
  status: string;
  platform: string;
  account: string;
  product: string;
  quick: QuickFilter;
}

export const NO_FILTER: CampaignFilter = { q: '', status: '', platform: '', account: '', product: '', quick: '' };

export function isFiltering(f: CampaignFilter): boolean {
  return Object.values(f).some((v) => v !== '');
}

export interface FilterableCampaign {
  name: string;
  code: string;
  status: string;
  platform: string;
  adAccount: { id: string } | null;
  product: { id: string } | null;
  duplicateOf?: string | null;
  money: { spend: number; net: number };
  funnel: { brought: number };
}

export function filterCampaigns<T extends FilterableCampaign>(list: T[], f: CampaignFilter): T[] {
  const q = f.q.trim().toLocaleLowerCase('ar');
  return list.filter((c) => {
    if (q && !c.name.toLocaleLowerCase('ar').includes(q) && !c.code.toLocaleLowerCase().includes(q)) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.platform && c.platform !== f.platform) return false;
    if (f.account && (f.account === 'none' ? c.adAccount !== null : c.adAccount?.id !== f.account)) return false;
    if (f.product && (f.product === 'none' ? c.product !== null : c.product?.id !== f.product)) return false;
    switch (f.quick) {
      case 'winning': return c.money.net > 0;
      case 'losing': return c.money.net < 0;
      case 'spentNoOrders': return c.money.spend > 0 && c.funnel.brought === 0;
      case 'noProduct': return c.product === null;
      case 'noOrders': return c.funnel.brought === 0;
      case 'duplicates': return !!c.duplicateOf;
      default: return true;
    }
  });
}
