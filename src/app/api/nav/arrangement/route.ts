import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { can } from '@/lib/authorization';
import { visibleNav } from '@/lib/route-registry';
import { cleanLayout, parseLayout } from '@/lib/nav-arrangement';
import {
  clearOwnArrangement,
  readArrangement,
  readRoleArrangement,
  saveOwnArrangement,
  saveRoleArrangement,
} from '@/lib/nav-arrangement-store';
import { logAudit } from '@/lib/audit';

/**
 * THE MENU'S ARRANGEMENT — the owner's base per role, a person's own.
 *
 * ── ARRANGING OPENS NOTHING ──
 *
 * Every layout written here is filtered down to the paths the WRITER may
 * already reach (`visibleNav`), so a hand-posted path for a screen
 * somebody may not open is dropped rather than stored. And it could not
 * grant anything even if it were stored: the menu this arranges is built
 * from `visibleNav` per viewer, and every door checks its own permission
 * when it is opened. Hiding is cosmetic; unhiding is cosmetic.
 *
 * ── WHO MAY SET A ROLE'S BASE ──
 *
 * `roles.edit` — the permission that already means «decide what a role
 * is». Inventing a key for it would be a grant somebody has to remember
 * before the feature works at all, which is how a feature arrives already
 * broken for everyone except whoever thought to tick it.
 */

const layoutSchema = z.object({
  order: z.array(z.string()).max(200).default([]),
  hidden: z.array(z.string()).max(200).default([]),
  pinned: z.array(z.string()).max(200).default([]),
});

/** GET — what this person's menu is arranged by, and what the base is. */
export async function GET() {
  try {
    const { user, companyId } = await requireCompanyTenant();
    const { base, own, resolved } = await readArrangement(companyId, user.id, user.role);
    return NextResponse.json({
      resolved,
      base,
      /** Null means «رجّع الأساس» would change nothing — there is nothing of mine. */
      own,
      /** The paths this person may arrange: their own menu, nothing more. */
      paths: visibleNav(user, can).flatMap((g) => g.routes.map((r) => r.path)),
      maySetRoleBase: can(user, 'roles.edit'),
    });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

/** PUT — mine, or a role's base with `?roleId=`. */
export async function PUT(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    const parsed = layoutSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ errorAr: 'شكل الترتيب غير مفهوم.' }, { status: 400 });
    }

    const roleId = new URL(req.url).searchParams.get('roleId');
    const mine = cleanLayout(
      parseLayout(parsed.data),
      visibleNav(user, can).flatMap((g) => g.routes.map((r) => r.path))
    );

    if (!roleId) {
      await saveOwnArrangement(companyId, user.id, mine);
      return NextResponse.json({ saved: 'own', layout: mine });
    }

    if (!can(user, 'roles.edit')) {
      return NextResponse.json(
        { errorAr: 'ترتيب القائمة لدورٍ كامل بيحتاج صلاحيّة تعديل الأدوار.', code: 'ROLE_BASE_FORBIDDEN' },
        { status: 403 }
      );
    }
    /*
     * The role has to be this company's. Without this check a role id from
     * another company could be written against this company's row — and
     * the partial unique index is on `(companyId, roleId)`, so it would
     * store cleanly and belong to nobody.
     */
    const role = await db.role.findFirst({
      where: { id: roleId, OR: [{ companyId }, { companyId: null }] },
      select: { id: true, name: true },
    });
    if (!role) return NextResponse.json({ errorAr: 'لا دور بهذا المعرّف.' }, { status: 404 });

    await saveRoleArrangement(companyId, role.id, mine);
    await logAudit({
      companyId,
      userId: user.id,
      action: 'NAV_BASE_SET',
      entity: 'Role',
      entityId: role.id,
      newData: { role: role.name, hidden: mine.hidden.length, pinned: mine.pinned.length },
    });
    return NextResponse.json({ saved: 'role', role: role.name, layout: mine });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

/**
 * DELETE — «رجّع الأساس».
 *
 * Only ever the caller's own row. A role's base is changed by writing a
 * new one, never by a delete: an owner pressing «رجّع الأساس» on his own
 * menu must not silently take the base away from everybody in his role.
 */
export async function DELETE() {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await clearOwnArrangement(companyId, user.id);
    const { resolved, base } = await readArrangement(companyId, user.id, user.role);
    return NextResponse.json({ reset: true, resolved, base });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

/** The owner's «الترتيب لـ: <دور>» screen reads a role's base with this. */
export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    if (!can(user, 'roles.edit')) {
      return NextResponse.json({ errorAr: 'لا تملك صلاحية تعديل الأدوار.' }, { status: 403 });
    }
    const roleId = new URL(req.url).searchParams.get('roleId');
    if (!roleId) return NextResponse.json({ errorAr: 'المعرّف مطلوب.' }, { status: 400 });
    const role = await db.role.findFirst({
      where: { id: roleId, OR: [{ companyId }, { companyId: null }] },
      select: { id: true, name: true },
    });
    if (!role) return NextResponse.json({ errorAr: 'لا دور بهذا المعرّف.' }, { status: 404 });
    return NextResponse.json({ role: role.name, layout: await readRoleArrangement(companyId, role.id) });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
