import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStorefront } from '@/lib/storefront';
import { StorefrontShell } from '@/components/storefront/StorefrontShell';
import { RatingForm } from '@/components/storefront/RatingForm';
import { publicTitle, storeIcons } from '@/lib/public-metadata';
import { REVIEW_REFUSAL, ratingTarget } from '@/lib/product-reviews';

/**
 * «كيف كان المنتج؟» — THE PAGE BEHIND THE RATING LINK.
 *
 * No login, no account, like the rest of /s. What stands in for one is the
 * link itself: an HMAC over the order's id (src/lib/review-link.ts), which
 * only this installation can compute, offered on the tracking page to
 * somebody who already proved the phone and the reference — and copyable by
 * the owner to send over WhatsApp.
 *
 * THE LINK IS CHECKED ON THE SERVER, HERE, BEFORE ANYTHING IS DRAWN. A page
 * that renders the form and lets the POST do the refusing is a page that
 * asks a customer to type an opinion and then throws it away. So the three
 * gates run first — signature, delivered, not already rated — and the
 * refusal is the page.
 *
 * WHAT IT REVEALS: the product's name. Not the customer's name, not the
 * phone, not the address, not the total. A leaked link costs one opinion
 * about one article.
 */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ store: string; token: string }>;
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
    title: publicTitle('تقييم الطلب', store.name),
    icons: storeIcons(store),
    // A signed link has nothing for a search engine and one thing for one
    // customer. Keeping it out of an index also keeps a crawler off a form
    // that writes.
    robots: { index: false, follow: false },
  };
}

export default async function RatingPage({ params }: Props) {
  const { store: storeSlug, token } = await params;
  const store = await load(storeSlug);
  if (!store) notFound();

  const checked = await ratingTarget(token, { id: store.id, companyId: store.companyId });

  return (
    <StorefrontShell store={store} back={{ href: `/s/${store.slug}`, label: store.name }}>
      <article className="sf-page">
        <h1>تقييم الطلب</h1>
        {!checked.ok ? (
          <p>{REVIEW_REFUSAL[checked.refusal]}</p>
        ) : (
          <>
            <p>
              كيف كان <strong>{checked.target.productName}</strong>؟ رأيك يساعد غيرك.
            </p>
            <RatingForm slug={store.slug} token={token} />
          </>
        )}
      </article>
    </StorefrontShell>
  );
}
