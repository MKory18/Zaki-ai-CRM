import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getStorefront } from '@/lib/storefront';
import { StorefrontShell } from '@/components/storefront/StorefrontShell';
import { publicTitle, storeIcons } from '@/lib/public-metadata';
import { paragraphsOf } from '@/lib/store-pages';

/**
 * A shop's own page — who we are, the terms, the privacy policy.
 *
 * No login, no session, no cookies, like the rest of /s. Only a PUBLISHED
 * page of an OPEN shop is served: a draft policy is the seller's own
 * skeleton text with their name in it, and serving it would publish words
 * they have not read.
 *
 * The body is rendered as TEXT — a paragraph per blank line — and never as
 * markup, so a page cannot carry a script into the shop. A seller who wants
 * a designed page builds a landing page; this is where the words live.
 */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ store: string; slug: string }>;
}

const SLUG = /^[a-z0-9-]{2,60}$/;

async function load(storeSlug: string, pageSlug: string) {
  if (!SLUG.test(storeSlug) || !SLUG.test(pageSlug)) return null;
  const store = await getStorefront(storeSlug);
  if (!store) return null;
  const page = await db.storePage.findFirst({
    where: { storeId: store.id, slug: pageSlug, isPublished: true },
    select: { title: true, body: true },
  });
  return page ? { store, page } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store: storeSlug, slug } = await params;
  const found = await load(storeSlug, slug);
  if (!found) return { title: 'غير متاح' };
  return { title: publicTitle(found.page.title, found.store.name), icons: storeIcons(found.store) };
}

export default async function StoreContentPage({ params }: Props) {
  const { store: storeSlug, slug } = await params;
  const found = await load(storeSlug, slug);
  if (!found) notFound();
  const { store, page } = found;

  return (
    <StorefrontShell store={store} back={{ href: `/s/${store.slug}`, label: store.name }}>
      <article className="sf-page">
        <h1>{page.title}</h1>
        {paragraphsOf(page.body).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </article>
    </StorefrontShell>
  );
}
