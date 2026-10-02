import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStorefront } from '@/lib/storefront';
import { StorefrontShell } from '@/components/storefront/StorefrontShell';
import { TrackForm } from '@/components/storefront/TrackForm';
import { publicTitle, storeIcons } from '@/lib/public-metadata';

/**
 * WHERE IS MY ORDER — the page for it.
 *
 * No login, no account, no session, like the rest of /s. The phone and the
 * reference go to `/api/public/stores/[store]/track` in a POST body, and
 * what comes back is a status and nothing else.
 *
 * NOTHING IS READ HERE. The page renders the empty form on the server and
 * asks nothing about anybody — so opening it, or linking somebody to it,
 * reveals nothing. The one question it can answer needs two halves, and
 * both are typed by whoever is standing in front of it.
 */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ store: string }>;
}

const SLUG = /^[a-z0-9-]{2,60}$/;

async function load(storeSlug: string) {
  if (!SLUG.test(storeSlug)) return null;
  return getStorefront(storeSlug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store: storeSlug } = await params;
  const store = await load(storeSlug);
  if (!store) return { title: 'غير متاح' };
  return {
    title: publicTitle('تتبّع الطلب', store.name),
    icons: storeIcons(store),
    // A tracking page has nothing for a search engine and one thing for a
    // customer: their own order. Keeping it out of an index also keeps a
    // crawler off a form that is rate-limited per address.
    robots: { index: false, follow: false },
  };
}

export default async function TrackPage({ params }: Props) {
  const { store: storeSlug } = await params;
  const store = await load(storeSlug);
  if (!store) notFound();

  return (
    <StorefrontShell store={store} back={{ href: `/s/${store.slug}`, label: store.name }}>
      <article className="sf-page">
        <h1>تتبّع الطلب</h1>
        <p>أدخل رقم هاتفك ورقم الطلب الذي وصلك بعد الشراء.</p>
        <TrackForm slug={store.slug} />
      </article>
    </StorefrontShell>
  );
}
