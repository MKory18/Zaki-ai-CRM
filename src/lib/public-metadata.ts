import type { Metadata } from 'next';
import { db } from './db';

/**
 * WHAT A PUBLIC PAGE IS CALLED, AND ITS ICON — the store's, never ours.
 *
 * Every landing page and storefront carried the dashboard's title ("Zaki AI
 * OMS — نظام المبيعات…") and the framework's default icon in the browser
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

/**
 * WHERE THIS SHOP LIVES, ABSOLUTELY.
 *
 * A crawler and a chat app do not have our origin, so every URL in the
 * markup and in a share preview has to carry it. Configured rather than
 * taken from a request header: a header can be forged, and an Open Graph
 * image pointing at somebody else's host is a shop advertising on their
 * behalf.
 *
 * Falls back to a relative world rather than to a guess — a wrong
 * absolute URL is worse than none, because a chat app caches it.
 */
export function publicOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  return configured.trim().replace(/\/+$/, '');
}

/**
 * THE SHARE PREVIEW — a picture, a name and a price.
 *
 * «المنتجات بتنتشر بواتساب، والرابط بلا معاينة ما حدا بيضغطه». A bare
 * link in a family group is a link nobody taps, and this is the whole
 * difference between a product that spreads and one that does not.
 *
 * The price goes in the DESCRIPTION rather than only in a tag, because
 * most chat apps render the description and ignore the rest — and the
 * price is the thing somebody forwarding it wants shown.
 */
export function sharePreview(args: {
  title: string;
  description?: string | null;
  image?: string | null;
  path: string;
  type?: 'website' | 'article';
}): Metadata {
  const origin = publicOrigin();
  const url = origin ? `${origin}${args.path}` : args.path;
  const image = args.image
    ? (/^https?:\/\//.test(args.image) ? args.image : origin ? `${origin}${args.image}` : null)
    : null;

  return {
    // The one address this page should be indexed under. Every storefront
    // page can be reached with a query string on it; without this each of
    // those is a separate page competing with the others.
    alternates: { canonical: url },
    openGraph: {
      title: args.title,
      ...(args.description ? { description: args.description } : {}),
      url,
      type: args.type ?? 'website',
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: args.title,
      ...(args.description ? { description: args.description } : {}),
      ...(image ? { images: [image] } : {}),
    },
    ...(args.description ? { description: args.description } : {}),
  };
}
