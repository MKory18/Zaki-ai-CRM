import { notFound } from 'next/navigation';
import { db } from '@/lib/db';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Public landing page — NO login, NO getCurrentUser(), no session cookies.
 * Only PUBLISHED pages are served; unpublished/missing → 404.
 *
 * Isolation: the uploaded HTML is rendered inside a sandboxed iframe WITHOUT
 * allow-same-origin. The iframe therefore gets an opaque origin and the
 * browser never sends the CRM session cookie (salesflow_session), and the
 * embedded content cannot read CRM localStorage/JWT/CSRF tokens or call
 * admin APIs with credentials.
 *
 * Analytics: one view = one successful public render. No cookies, no IPs,
 * no personal data is stored (viewsCount only).
 */
export const dynamic = 'force-dynamic';

export default async function PublicLandingPage({ params }: Props) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();

  const lp = await db.landingPage.findFirst({
    where: { slug, isPublished: true },
    select: { id: true, name: true, slug: true, isPublished: true },
  });
  if (!lp || !lp.isPublished) notFound();

  // Fire-and-forget view counter (non-fatal)
  db.landingPage
    .update({ where: { id: lp.id }, data: { viewsCount: { increment: 1 } } })
    .catch(() => {});

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f8' }}>
      {/* Sandboxed opaque-origin iframe: scripts+forms allowed, but NO
          same-origin access → no CRM cookies/localStorage/APIs are reachable */}
      <iframe
        src={`/lp/${encodeURIComponent(lp.slug)}/raw`}
        title={lp.name}
        sandbox="allow-scripts allow-forms allow-popups"
        style={{
          width: '100%',
          minHeight: '100vh',
          height: '100vh',
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}