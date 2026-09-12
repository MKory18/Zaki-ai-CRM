import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clampStoredHtml, RAW_HTML_CSP, verifyPreviewToken } from '@/lib/landing-pages';
import {
  sanitizeLandingCss,
  sanitizeLandingHtml,
  parseLandingSettings,
  applyLandingVariables,
} from '@/lib/landing-html-sanitize';
import { resolveDynamicPlaceholders } from '@/lib/landing-dynamic';

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
        select: {
          id: true, name: true, slug: true, htmlContent: true, cssContent: true, pageSettings: true,
          company: { select: { currency: true } },
          product: { select: { name: true, nameEn: true, image: true, description: true, basePrice: true } },
          offers: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }], select: { id: true, name: true, quantity: true, freeQuantity: true, price: true, isDefault: true } },
          recommendations: { where: { isActive: true, product: { status: 'ACTIVE' } }, orderBy: { sortOrder: 'asc' }, select: { id: true, product: { select: { name: true, basePrice: true, image: true } } } },
        },
      });
    }
    // Invalid/expired token → fall through to the published-only path
  }
  if (!lp) {
    lp = await db.landingPage.findFirst({
      where: { slug, isPublished: true },
      select: {
        id: true, name: true, slug: true, htmlContent: true, cssContent: true, pageSettings: true,
        company: { select: { currency: true } },
        product: { select: { name: true, nameEn: true, image: true, description: true, basePrice: true } },
        offers: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }], select: { id: true, name: true, quantity: true, freeQuantity: true, price: true, isDefault: true } },
        recommendations: { where: { isActive: true, product: { status: 'ACTIVE' } }, orderBy: { sortOrder: 'asc' }, select: { id: true, product: { select: { name: true, basePrice: true, image: true } } } },
      },
    });
  }
  if (!lp) return new NextResponse('Not found', { status: 404 });

  // Serve the uploaded (untrusted) HTML — re-sanitized at serve time (defense
  // in depth; already sanitized at save). NO form injection: the Trusted
  // Native Order Form is rendered by /lp/[slug] OUTSIDE this iframe.
  const stored = clampStoredHtml(lp.htmlContent);
  const settings = parseLandingSettings(lp.pageSettings);

  // ── Page settings (base styles) — injected BEFORE user CSS so the user's
  //    custom CSS always wins cascade battles. ──
  const baseStyles = settings
    ? `<style id="zaki-base-style">body{${[
        settings.background ? `background:${settings.background}` : '',
        settings.direction ? `direction:${settings.direction}` : '',
        settings.fontFamily ? `font-family:${settings.fontFamily}` : '',
      ].filter(Boolean).join(';')}}
${settings.width === 'contained' && settings.maxWidth ? `.zaki-page-wrap{max-width:${settings.maxWidth}px;margin:0 auto;padding:0 16px}` : ''}</style>`
    : '';

  // ── Custom CSS — sanitized, injected last inside <head> (highest priority) ──
  const customCss = lp.cssContent?.trim() ? `<style id="zaki-custom-style">${sanitizeLandingCss(lp.cssContent)}</style>` : '';

  // ── Whitelisted dynamic variables — values from the DB only ──
  let html = stored || DEFAULT_HTML(lp.name, lp.product?.name);
  html = sanitizeLandingHtml(html);
  if (lp.product) {
    html = applyLandingVariables(html, {
      name: lp.product.name,
      nameEn: lp.product.nameEn,
      image: lp.product.image,
      description: lp.product.description,
      price: lp.product.basePrice,
    });
  }

  // ── Phase 2: data-zaki-* placeholders → server-rendered DB-backed blocks ──
  // Values (product/offers/recommendations) come exclusively from the DB —
  // the custom HTML can only place markers, never set prices/ids. The
  // interaction script is hard-coded server output (see landing-dynamic.ts).
  const currency = lp.company?.currency || 'USD';
  html = resolveDynamicPlaceholders({
    html,
    slug: lp.slug,
    product: lp.product
      ? { name: lp.product.name, nameEn: lp.product.nameEn, image: lp.product.image, description: lp.product.description, price: lp.product.basePrice }
      : null,
    offers: (lp.offers || []).map((o) => ({ id: o.id, name: o.name, quantity: o.quantity, freeQuantity: o.freeQuantity, price: o.price, isDefault: o.isDefault })),
    recommendations: (lp.recommendations || []).map((r) => ({ id: r.id, name: r.product?.name || '', price: r.product?.basePrice ?? 0, image: r.product?.image || null })),
    currency,
  });

  // Inject base styles + custom CSS right before </head> (or prepend when no head exists)
  const injection = `${baseStyles}${customCss}`;
  if (injection) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${injection}</head>`);
    } else {
      html = injection + html;
    }
  }

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