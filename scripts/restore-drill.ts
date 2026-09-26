/**
 * THE RESTORE DRILL — «a backup never restored is a hope».
 *
 *   npx tsx scripts/restore-drill.ts            # newest dump in BACKUP_DIR
 *   npx tsx scripts/restore-drill.ts <file>     # a particular one
 *
 * It restores the latest dump into a SCRATCH database beside the real one,
 * counts every table in both, compares the wallet balances, prints the
 * difference, and drops the scratch database again. It never touches the
 * source, and it never restores over anything.
 *
 * WHY ROW COUNTS AND BALANCES, AND NOT «IT RESTORED WITHOUT ERROR». A
 * `pg_restore` that exits zero having skipped a table it could not create is
 * the failure this is for: the command succeeded and the money is missing. So
 * the drill compares what came back against what is there, table by table,
 * and fails on the first table that disagrees.
 *
 * It is a script and not a job on purpose. A drill that runs itself every
 * night is a drill nobody has ever watched, and the point of this one is that
 * a person sees it pass before launch and signs the line that says so.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const DIR = process.env.BACKUP_DIR || './backups';

function latestDump(): string {
  const names = readdirSync(DIR).filter((n) => n.endsWith('.dump'));
  if (names.length === 0) throw new Error(`لا نسخة في ${DIR} — شغّل مهمّة daily-backup أوّلاً`);
  return join(
    DIR,
    names.sort((a, b) => statSync(join(DIR, a)).mtimeMs - statSync(join(DIR, b)).mtimeMs).at(-1)!
  );
}

function psql(url: string, sql: string) {
  const r = spawnSync('psql', ['--no-psqlrc', '--quiet', '--command', sql], {
    env: { ...process.env, PGDATABASE: url },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`psql: ${(r.stderr || '').trim().slice(0, 300)}`);
  return r.stdout;
}

/** Every table and how many rows are in it. */
async function census(url: string): Promise<Map<string, number>> {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await client.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const out = new Map<string, number>();
    for (const { tablename } of tables) {
      const rows = await client.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*)::bigint AS n FROM "${tablename}"`
      );
      out.set(tablename, Number(rows[0].n));
    }
    return out;
  } finally {
    await client.$disconnect();
  }
}

/** The number the business would notice: every wallet's book balance. */
async function balances(url: string): Promise<Map<string, string>> {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await client.$queryRawUnsafe<{ id: string; bal: string }[]>(
      `SELECT w.id,
              (w."openingBalance"
                + COALESCE(SUM(CASE WHEN m.direction = 'IN'  THEN m.amount ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN m.direction = 'OUT' THEN m.amount ELSE 0 END), 0))::text AS bal
         FROM wallets w
         LEFT JOIN wallet_movements m ON m."walletId" = w.id
        GROUP BY w.id, w."openingBalance"
        ORDER BY w.id`
    );
    return new Map(rows.map((r) => [r.id, r.bal]));
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error('DATABASE_URL غير مضبوط');

  const dump = process.argv[2] ?? latestDump();
  const scratch = `zaki_drill_${Date.now().toString(36)}`;
  const scratchUrl = source.replace(/\/[^/?]+(\?|$)/, `/${scratch}$1`);
  const adminUrl = source.replace(/\/[^/?]+(\?|$)/, '/postgres$1');

  console.log(`dump    : ${dump}`);
  console.log(`scratch : ${scratch}\n`);

  let created = false;
  try {
    psql(adminUrl, `CREATE DATABASE "${scratch}"`);
    created = true;

    const r = spawnSync(
      'pg_restore',
      ['--no-owner', '--no-privileges', '--dbname', scratchUrl, dump],
      { encoding: 'utf8' }
    );
    // pg_restore warns about extensions and roles on a clean database and
    // still exits non-zero. What matters is whether the DATA arrived, which
    // the census below decides — so a non-zero exit is reported, not fatal.
    if (r.status !== 0) {
      console.log(`pg_restore exited ${r.status} (warnings follow, the census decides)`);
      const lines = (r.stderr || '').trim().split('\n').slice(0, 4);
      for (const l of lines) console.log(`  ${l}`);
      console.log('');
    }

    const [before, after] = [await census(source), await census(scratchUrl)];
    const names = [...new Set([...before.keys(), ...after.keys()])].sort();

    let bad = 0;
    let rows = 0;
    for (const t of names) {
      const a = before.get(t) ?? -1;
      const b = after.get(t) ?? -1;
      rows += Math.max(a, 0);
      if (a !== b) {
        bad++;
        console.log(`  MISMATCH  ${t}: source ${a}, restored ${b}`);
      }
    }
    console.log(`tables  : ${names.length} · rows in source: ${rows} · mismatched: ${bad}`);

    const [bBefore, bAfter] = [await balances(source), await balances(scratchUrl)];
    let badMoney = 0;
    for (const [id, bal] of bBefore) {
      if (bAfter.get(id) !== bal) {
        badMoney++;
        console.log(`  MONEY     wallet ${id.slice(0, 8)}: source ${bal}, restored ${bAfter.get(id) ?? 'missing'}`);
      }
    }
    console.log(`wallets : ${bBefore.size} · balances that differ: ${badMoney}`);

    const ok = bad === 0 && badMoney === 0 && names.length > 0;
    console.log(`\n${ok ? 'DRILL PASSED' : 'DRILL FAILED'} — ${new Date().toISOString()}`);
    if (!ok) process.exitCode = 1;
  } finally {
    if (created) {
      // Never left behind: a scratch copy of the whole business sitting on the
      // same server is a second place the data can leak from.
      psql(adminUrl, `DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`);
      console.log(`scratch dropped`);
    }
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
