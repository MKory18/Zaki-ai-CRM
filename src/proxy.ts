import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { slugForHost } from '@/lib/landing-domain';

let cachedJwtSecret: Uint8Array | null = null;
function getJwtSecret(): Uint8Array {
  if (!cachedJwtSecret) {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('SECURITY: JWT_SECRET environment variable is required in production.');
    }
    // Development-only fallback, never used in production.
    cachedJwtSecret = new TextEncoder().encode(secret || 'development_only_insecure_jwt_secret_key_0000');
  }
  return cachedJwtSecret;
}

const COOKIE_NAME = 'salesflow_session';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/lp'];

/**
 * Edge pass: session presence and account state only.
 *
 * Route permissions are NOT decided here. Every screen is guarded on the
 * server by src/lib/page-guard.ts against the route registry (404 outside
 * the contract, 403 without the permission), and every API re-checks the
 * same permission. The edge never sees the permission engine's DB state.
 */

function redirectTo(req: Request, path: string) {
  const url = new URL(req.url);
  url.pathname = path;
  url.search = '';
  return NextResponse.redirect(url);
}

/**
 * Origin validation for mutating API requests (CSRF defense-in-depth).
 *
 * Trade-off (documented): browsers attach an Origin header to cross-site
 * mutations and to same-origin POST/PUT/PATCH/DELETE fetches, so a forged
 * cross-site request is always rejected. Requests WITHOUT an Origin header
 * (server-to-server clients, curl) pass through — they cannot be produced
 * by a victim's browser on a cross-site form/image submission.
 *
 * - ALLOWED_ORIGINS set (comma-separated) → Origin must be same-origin or listed.
 * - ALLOWED_ORIGINS empty (default) → same-origin only.
 */
function validateApiOrigin(req: Request): NextResponse | null {
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!mutating) return null;

  const origin = req.headers.get('origin');
  if (!origin) return null; // non-browser / server-to-server client

  const host = req.headers.get('host');
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }

  const sameOrigin = !!originHost && !!host && originHost === host;
  if (sameOrigin) return null;

  const allowedList = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const inList =
    allowedList.length > 0 &&
    allowedList.some((allowed) => {
      try {
        return new URL(allowed).host === originHost;
      } catch {
        return allowed === origin;
      }
    });

  if (!inList) {
    return NextResponse.json({ errorAr: 'طلب غير موثوق المصدر' }, { status: 403 });
  }
  return null;
}

export async function proxy(req: Request) {
  const url = new URL(req.url);
  const { pathname } = url;

  // ── A seller's own domain ──
  //
  // A hostname pointed here in DNS serves one published landing page. The
  // rewrite is invisible: the customer's address bar keeps the seller's
  // domain, and the page underneath is the same /lp/<slug> as ever, with
  // the same guards.
  //
  // A host that belongs to no page falls straight through, so the app's own
  // hostname costs one cached lookup per minute and nothing else. API paths
  // are left alone: the order the page posts must reach the real endpoint.
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/lp/') && !pathname.startsWith('/_next/')) {
    const slug = await slugForHost(req.headers.get('host'));
    if (slug) {
      const target = new URL(req.url);
      target.pathname = `/lp/${slug}`;
      return NextResponse.rewrite(target);
    }
  }

  // API routes: origin validation on mutations; auth lives in each handler.
  // Public endpoints (landing pages, webhooks) are intentionally included —
  // they carry their own guards and the origin check is method-scoped.
  if (pathname.startsWith('/api/')) {
    const originError = validateApiOrigin(req);
    if (originError) return originError;
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Read session token from the HTTP-only cookie (never from client storage)
  const cookieHeader = req.headers.get('cookie') || '';
  const tokenMatch = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  const token = tokenMatch?.split('=')[1];

  if (!token) {
    return redirectTo(req, '/login');
  }

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, getJwtSecret()));
  } catch {
    return redirectTo(req, '/login');
  }

  const status = payload.status as string;

  if (status === 'SUSPENDED' || status === 'DISABLED') {
    return redirectTo(req, '/login?suspended=1');
  }

  if (status === 'PENDING') {
    if (pathname === '/pending' || pathname === '/admin/profile') {
      return NextResponse.next();
    }
    return redirectTo(req, '/pending');
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. Screens resolve
     * through the route registry, so no path list is maintained here.
     */
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)',
  ],
};
