import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { ROLE_PERMISSIONS, type Permission } from '@/types/auth';

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

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

/** Route → required permission (enforced at the edge, verified again in every API) */
const PERMISSION_MAP: Record<string, Permission> = {
  '/orders': 'orders.view',
  '/customers': 'customers.view',
  '/products': 'products.view',
  '/production': 'production.view',
  '/inventory': 'inventory.view',
  '/offers': 'offers.manage',
  '/moderators': 'users.view',
  '/users': 'users.view',
  '/roles': 'roles.view',
  '/permissions': 'roles.view',
  '/analytics': 'reports.view',
  '/finance': 'finance.view',
  '/ai-assistant': 'ai.use',
  '/audit-logs': 'audit.view',
  '/settings': 'settings.view',
};

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
  const { pathname } = new URL(req.url);

  // API routes: enforce origin validation on mutations, then pass through —
  // authentication/authorization is handled inside each route handler.
  if (pathname.startsWith('/api/')) {
    const originError = validateApiOrigin(req);
    if (originError) return originError;
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
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

  let payload: any;
  try {
    ({ payload } = await jwtVerify(token, getJwtSecret()));
  } catch {
    return redirectTo(req, '/login');
  }

  const role = payload.role as string;
  const status = payload.status as string;

  if (status === 'SUSPENDED' || status === 'DISABLED') {
    return redirectTo(req, '/login?suspended=1');
  }

  if (status === 'PENDING') {
    if (pathname === '/pending' || pathname === '/profile') {
      return NextResponse.next();
    }
    return redirectTo(req, '/pending');
  }

  // Protected module permission check
  for (const [basePath, permission] of Object.entries(PERMISSION_MAP)) {
    if (pathname === basePath || pathname.startsWith(basePath + '/')) {
      if (role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN') {
        return NextResponse.next();
      }
      const perms = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] || [];
      if (!perms.includes(permission)) {
        return redirectTo(req, '/access-denied');
      }
      break;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // API routes run through the proxy for origin validation on mutations only
    '/api/:path*',
    '/orders/:path*',
    '/customers/:path*',
    '/products/:path*',
    '/production/:path*',
    '/inventory/:path*',
    '/offers/:path*',
    '/moderators/:path*',
    '/users/:path*',
    '/roles/:path*',
    '/permissions/:path*',
    '/analytics/:path*',
    '/finance/:path*',
    '/ai-assistant/:path*',
    '/audit-logs/:path*',
    '/settings/:path*',
    '/access-denied',
    '/pending',
    '/profile',
  ],
};

