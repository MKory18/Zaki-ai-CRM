import type { Metadata } from 'next';
import { db } from './db';

/**
 * WHAT A PUBLIC PAGE IS CALLED, AND ITS ICON — the store's, never ours.
 *
 * Every landing page and storefront carried the dashboard's title ("Zaki AI
 * Store — نظام المبيعات…") and the framework's default icon in the browser
 * tab and in every shared link's preview: a seller's customers saw the
 * seller's software, not the seller. A page is now named by what it sells
 * and the store selling it, and iconed by the store's favicon — its logo
 * when it has none, and no icon rather than someone else's.
 */

export interface StoreIdentity {
  name: string;
  favicon?: string | null;
  logo?: string | null;
}

/**
 * "What — Store", skipping whatever is missing — and any part another part
 * already opens with (a tagline that starts with the store's own name).
 *
 * A part is dropped only when another OPENS with it and then breaks into a
 * tagline (a dash, a pipe, a colon) — not for merely containing it. A product
 * whose name sits inside the store's («صحة» sold by «متجر صحة», «كريم» by
 * «كريم الليل») is the page's whole subject, and dropping it left the tab and
 * every shared link naming the store alone.
 */
const TAGLINE_AFTER = /^\s*[—–\-|:،]/;

function saidBy(part: string, other: string): boolean {
  if (other.length <= part.length || !other.startsWith(part)) return false;
  return TAGLINE_AFTER.test(other.slice(part.length));
}

export function publicTitle(...parts: (string | null | undefined)[]): string {
  const kept = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return kept.filter((p, i) => !kept.some((q, j) => j !== i && saidBy(p, q))).join(' — ');
}

export function storeIcons(store: StoreIdentity | null | undefined): Metadata['icons'] {
  const icon = store?.favicon || store?.logo;
  return icon ? { icon } : undefined;
}

/** A landing page's name and icon — the page /lp/<slug> renders (the oldest published). */
export async function landingPageMetadata(slug: string): Promise<Metadata> {
  const lp = await db.landingPage.findFirst({
    where: { slug, isPublished: true },
    orderBy: { createdAt: 'asc' },
    select: {
      name: true,
      product: { select: { name: true } },
      store: { select: { name: true, favicon: true, logo: true } },
    },
  });
  if (!lp) return { title: 'غير متاح' };
  return {
    title: publicTitle(lp.product?.name || lp.name, lp.store?.name),
    icons: storeIcons(lp.store),
  };
}
