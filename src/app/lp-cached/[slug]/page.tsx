import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LandingPageView } from '@/components/landing/LandingPageView';
import { landingPageMetadata } from '@/lib/public-metadata';

/**
 * A PUBLIC LANDING PAGE, FROM THE CACHE.
 *
 * Reached only through the proxy's rewrite of `/lp/<slug>` when the owner's switch is on (`landing-cache-path.ts`);
 * asked for by its own name it is a 404. Built once and served to every visitor until it is refreshed — at most a
 * minute later on its own, and at once when the seller publishes the page or changes an offer, a price or the
 * product (`refreshLandingPages`). Nothing in it depends on one request: the campaign code and the visit are the
 * browser's to report (`BrowserVisit`), which is why the server does not count here.
 */
export const revalidate = 60;
export const dynamicParams = true;

/**
 * No page is built ahead, at deploy: each is built the first time a visitor asks for it, then kept and refreshed. An
 * empty list is what turns that on — without it the route is rendered on every request and caches nothing
 * (`generate-static-params.md`, «all paths at runtime»).
 */
export async function generateStaticParams() {
  return [];
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return /^[a-z0-9-]{2,60}$/.test(slug) ? landingPageMetadata(slug) : {};
}

export default async function CachedLandingPage({ params }: Props) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();
  return <LandingPageView target={{ slug, cached: true }} />;
}
