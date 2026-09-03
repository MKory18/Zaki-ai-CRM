import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { requirePermission, hashPassword } from '@/lib/auth';
import { ASSIGNABLE_ROLES, UserRole, UserStatus } from '@/types/auth';
import { logAudit } from '@/lib/audit';

/**
 * PATCH /api/users/:id — admin actions on a user account:
 * assignRole, changeStatus, forceLogout, resetPassword, delete
 * All actions are recorded in Audit Logs. Passwords are never logged.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admin = await requirePermission('users.manage');
    const { action, role, status } = await req.json();

    const target = await db.user.findUnique({
      where: { id },
      include: { assignedBy: { select: { name: true } } },
    });
    if (!target) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
    }

    // Safety: only SUPER_ADMIN can manage SUPER_ADMIN accounts
    if (target.role === 'SUPER_ADMIN' && admin.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'فقط المدير الأعلى يمكنه إدارة حسابات المدراء الأعلى' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    let auditAction = '';

    if (action === 'assignRole') {
      if (!role || !ASSIGNABLE_ROLES.includes(role as UserRole)) {
        return NextResponse.json({ error: 'الدور غير صالح' }, { status: 400 });
      }
      if (target.id === admin.id && role !== admin.role) {
        return NextResponse.json({ error: 'لا يمكنك تغيير دورك الشخصي' }, { status: 400 });
      }
      updateData.role = role;
      if (!target.companyId && admin.companyId) updateData.companyId = admin.companyId;
      auditAction = 'USER_ROLE_CHANGED';
    } else if (action === 'changeStatus') {
      if (!['PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED'].includes(status)) {
        return NextResponse.json({ error: 'الحالة غير صالحة' }, { status: 400 });
      }
      if (target.id === admin.id) {
        return NextResponse.json({ error: 'لا يمكنك تغيير حالة حسابك الشخصي' }, { status: 400 });
      }
      updateData.status = status;
      if (status === 'ACTIVE') {
        updateData.assignedById = admin.id;
        updateData.assignedAt = new Date();
      }
      // Suspension/disable must kill active sessions immediately
      if (status === 'SUSPENDED' || status === 'DISABLED') {
        updateData.tokenVersion = { increment: 1 };
      }
      auditAction = 'USER_STATUS_CHANGED';
    } else if (action === 'forceLogout') {
      updateData.tokenVersion = { increment: 1 };
      auditAction = 'USER_FORCED_LOGOUT';
    } else if (action === 'resetPassword') {
      // Secure one-time temp password; admin relays it to the user out-of-band
      const tempPassword = crypto.randomBytes(9).toString('base64url').slice(0, 12) + 'Aa1';
      updateData.passwordHash = await hashPassword(tempPassword);
      updateData.tokenVersion = { increment: 1 };
      await db.user.update({ where: { id }, data: updateData });
      await logAudit({
        companyId: target.companyId || admin.companyId || 'platform',
        userId: admin.id,
        action: 'USER_PASSWORD_RESET_BY_ADMIN',
        entity: 'User',
        entityId: id,
        previousData: { user: target.name, email: target.email },
        newData: { resetBy: admin.name }, // password intentionally NOT logged
      });
      // Returned once over the authenticated response only
      return NextResponse.json({ success: true, temporaryPassword: tempPassword });
    } else if (action === 'delete') {
      if (target.id === admin.id) {
        return NextResponse.json({ error: 'لا يمكنك حذف حسابك الشخصي' }, { status: 400 });
      }
      if (target.role === 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'لا يمكن حذف حساب المدير الأعلى' }, { status: 400 });
      }
      await db.user.delete({ where: { id } });
      await logAudit({
        companyId: target.companyId || admin.companyId || 'platform',
        userId: admin.id,
        action: 'USER_DELETED',
        entity: 'User',
        entityId: id,
        previousData: { user: target.name, email: target.email, role: target.role, status: target.status },
        newData: { deletedBy: admin.name },
      });
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        assignedById: true,
        assignedAt: true,
      },
    });

    await logAudit({
      companyId: target.companyId || admin.companyId || 'platform',
      userId: admin.id,
      action: auditAction,
      entity: 'User',
      entityId: id,
      previousData: {
        user: target.name,
        email: target.email,
        role: target.role,
        status: target.status,
      },
      newData: {
        user: updated.name,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        changedBy: admin.name,
        changedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ داخلي';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
