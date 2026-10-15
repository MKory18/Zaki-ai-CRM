import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { AUTO_THEME, SYSTEM_THEMES } from '@/lib/system-themes';

/**
 * PUT /api/roles/[id]/theme — the look a role OPENS ON.
 *
 * A base, not a cage. A new agent's first morning is the look their job is
 * meant to have, and the first time they pick one of their own
 * (`users.system_theme`) this stops being read for them — see
 * `openingTheme` in system-themes.ts. The same shape the menu arrangement
 * already has.
 *
 * ── THE SAME PERMISSION THAT DECIDES WHAT A ROLE IS ──
 *
 * `roles.edit`, and not a new one. Setting what a whole role sees when it
 * signs in is a decision about the role, so it belongs to whoever already
 * decides what the role may do. A second permission for one nullable
 * string is a second thing for the owner to get wrong.
 *
 * ── AND A ROLE FROM ANOTHER COMPANY IS NOT FOUND ──
 *
 * Scoped like every other role write here: a system role (`companyId:
 * null`) is a shared template and is not edited through this door, and a
 * company role belongs to the caller's company or does not exist for them.
 * Without this the row would be written against a role this person cannot
 * see.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('roles.edit');
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const raw = (body as { theme?: unknown }).theme;

    /*
     * EMPTY MEANS «NOBODY CHOSE», AND THAT IS NOT THE SAME AS «THE
     * DEFAULT».
     *
     * Clearing has to be possible, and it has to write NULL rather than
     * the default's key: the day the product's default moves, a role that
     * was never set should move with it, and a role somebody deliberately
     * set to the old default should not. `sanitizeTheme` cannot express
     * that — it answers «the default» for everything it does not know —
     * so the validation here is explicit instead.
     */
    const known = new Set<string>([...SYSTEM_THEMES.map((t) => t.key), AUTO_THEME]);
    let theme: string | null;
    if (raw === null || raw === undefined || raw === '') theme = null;
    else if (typeof raw === 'string' && known.has(raw)) theme = raw;
    else {
      return NextResponse.json(
        { error: 'مظهر غير معروف', code: 'UNKNOWN_THEME' },
        { status: 400 }
      );
    }

    const role = await db.role.findFirst({
      where: { id, companyId },
      select: { id: true, name: true, systemTheme: true },
    });
    if (!role) {
      return NextResponse.json({ error: 'الدور غير موجود', code: 'ROLE_NOT_FOUND' }, { status: 404 });
    }

    await db.role.update({ where: { id: role.id }, data: { systemTheme: theme } });

    // The NAME of the look, never anything about the people in the role.
    await logAudit({
      companyId,
      userId: user.id,
      action: 'ROLE_THEME_SET',
      entity: 'Role',
      entityId: role.id,
      previousData: { role: role.name, systemTheme: role.systemTheme ?? null },
      newData: { role: role.name, systemTheme: theme },
    });

    return NextResponse.json({ ok: true, theme });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
