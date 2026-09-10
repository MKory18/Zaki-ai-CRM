import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clampStoredHtml, RAW_HTML_CSP, verifyPreviewToken } from '@/lib/landing-pages';

interface Ctx {
  params: Promise<{ slug: string }>;
}

const DEFAULT_HTML = (name: string, productName?: string | null) => `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name.replace(/[<>&"]/g, '')}</title>
<style>*{margin:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(160deg,#121926 0%,#1a2232 60%,#b8256e22 100%);color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.hero{text-align:center;max-width:480px}
.tag{display:inline-block;background:#b8256e;color:#fff;font-size:12px;font-weight:700;letter-spacing:.1em;padding:6px 14px;border-radius:99px;text-transform:uppercase}
h1{font-size:32px;line-height:1.3;margin:18px 0 10px}
p.sub{color:#9aa4b2;font-size:15px;line-height:1.7}
.scroll{margin-top:28px;display:inline-flex;align-items:center;gap:8px;color:#fff;background:#ffffff14;border:1px solid #ffffff2e;padding:12px 22px;border-radius:99px;font-size:14px;font-weight:600;text-decoration:none}
</style></head><body>
<div class="hero">
<span class="tag">عرض خاص</span>
<h1>${name.replace(/[<>&"]/g, '')}</h1>
<p class="sub">اطلب الآن واستفد من العرض — الدفع عند الاستلام وتوصيل لجميع المناطق.</p>
<a class="scroll" href="#zaki-order-form">اطلب الآن ↓</a>
</div>
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
        select: { id: true, name: true, slug: true, htmlContent: true, product: { select: { name: true } } },
      });
    }
    // Invalid/expired token → fall through to the published-only path
  }
  if (!lp) {
    lp = await db.landingPage.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, name: true, slug: true, htmlContent: true, product: { select: { name: true } } },
    });
  }
  if (!lp) return new NextResponse('Not found', { status: 404 });

  // Serve the uploaded (untrusted) HTML as-is — NO form injection. The
  // Trusted Native Order Form is rendered by /lp/[slug] OUTSIDE this iframe.
  const stored = clampStoredHtml(lp.htmlContent);
  const html = stored || DEFAULT_HTML(lp.name, lp.product?.name);

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