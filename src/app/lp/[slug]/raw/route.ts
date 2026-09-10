import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildPublicHtml, clampStoredHtml, RAW_HTML_CSP, verifyPreviewToken } from '@/lib/landing-pages';

interface Ctx {
  params: Promise<{ slug: string }>;
}

const DEFAULT_HTML = (name: string) => `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name.replace(/[<>&"]/g, '')}</title>
<style>body{font-family:system-ui,sans-serif;background:#f7f7f8;color:#1f2937;max-width:520px;margin:40px auto;padding:0 16px}
h1{font-size:24px} .box{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px}
input,textarea{width:100%;box-sizing:border-box;margin:4px 0 12px;padding:10px;border:1px solid #d1d5db;border-radius:8px;font:inherit}
button{background:#b8256e;color:#fff;border:0;border-radius:8px;padding:12px 20px;font:inherit;cursor:pointer;width:100%}</style>
</head><body><h1>${name.replace(/[<>&"]/g, '')}</h1><div class="box" id="zaki-order-form" data-zaki-order-form></div>
</body></html>`;

/**
 * Serves the uploaded landing page HTML.
 * This response is ONLY ever rendered inside a sandboxed iframe without
 * allow-same-origin (see /lp/[slug]/page.tsx) — an opaque origin that cannot
 * read the CRM session cookie, localStorage, JWT or CSRF tokens, and cannot
 * touch admin APIs with credentials. CSP is set as defense in depth.
 *
 * `?p=<signed token>` allows the dashboard preview of an UNPUBLISHED page
 * (token is LP-scoped, 10-minute TTL). Public visitors only ever get
 * published pages.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return new NextResponse('Not found', { status: 404 });

  const { searchParams } = new URL(req.url);
  const previewToken = searchParams.get('p');

  let lp = null;
  if (previewToken) {
    const tok = await verifyPreviewToken(previewToken);
    if (tok) {
      lp = await db.landingPage.findFirst({
        where: { id: tok.lpId, slug },
        select: { id: true, name: true, slug: true, htmlContent: true },
      });
    }
    // Invalid/expired token → fall through to the published-only path
  }
  if (!lp) {
    lp = await db.landingPage.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true, htmlContent: true },
    });
  }
  if (!lp) return new NextResponse('Not found', { status: 404 });

  const stored = clampStoredHtml(lp.htmlContent);
  const html = buildPublicHtml(stored || DEFAULT_HTML(lp.name), lp.slug);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': RAW_HTML_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    },
  });
}