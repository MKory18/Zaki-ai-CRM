import { db } from './db';
import { EMPTY_LAYOUT, parseLayout, resolveLayout, type NavLayout } from './nav-arrangement';

/**
 * READING AND WRITING THE ARRANGEMENT — SERVER SIDE, FOR THE FIRST FRAME.
 *
 * The brief asks for the stored arrangement to be on screen in the FIRST
 * frame, not after a fetch: a menu that reorders itself a moment after the
 * page appears is a menu that moved under somebody's thumb. The shell
 * layout is a server component and already resolves the session, so the
 * read happens there and the sidebar is simply handed the result.
 *
 * ── THE ROLE A PERSON IS IN IS A NAME, NOT AN ID ──
 *
 * `user.role` is a name (`'MANAGER'`), and a role's base is keyed on the
 * ROW. So the base is found by joining on the name within the company,
 * plus the system-wide templates (`companyId IS NULL`) that older roles
 * still resolve against — the same way `role_permissions` is read.
 */

/** One query: the role's base and this person's own, in one round trip. */
export async function readArrangement(
  companyId: string,
  userId: string,
  roleName: string
): Promise<{ base: NavLayout | null; own: NavLayout | null; resolved: NavLayout }> {
  const rows = await db.navArrangement.findMany({
    where: {
      companyId,
      OR: [{ userId }, { role: { name: roleName } }],
    },
    select: { userId: true, roleId: true, layout: true },
  });

  const ownRow = rows.find((r) => r.userId === userId);
  const baseRow = rows.find((r) => r.roleId !== null);
  const base = baseRow ? parseLayout(baseRow.layout) : null;
  const own = ownRow ? parseLayout(ownRow.layout) : null;

  return { base, own, resolved: resolveLayout(base, own) };
}

/** This person's own arrangement, replacing whatever was there. */
export async function saveOwnArrangement(
  companyId: string,
  userId: string,
  layout: NavLayout
): Promise<void> {
  const existing = await db.navArrangement.findFirst({
    where: { companyId, userId },
    select: { id: true },
  });
  if (existing) {
    await db.navArrangement.update({ where: { id: existing.id }, data: { layout: JSON.stringify(layout) } });
    return;
  }
  await db.navArrangement.create({
    data: { companyId, userId, layout: JSON.stringify(layout) },
  });
}

/**
 * «رجّع الأساس» — the person's own row goes, and the role's base answers
 * again. Deleting beats storing an empty layout: an empty one would be
 * indistinguishable from «I deliberately hid nothing», which is a
 * different thing from «I have no opinion».
 */
export async function clearOwnArrangement(companyId: string, userId: string): Promise<void> {
  await db.navArrangement.deleteMany({ where: { companyId, userId } });
}

/** The base for a role, set by the owner. */
export async function saveRoleArrangement(
  companyId: string,
  roleId: string,
  layout: NavLayout
): Promise<void> {
  const existing = await db.navArrangement.findFirst({
    where: { companyId, roleId },
    select: { id: true },
  });
  if (existing) {
    await db.navArrangement.update({ where: { id: existing.id }, data: { layout: JSON.stringify(layout) } });
    return;
  }
  await db.navArrangement.create({ data: { companyId, roleId, layout: JSON.stringify(layout) } });
}

/** The base a role carries today, for the owner's own «الترتيب لـ» screen. */
export async function readRoleArrangement(companyId: string, roleId: string): Promise<NavLayout> {
  const row = await db.navArrangement.findFirst({
    where: { companyId, roleId },
    select: { layout: true },
  });
  return row ? parseLayout(row.layout) : EMPTY_LAYOUT;
}
