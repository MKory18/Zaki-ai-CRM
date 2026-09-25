import { toLatinDigits } from '@/lib/latin-digits';
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { ASSIGNABLE_ROLES, UserRole, UserStatus } from '@/types/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { isPrivilegedRoleName } from '@/lib/role-names';
import { canConferRole } from '@/lib/user-permissions';
import { parseHhMm, parseRestDays } from '@/lib/employee-shift';

/**
 * PATCH /api/users/:id — admin actions on a user account:
 * assignRole, changeStatus, forceLogout, resetPassword, delete
 * All actions are recorded in Audit Logs. Passwords are never logged.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admin = await requirePermission('users.edit');
    const body = await req.json();
    const { action, role, status, roleId } = body;

    const target = await db.user.findUnique({
      where: { id },
      include: { assignedBy: { select: { name: true } } },
    });
    if (!target) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
    }

    // ── Multi-tenant isolation: admins may only manage users inside their
    // own company. SUPER_ADMIN (platform, companyId=null) is exempt. ──
    const isPlatformSuper = admin.role === 'SUPER_ADMIN' && !admin.companyId;
    if (!isPlatformSuper) {
      const adminCo = admin.companyId;
      const targetCo = target.companyId;
      const sameCompany = adminCo && targetCo === adminCo;
      // Platform-level (companyId: null) accounts may only be touched by a
      // company admin for ADOPTION (assignRole on a PENDING account); every
      // other action (resetPassword/changeStatus/forceLogout/delete) is
      // SUPER_ADMIN-only — platform accounts are never company-manageable.
      const adoptionEligible = adminCo && targetCo === null && action === 'assignRole';
      if (!sameCompany && !adoptionEligible) {
        return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
      }
    }

    // ── Privilege-escalation guards ──
    // Only SUPER_ADMIN may manage SUPER_ADMIN accounts
    if (target.role === 'SUPER_ADMIN' && admin.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'فقط المدير الأعلى يمكنه إدارة حسابات المدراء الأعلى' }, { status: 403 });
    }
    // Only SUPER_ADMIN may assign the SUPER_ADMIN role to anyone
    if (action === 'assignRole' && role === 'SUPER_ADMIN' && admin.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'فقط المدير الأعلى يمكنه تعيين رتبة المدير الأعلى' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    let auditAction = '';

    if (action === 'assignRole') {
      // roleId-based assignment (Permission Engine) takes precedence over the
      // legacy `role` string. The legacy path below is kept for compatibility.
      if (roleId) {
        if (typeof roleId !== 'string') {
          return NextResponse.json({ error: 'الدور غير صالح' }, { status: 400 });
        }
        const roleRow = await db.role.findUnique({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
        if (!roleRow) {
          return NextResponse.json({ error: 'الدور غير موجود' }, { status: 400 });
        }
        // Tenant rule: system roles (companyId null) are assignable by anyone
        // with the permission; company roles only within the same company.
        const roleAllowed = roleRow.companyId === null || roleRow.companyId === admin.companyId;
        if (!roleAllowed) {
          return NextResponse.json({ error: 'الدور غير موجود' }, { status: 404 });
        }
        // Only SUPER_ADMIN may assign a privileged legacy role string (name-based,
      // normalization-safe: guards both system and shadow company roles)
      if (isPrivilegedRoleName(roleRow.name) && admin.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'فقط المدير الأعلى يمكنه تعيين رتبة المدير الأعلى' }, { status: 403 });
      }
        if (target.id === admin.id && target.roleId !== roleId) {
          return NextResponse.json({ error: 'لا يمكنك تغيير دورك الشخصي' }, { status: 400 });
        }
        // Conferral policy: assigning a role confers its FULL canonical matrix
        // onto the target — the granter must be able to grant every key/scope
        // the role carries (granter-must-hold), not just hold users.edit.
        const conferral = await canConferRole(admin, { id: roleRow.id, name: roleRow.name });
        if (!conferral.ok) {
          return NextResponse.json({ error: conferral.error }, { status: conferral.status });
        }
        updateData.roleId = roleId;
        updateData.role = roleRow.name; // keep legacy role string in sync
        updateData.permissionsVersion = { increment: 1 }; // invalidate cached grants
        if (!target.companyId && admin.companyId && admin.role !== 'SUPER_ADMIN') {
          if (target.status !== 'PENDING') {
            return NextResponse.json({ error: 'غير مسموح بإسناد حساب من شركة أخرى' }, { status: 403 });
          }
          updateData.companyId = admin.companyId;
        }
        auditAction = 'USER_ROLE_CHANGED';
      } else if (!role || !ASSIGNABLE_ROLES.includes(role as UserRole)) {
        return NextResponse.json({ error: 'الدور غير صالح' }, { status: 400 });
      } else {
        if (target.id === admin.id && role !== admin.role) {
          return NextResponse.json({ error: 'لا يمكنك تغيير دورك الشخصي' }, { status: 400 });
        }
        // Grants resolve by roleId when one is set, so changing only the
        // string left the badge saying one role and the permissions being
        // another's. Point roleId at the role of that name — the company's
        // own first, then the system one — or clear it so the string rules.
        const named = await db.role.findFirst({
          where: {
            name: role as string,
            // Never another company's role: without a company, the system one only.
            OR: admin.companyId ? [{ companyId: admin.companyId }, { companyId: null }] : [{ companyId: null }],
          },
          orderBy: { companyId: 'asc' },
          select: { id: true },
        });
        // Conferral policy, checked against what is really granted: the role
        // row the user will point at — a company may have widened its own
        // role of this name — or, without one, the legacy matrix (fail-closed
        // for unknown names; PENDING_USER confers nothing).
        const conferral = await canConferRole(admin, { id: named?.id ?? null, name: role as string });
        if (!conferral.ok) {
          return NextResponse.json({ error: conferral.error }, { status: conferral.status });
        }
        updateData.role = role;
        updateData.roleId = named?.id ?? null;
        updateData.permissionsVersion = { increment: 1 };
      }
      // Adopting a platform-level (companyId: null) account is allowed ONLY for
      // a PENDING account by a company admin (onboarding). Never for ACTIVE
      // accounts — that would be cross-tenant account capture.
      if (!target.companyId && admin.companyId && admin.role !== 'SUPER_ADMIN') {
        if (target.status !== 'PENDING') {
          return NextResponse.json({ error: 'غير مسموح بإسناد حساب من شركة أخرى' }, { status: 403 });
        }
        updateData.companyId = admin.companyId;
      }
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
    } else if (action === 'updateContact') {
      // The employee's phone, on their own page. It could be set only when
      // the account was created, with no way to correct it afterwards.
      // Typed on an Arabic keyboard the digits are ٠-٩; stored as 0-9.
      const phone = typeof body.phone === 'string' ? toLatinDigits(body.phone).trim() : '';
      if (phone && !/^\+?[\d\s()-]{6,24}$/.test(phone)) {
        return NextResponse.json({ error: 'رقم الهاتف غير صالح — أرقام فقط، ويمكن أن يبدأ بـ +' }, { status: 400 });
      }
      updateData.phone = phone || null;

      // WHAT THIS PERSON'S COMMISSION IS COUNTED IN.
      //
      // An Egyptian moderator working a Syrian store's orders earns in
      // pounds, and is told a figure in pounds. Where the money comes from
      // is a separate question answered when it is paid: there may be no
      // pound wallet at all, and the cash leaves another one at a rate the
      // owner writes then (commission-payout.ts).
      if ('commissionCurrency' in body) {
        const raw = typeof body.commissionCurrency === 'string' ? body.commissionCurrency.trim().toUpperCase() : '';
        if (raw && !/^[A-Z]{3}$/.test(raw)) {
          return NextResponse.json({ error: 'رمز العملة ثلاثة أحرف (ISO)' }, { status: 400 });
        }
        // Empty means the store's own currency, which is how it always was.
        updateData.commissionCurrency = raw || null;
      }

      // WHEN THIS PERSON STARTS, AND WHEN THEY HAND OVER.
      //
      // Lateness was measured against the COUNTRY's hours, so somebody
      // whose shift genuinely starts at noon read as three hours late every
      // day — and every figure built on that, now including a deduction,
      // was wrong in the same direction. Empty means the country's, which
      // is what everybody had before this existed.
      if ('shiftStart' in body || 'shiftEnd' in body) {
        const from = parseHhMm(body.shiftStart);
        const to = parseHhMm(body.shiftEnd);
        if (body.shiftStart && !from) {
          return NextResponse.json({ error: 'وقت البدء بصيغة HH:mm' }, { status: 400 });
        }
        if (body.shiftEnd && !to) {
          return NextResponse.json({ error: 'وقت التسليم بصيغة HH:mm' }, { status: 400 });
        }
        // Refused rather than silently ignored: a shift saved and not
        // applied is worse than one refused, because nobody goes back to
        // check a field that reported success.
        if (from && to && to <= from) {
          return NextResponse.json({ error: 'وقت التسليم يجب أن يكون بعد وقت البدء' }, { status: 400 });
        }
        updateData.shiftStart = from;
        updateData.shiftEnd = to;
      }
      if ('restDays' in body) updateData.restDays = parseRestDays(body.restDays);

      auditAction = 'USER_CONTACT_UPDATED';
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
        ...(action === 'updateContact'
          ? {
              phone: target.phone,
              commissionCurrency: target.commissionCurrency,
              shiftStart: target.shiftStart,
              shiftEnd: target.shiftEnd,
              restDays: target.restDays,
            }
          : {}),
      },
      newData: {
        user: updated.name,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        ...(action === 'updateContact'
          ? { phone: updateData.phone, commissionCurrency: updateData.commissionCurrency }
          : {}),
        changedBy: admin.name,
        changedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
