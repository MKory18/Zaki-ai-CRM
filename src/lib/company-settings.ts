import { db } from './db';

/**
 * CHANGE ONE KEY OF A COMPANY'S SETTINGS, AND NOTHING ELSE.
 *
 * Company.settings is one JSON document with several owners — the AI
 * settings, the message templates. Each used to read it, change its own
 * key and write the whole document back. Two saves at once meant the
 * second wrote back what the first had just changed: a template save
 * running beside a key removal put the removed AI key back.
 *
 * So the read and the write happen under a row lock (SELECT … FOR UPDATE):
 * the second save waits, reads the first one's result, and changes only its
 * own key on top of it.
 */
export async function updateCompanySettings<T>(
  companyId: string,
  key: string,
  change: (current: T | undefined) => T | undefined
): Promise<T | undefined> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ settings: string | null }[]>`
      SELECT "settings" FROM "companies" WHERE "id" = ${companyId} FOR UPDATE`;
    let all: Record<string, unknown> = {};
    try {
      all = rows[0]?.settings ? JSON.parse(rows[0].settings) : {};
    } catch {
      // A broken document is replaced rather than left to break every save.
      all = {};
    }
    const next = change(all[key] as T | undefined);
    if (next === undefined) delete all[key];
    else all[key] = next;
    await tx.company.update({ where: { id: companyId }, data: { settings: JSON.stringify(all) } });
    return next;
  });
}
