import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, resolveSingleCompanyId } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { ASSIGNABLE_ROLES, UserRole } from '@/types/auth';
import { requirePermission } from '@/lib/authorization';

import { isPrivilegedRoleName } from '@/lib/role-names';
import { canConferRole } from '@/lib/user-permissions';
import { geoAccessError, replaceGeoAccess } from '@/lib/geo-access';
import { can } from '@/lib/authorization';
import { zodMessage } from '@/lib/zod-message';

const createUserSchema = z.object({
  name: z.string().trim().min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل').max(80),
  email: z.string().trim().toLowerCase().email('صيغة البريد الإلكتروني غير صحيحة'),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Z]/, 'يجب أن تحتوي على حرف كبير')
    .regex(/[a-z]/, 'يجب أن تحتوي على حرف صغير')
    .regex(/[0-9]/, 'يجب أن تحتوي على رقم'),
  role: z.enum(ASSIGNABLE_ROLES as [UserRole, ...UserRole[]]).default('MODERATOR'),
  roleId: z.string().uuid().optional(),
  phone: z.string().trim().max(25).optional(),
  commissionRate: z.number().min(0).max(50).optional(),
  // Where this employee works. An account with no country reaches no screen
  // that needs a context, so the assignment belongs to the creation form and
  // not to a second trip through the geo-access editor.
  countryIds: z.array(z.string().uuid()).max(200).default([]),
  storeIds: z.array(z.string().uuid()).max(500).default([]),
});

/** POST /api/users — admin creates a user directly (with a real role, ACTIVE) */
export async function POST(req: Request) {
  try {
    const admin = await requirePermission('users.create');
    const parsed = createUserSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const { name, email, password, role, roleId, phone, commissionRate } = parsed.data;
    const countryIds = [...new Set(parsed.data.countryIds)];
    const storeIds = [...new Set(parsed.data.storeIds)];

    // Only SUPER_ADMIN may create another SUPER_ADMIN
    if (role === 'SUPER_ADMIN' && admin.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'فقط المدير الأعلى يمكنه إنشاء مدير أعلى' }, { status: 403 });
    }

    // Permission Engine: explicit roleId takes precedence over the legacy role
    // string. Tenant rule: system roles (companyId null) or same-company roles.
    let targetRoleId: string | null = null;
    let targetRoleName: string = role === 'PENDING_USER' ? 'MODERATOR' : role;
    if (roleId) {
      const targetRole = await db.role.findUnique({ where: { id: roleId } });
      if (!targetRole) {
        return NextResponse.json({ error: 'الدور المحدد غير موجود' }, { status: 404 });
      }
      if (targetRole.companyId !== null && targetRole.companyId !== admin.companyId) {
        return NextResponse.json({ error: 'غير مسموح بإسناد دور من شركة أخرى' }, { status: 403 });
      }
if (isPrivilegedRoleName(targetRole.name) && admin.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'فقط المدير الأعلى يمكنه إسناد دور المدير الأعلى' }, { status: 403 });
      }
      // Conferral policy: creating an ACTIVE user with a role confers the full
      // canonical matrix — the creator must hold every key/scope it carries.
      const conferral = await canConferRole(admin, { id: targetRole.id, name: targetRole.name });
      if (!conferral.ok) {
        return NextResponse.json({ error: conferral.error }, { status: conferral.status });
      }
      targetRoleId = targetRole.id;
      targetRoleName = targetRole.name;
    } else if (admin.role !== 'SUPER_ADMIN') {
      // Legacy role-string path: same conferral policy resolved through the
      // canonical legacy matrix (fail-closed for unknown names).
      const conferral = await canConferRole(admin, { name: targetRoleName });
      if (!conferral.ok) {
        return NextResponse.json({ error: conferral.error }, { status: conferral.status });
      }
    }

    // Handing out countries and stores is the geo manager's call, the same
    // rule the geo-access editor enforces — creating the account is not a way
    // around it.
    if ((countryIds.length || storeIds.length) && !can(admin, 'geo.manage')) {
      return NextResponse.json({ error: 'Forbidden: missing required permission geo.manage' }, { status: 403 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' }, { status: 409 });
    }

    // SINGLE-COMPANY CRM: resolve the tenant server-side — a SUPER_ADMIN actor
    // without a company context still creates employees inside the one active
    // company. Never NULL, never client-controlled.
    const resolvedCompanyId = admin.companyId ?? (await resolveSingleCompanyId());

    const geoInvalid = await geoAccessError(resolvedCompanyId, countryIds, storeIds);
    if (geoInvalid) return NextResponse.json({ error: geoInvalid }, { status: 400 });

    // Hashing is deliberately slow — it happens before the transaction opens.
    const passwordHash = await hashPassword(password);

    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          companyId: resolvedCompanyId,
          name,
          email,
          phone: phone || null,
          passwordHash,
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
      // Same transaction as the account: an employee never exists for a
      // moment with a role but no place to use it.
      await replaceGeoAccess(tx as never, created.id, countryIds, storeIds);
      return created;
    });

    await logAudit({
      companyId: resolvedCompanyId,
      userId: admin.id,
      action: 'USER_CREATED_BY_ADMIN',
      entity: 'User',
      entityId: user.id,
      newData: {
        name: user.name,
        email: user.email,
        role: user.role,
        createdBy: admin.name,
        countryIds,
        storeIds,
      },
    });

    return NextResponse.json({ success: true, user });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' }, { status: 409 });
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


