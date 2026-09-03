import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { ROLE_PERMISSIONS, type Permission } from '@/types/auth';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'salesflow_super_secret_jwt_key_2026_xyz_production_key_safe'
);

const COOKIE_NAME = 'salesflow_session';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

/** Route → required permission (enforced at the edge, verified again in every API) */
const PERMISSION_MAP: Record<string, Permission> = {
  '/orders': 'orders.view',
  '/customers': 'customers.view',
  '/products': 'products.manage',
  '/production': 'production.manage',
  '/inventory': 'inventory.manage',
  '/offers': 'offers.manage',
  '/moderators': 'moderators.manage',
  '/users': 'users.manage',
  '/analytics': 'reports.view',
  '/finance': 'finance.view',
  '/ai-assistant': 'ai.use',
  '/audit-logs': 'audit.view',
  '/settings': 'settings.manage',
};

function redirectTo(req: Request, path: string) {
  const url = new URL(req.url);
  url.pathname = path;
  url.search = '';
  return NextResponse.redirect(url);
}

export async function proxy(req: Request) {
  const { pathname } = new URL(req.url);

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
    ({ payload } = await jwtVerify(token, JWT_SECRET));
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
    '/orders/:path*',
    '/customers/:path*',
    '/products/:path*',
    '/production/:path*',
    '/inventory/:path*',
    '/offers/:path*',
    '/moderators/:path*',
    '/users/:path*',
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
