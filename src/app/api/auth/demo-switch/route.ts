import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME } from '@/lib/auth';
import { UserRole, UserStatus, ROLE_PERMISSIONS } from '@/types/auth';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { company: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const role = user.role as UserRole;
    const status = user.status as UserStatus;

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role,
      status,
      companyId: user.companyId,
      tv: user.tokenVersion,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        status,
        companyId: user.companyId,
        companyName: user.company?.name,
        commissionRate: user.commissionRate,
        permissions: ROLE_PERMISSIONS[role] || [],
      },
    });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      ...sessionCookieOptions(true),
    });

    return response;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
