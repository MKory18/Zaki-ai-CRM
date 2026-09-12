import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readStoredFile, isSafeStorageKey } from '@/lib/storage';
import { verifyPreviewToken } from '@/lib/landing-pages';

interface Ctx {
  params: Promise<{ slug: string; file: string }>;
}

const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i;

/**
 * GET /api/public/landing-pages/[slug]/media/[file]
 *
 * Public (NO auth): serves landing-page images inside the sandboxed raw-HTML
 * iframe. The iframe runs on an opaque origin where authentication cookies
 * are never sent (SameSite), so /api/media cannot be used publicly.
 *
 * Access rules:
 *  - file name must be an exact uuid.ext (no traversal, no subpaths)
 *  - the image must belong to the landing page resolved by slug
 *  - the page must be PUBLISHED, or the request carries a valid preview token
 *  - tenant isolation: the storage key is built server-side from the DB row —
 *    the URL never encodes the companyId, so other tenants' assets are
 *    unreachable (unknown slug/file → 404 with no distinction)
 */
export async function GET(req: Request, ctx: Ctx) {
  const { slug, file } = await ctx.params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug) || !FILE_RE.test(file)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const previewToken = searchParams.get('p');
  let previewLpId: string | null = null;
  if (previewToken) {
    const tok = await verifyPreviewToken(previewToken);
    if (tok) previewLpId = tok.lpId;
  }

  const lp = await db.landingPage.findFirst({
    where: previewLpId ? { id: previewLpId, slug } : { slug, isPublished: true },
    select: { id: true, companyId: true },
  });
  if (!lp) return new NextResponse('Not found', { status: 404 });

  // Server-built storage key — mirrors saveProductImage's layout
  const storageKey = `companies/${lp.companyId}/products/${lp.id}/${file}`;
  if (!isSafeStorageKey(storageKey)) return new NextResponse('Not found', { status: 404 });

  const stored = await readStoredFile(storageKey);
  if (!stored) return new NextResponse('Not found', { status: 404 });

  const webStream = new ReadableStream({
    start(controller) {
      stored.stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      stored.stream.on('end', () => controller.close());
      stored.stream.on('error', () => controller.error());
    },
  });

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': stored.mimeType,
      'Content-Length': String(stored.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Robots-Tag': 'noindex',
    },
  });
}
