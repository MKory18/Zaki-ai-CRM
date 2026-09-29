import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE RECORD OF WHO DID WHAT MUST OUTLIVE THE PERSON WHO WISHES IT DID NOT.
 *
 * The threat this system is audited against is not an outsider: it is a
 * valid session, a database console, and an hour on somebody's last day.
 * Against that, «nothing in the application deletes an audit row» is a
 * comment. The table itself has to refuse.
 *
 * Proved against the real database before this was written — an UPDATE, a
 * DELETE, a `deleteMany` and both raw statements were all refused with
 * SQLSTATE 23001, while the INSERT went through and the row came back
 * unchanged. What these tests hold is that the guard is still IN the
 * migrations and that no code has started trying to go around it.
 */

const MIGRATION = 'prisma/migrations/20260929220000_audit_log_append_only';
const repoFile = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the table refuses to forget', () => {
  const sql = repoFile(`${MIGRATION}/migration.sql`);

  it('blocks both doors, not just the obvious one', () => {
    // A DELETE guard alone leaves the quieter attack: edit the row to say
    // something else and leave it in place, where nobody counts it missing.
    expect(sql).toMatch(/BEFORE UPDATE ON "audit_logs"/);
    expect(sql).toMatch(/BEFORE DELETE ON "audit_logs"/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  it('and leaves the insert alone', () => {
    expect(sql, 'حارسٌ يمنع الكتابةَ يُسكت السجلَّ بدل أن يحميه').not.toMatch(/BEFORE INSERT ON "audit_logs"/);
  });

  it('can be undone deliberately, as this project requires of a migration', () => {
    const back = repoFile(`${MIGRATION}/rollback.sql`);
    expect(back).toContain('DROP TRIGGER IF EXISTS audit_logs_no_update');
    expect(back).toContain('DROP TRIGGER IF EXISTS audit_logs_no_delete');
  });
});

describe('and nothing in the application asks it to', () => {
  /** Every .ts under src, which is the only place Prisma is called from. */
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
    }
    return out;
  }

  it('never updates or deletes an audit row', () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src'))) {
      const src = readFileSync(file, 'utf8');
      if (/auditLog\.(update|updateMany|delete|deleteMany|upsert)\b/.test(src)) {
        offenders.push(file.replace(process.cwd(), ''));
      }
    }
    // Such a call would now fail at the database anyway — the point of
    // catching it here is that it fails in the suite instead of in front
    // of whoever was recording the thing that got lost.
    expect(offenders, `يعدّل سجلّ التدقيق: ${offenders.join(', ')}`).toEqual([]);
  });
});
