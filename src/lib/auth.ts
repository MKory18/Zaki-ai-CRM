import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { SessionUser, UserRole, UserStatus, Permission, ROLE_PERMISSIONS } from '@/types/auth';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'salesflow_super_secret_jwt_key_2026_xyz_production_key_safe'
);

const COOKIE_NAME = 'salesflow_session';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: {
  userId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  companyId: string | null;
  tv: number;
  remember?: boolean;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(payload.remember ? '30d' : '7d')
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<{
  userId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  companyId: string | null;
  tv: number;
} | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as {
      userId: string;
      email: string;
      role: UserRole;
      status: UserStatus;
      companyId: string | null;
      tv: number;
    };
  } catch {
    return null;
  }
}

/**
 * Loads the session user. Returns the user regardless of status
 * so the UI can render the correct screen (pending / suspended / active).
 * Token version is verified server-side to support forced logout.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const decoded = await verifySessionToken(token);
    if (!decoded) return null;

    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      include: {
        company: {
          select: { id: true, name: true, currency: true },
        },
      },
    });

    if (!user) return null;

    // Forced logout: token issued before the last tokenVersion bump is invalid
    if (user.tokenVersion !== decoded.tv) return null;

    const role = user.role as UserRole;
    const permissions = ROLE_PERMISSIONS[role] || [];

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role,
      status: user.status as UserStatus,
      avatar: user.avatar,
      companyId: user.companyId,
      companyName: user.company?.name,
      commissionRate: user.commissionRate,
      permissions,
    };
  } catch (error: any) {
    if (error?.digest === 'DYNAMIC_SERVER_USAGE') {
      return null;
    }
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Server-side guard for API routes. Only ACTIVE users may use business APIs.
 * PENDING / SUSPENDED / DISABLED accounts are rejected here — never trust the client.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  if (user.status !== 'ACTIVE') {
    throw new Error(`ACCOUNT_${user.status}`);
  }
  return user;
}

export async function requireCompanyTenant(): Promise<{ user: SessionUser; companyId: string }> {
  const user = await requireAuth();
  if (user.role === 'SUPER_ADMIN') {
    const firstCompany = await db.company.findFirst();
    if (!firstCompany) throw new Error('No company configured in platform');
    return { user, companyId: user.companyId || firstCompany.id };
  }
  if (!user.companyId) {
    throw new Error('User has no assigned company tenant');
  }
  return { user, companyId: user.companyId };
}

export function hasPermission(user: SessionUser, permission: Permission): boolean {
  if (user.status !== 'ACTIVE') return false;
  if (user.role === 'SUPER_ADMIN' || user.role === 'COMPANY_ADMIN') return true;
  return user.permissions.includes(permission);
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireAuth();
  if (!hasPermission(user, permission)) {
    throw new Error(`Forbidden: missing required permission ${permission}`);
  }
  return user;
}

/** Builds the HTTP-only session cookie settings */
export function sessionCookieOptions(remember: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * (remember ? 30 : 7),
  };
}

export { COOKIE_NAME };
