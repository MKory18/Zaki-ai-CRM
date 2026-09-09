import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, resolveSingleCompanyId } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { ASSIGNABLE_ROLES, UserRole } from '@/types/auth';
import { requirePermission } from '@/lib/authorization';

const createUserSchema = z.object({
  name: z.string().trim().min(3, 'ط§ظ„ط§ط³ظ… ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† 3 ط£ط­ط±ظپ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„').max(80),
  email: z.string().trim().toLowerCase().email('طµظٹط؛ط© ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ط؛ظٹط± طµط­ظٹط­ط©'),
  password: z
    .string()
    .min(8, 'ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ظٹط¬ط¨ ط£ظ† طھظƒظˆظ† 8 ط£ط­ط±ظپ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„')
    .regex(/[A-Z]/, 'ظٹط¬ط¨ ط£ظ† طھط­طھظˆظٹ ط¹ظ„ظ‰ ط­ط±ظپ ظƒط¨ظٹط±')
    .regex(/[a-z]/, 'ظٹط¬ط¨ ط£ظ† طھط­طھظˆظٹ ط¹ظ„ظ‰ ط­ط±ظپ طµط؛ظٹط±')
    .regex(/[0-9]/, 'ظٹط¬ط¨ ط£ظ† طھط­طھظˆظٹ ط¹ظ„ظ‰ ط±ظ‚ظ…'),
  role: z.enum(ASSIGNABLE_ROLES as [UserRole, ...UserRole[]]).default('MODERATOR'),
  roleId: z.string().uuid().optional(),
  phone: z.string().trim().max(25).optional(),
  commissionRate: z.number().min(0).max(50).optional(),
});

/** POST /api/users â€” admin creates a user directly (with a real role, ACTIVE) */
export async function POST(req: Request) {
  try {
    const admin = await requirePermission('users.create');
    const parsed = createUserSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'ط¨ظٹط§ظ†ط§طھ ط؛ظٹط± طµط§ظ„ط­ط©' }, { status: 400 });
    }
    const { name, email, password, role, roleId, phone, commissionRate } = parsed.data;

    // Only SUPER_ADMIN may create another SUPER_ADMIN
    if (role === 'SUPER_ADMIN' && admin.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'ظپظ‚ط· ط§ظ„ظ…ط¯ظٹط± ط§ظ„ط£ط¹ظ„ظ‰ ظٹظ…ظƒظ†ظ‡ ط¥ظ†ط´ط§ط، ظ…ط¯ظٹط± ط£ط¹ظ„ظ‰' }, { status: 403 });
    }

    // Permission Engine: explicit roleId takes precedence over the legacy role
    // string. Tenant rule: system roles (companyId null) or same-company roles.
    let targetRoleId: string | null = null;
    let targetRoleName: string = role === 'PENDING_USER' ? 'MODERATOR' : role;
    if (roleId) {
      const targetRole = await db.role.findUnique({ where: { id: roleId } });
      if (!targetRole) {
        return NextResponse.json({ error: 'ط§ظ„ط¯ظˆط± ط§ظ„ظ…ط­ط¯ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯' }, { status: 404 });
      }
      if (targetRole.companyId !== null && targetRole.companyId !== admin.companyId) {
        return NextResponse.json({ error: 'ط؛ظٹط± ظ…ط³ظ…ظˆط­ ط¨ط¥ط³ظ†ط§ط¯ ط¯ظˆط± ظ…ظ† ط´ط±ظƒط© ط£ط®ط±ظ‰' }, { status: 403 });
      }
      if (targetRole.name === 'SUPER_ADMIN' && admin.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'ظپظ‚ط· ط§ظ„ظ…ط¯ظٹط± ط§ظ„ط£ط¹ظ„ظ‰ ظٹظ…ظƒظ†ظ‡ ط¥ط³ظ†ط§ط¯ ط¯ظˆط± ط§ظ„ظ…ط¯ظٹط± ط§ظ„ط£ط¹ظ„ظ‰' }, { status: 403 });
      }
      targetRoleId = targetRole.id;
      targetRoleName = targetRole.name;
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'ظ‡ط°ط§ ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ظ…ط³ط¬ظ„ ظ…ط³ط¨ظ‚ط§ظ‹' }, { status: 409 });
    }

    // SINGLE-COMPANY CRM: resolve the tenant server-side — a SUPER_ADMIN actor
    // without a company context still creates employees inside the one active
    // company. Never NULL, never client-controlled.
    const resolvedCompanyId = admin.companyId ?? (await resolveSingleCompanyId());
    const user = await db.user.create({
      data: {
        companyId: resolvedCompanyId,
        name,
        email,
        phone: phone || null,
        passwordHash: await hashPassword(password),
        role: targetRoleName,
        roleId: targetRoleId,
        status: 'ACTIVE',
        assignedById: admin.id,
        assignedAt: new Date(),
        commissionRate: commissionRate ?? 0,
        lastLoginAt: null,
      },
      select: { id: true, name: true, email: true, role: true, status: true },
    });

    await logAudit({
      companyId: resolvedCompanyId,
      userId: admin.id,
      action: 'USER_CREATED_BY_ADMIN',
      entity: 'User',
      entityId: user.id,
      newData: { name: user.name, email: user.email, role: user.role, createdBy: admin.name },
    });

    return NextResponse.json({ success: true, user });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'ظ‡ط°ط§ ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ظ…ط³ط¬ظ„ ظ…ط³ط¨ظ‚ط§ظ‹' }, { status: 409 });
    }
    return apiErrorResponse(error);
  }
}

export async function GET(req: Request) {
  try {
    const { companyId } = await requirePermission('users.view');
    const { searchParams } = new URL(req.url);

    const search = searchParams.get('q')?.trim();
    const role = searchParams.get('role')?.trim();
    const status = searchParams.get('status')?.trim();
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const whereClause: any = {
      OR: [{ companyId }, { companyId: null }],
    };

    if (search) {
      whereClause.AND = [
        {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
          ],
        },
      ];
    }
    if (role && role !== 'all') whereClause.role = role;
    if (status && status !== 'all') whereClause.status = status;
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt.gte = new Date(dateFrom);
      if (dateTo) whereClause.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const [total, users] = await Promise.all([
      db.user.count({ where: whereClause }),
      db.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          avatar: true,
          phone: true,
          createdAt: true,
          lastLoginAt: true,
          assignedById: true,
          assignedAt: true,
          assignedBy: { select: { name: true } },
          company: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      users,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}


