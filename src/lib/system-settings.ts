import { db } from './db';

/**
 * A SETTING THAT BELONGS TO THE INSTALLATION.
 *
 * `company-settings.ts` does this for one company's JSON document, and says
 * at length why the read and the write must happen under a row lock: two
 * saves at once and the second writes back what the first had just changed —
 * a template save that put a removed AI key back.
 *
 * The same hazard exists here and is worse, because the document this guards
 * holds vendor accounts for the whole installation rather than one seller's
 * preferences. So the same discipline, with one extra step: the row has to
 * EXIST before it can be locked. `SELECT … FOR UPDATE` on a row that is not
 * there locks nothing at all, and two first-ever saves would then both insert
 * and one would lose. The insert-then-lock below closes that.
 *
 * This is deliberately NOT a general cache: every call reads the row. The
 * settings are read once per AI call, an AI call takes seconds, and a stale
 * key held in memory is a key somebody revoked and the system kept using.
 */

/** The row's name. One row per subject, and `ai` is the only one so far. */
export const SYSTEM_AI = 'ai';

/**
 * THE TABLE MAY NOT BE THERE YET.
 *
 * Code ships before a migration is applied — that is the normal order, and
 * on this project the migration is run by hand because the dev server holds
 * a lock on the database. In that window every AI call would go through here
 * and meet a Prisma error about a missing relation, which is a 500 on the
 * settings screen and a crash in a background job, for a setting that is
 * simply not configured yet.
 *
 * So P2021 — and only P2021, "the table does not exist" — reads as absent.
 * Every other database error is thrown, because a connection failure or a
 * permission problem is not the same thing as "nothing is configured" and
 * must not be silently turned into it.
 */
function missingTable(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2021';
}

export async function readSystemSetting<T>(key: string): Promise<T | undefined> {
  let row: { value: string } | null;
  try {
    row = await db.systemSetting.findUnique({ where: { key }, select: { value: true } });
  } catch (e) {
    if (missingTable(e)) return undefined;
    throw e;
  }
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    // A broken document reads as absent rather than throwing: the AI falling
    // back to "not configured" is recoverable, a settings screen that will
    // not open is not.
    return undefined;
  }
}

/** Who last touched it, for the screen. Never part of the document itself. */
export async function systemSettingMeta(
  key: string
): Promise<{ updatedAt: Date; updatedBy: string | null } | null> {
  let row: { updatedAt: Date; updatedById: string | null } | null;
  try {
    row = await db.systemSetting.findUnique({
      where: { key },
      select: { updatedAt: true, updatedById: true },
    });
  } catch (e) {
    // Same window, same reason as `readSystemSetting`.
    if (missingTable(e)) return null;
    throw e;
  }
  if (!row) return null;
  const user = row.updatedById
    ? await db.user.findUnique({ where: { id: row.updatedById }, select: { name: true } })
    : null;
  return { updatedAt: row.updatedAt, updatedBy: user?.name ?? null };
}

/**
 * Change one installation setting, under a lock, and nothing else.
 *
 * `change` receives what is stored and returns what should be stored.
 * Returning `undefined` deletes the row.
 */
export async function updateSystemSetting<T>(
  key: string,
  change: (current: T | undefined) => T | undefined,
  actorId?: string | null
): Promise<T | undefined> {
  return db.$transaction(async (tx) => {
    // Make sure there is a row to lock. Two first-ever saves would otherwise
    // both find nothing, both insert, and one would be lost.
    await tx.$executeRaw`
      INSERT INTO "system_settings" ("key", "value", "updatedAt", "createdAt")
      VALUES (${key}, '{}', NOW(), NOW())
      ON CONFLICT ("key") DO NOTHING`;

    const rows = await tx.$queryRaw<{ value: string }[]>`
      SELECT "value" FROM "system_settings" WHERE "key" = ${key} FOR UPDATE`;

    let current: T | undefined;
    try {
      const parsed = rows[0]?.value ? JSON.parse(rows[0].value) : undefined;
      current = parsed && Object.keys(parsed).length > 0 ? (parsed as T) : undefined;
    } catch {
      current = undefined;
    }

    const next = change(current);
    if (next === undefined) {
      await tx.systemSetting.delete({ where: { key } }).catch(() => undefined);
      return undefined;
    }

    await tx.systemSetting.update({
      where: { key },
      data: { value: JSON.stringify(next), updatedById: actorId ?? null },
    });
    return next;
  });
}
