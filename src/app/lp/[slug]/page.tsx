import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LandingPageView } from '@/components/landing/LandingPageView';
import { landingPageMetadata } from '@/lib/public-metadata';

/**
 * A public landing page at /lp/<slug>.
 *
 * The rendering itself lives in LandingPageView, because a Single Product
 * store's front is the same page reached through the store's address — one
 * renderer, so the two can never drift apart.
 */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; c?: string }>;
}

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { slug } = await params;
  return /^[a-z0-9-]{2,60}$/.test(slug) ? landingPageMetadata(slug) : {};
}

export default async function PublicLandingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p: previewToken, c: campaign } = await searchParams;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();
  return <LandingPageView target={{ slug, previewToken, campaign }} />;
}
