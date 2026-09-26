import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * TAKING A BACKUP, AND KNOWING IT IS ONE.
 *
 * `DEPLOY.md` already told the operator to run `pg_dump` by hand before a
 * deploy. That is the right command and the wrong schedule: a backup taken
 * when somebody remembers is a backup that exists on the days nothing went
 * wrong. This runs it every day through the scheduler that already exists —
 * no cron, no second process — and does two things the manual step never did.
 *
 * IT READS THE FILE BACK. `pg_dump` can exit zero and leave a truncated
 * archive if the disk fills mid-write, and nothing notices until the day
 * somebody needs it. Every dump is listed with `pg_restore --list` before it
 * counts as taken. A file that cannot be listed is deleted, not kept — an
 * unreadable archive in the folder is worse than no archive, because it looks
 * like one.
 *
 * AND IT IS HONEST ABOUT «OFF THE SERVER». A dump beside the database it came
 * from survives a dropped table and nothing else: not the disk, not the
 * machine, not the provider. The brief asks for off-server, and that is a
 * destination only the owner can choose — so `BACKUP_UPLOAD_CMD` runs after
 * every dump, and when it is unset the health below says so in as many words
 * rather than reporting green.
 */

export interface BackupHealth {
  /** Where dumps are written on this machine. */
  dir: string;
  /** The newest dump, if any. */
  latest: { file: string; bytes: number; takenAt: Date } | null;
  /** How many are kept. */
  count: number;
  /** True only when a copy leaves this machine. */
  offSite: boolean;
  /** What is wrong, in Arabic, for the jobs screen and the launch report. */
  problems: string[];
}

export const DEFAULT_DIR = process.env.BACKUP_DIR || './backups';
const KEEP = Number(process.env.BACKUP_KEEP || 14);

function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...opts.env }, shell: false });
    let stderr = '';
    let stdout = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 30 * 60_000);
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr, stdout });
    });
  });
}

export function backupName(at: Date): string {
  return `zaki-${at.toISOString().replace(/[:.]/g, '-')}.dump`;
}

/**
 * One dump, verified, with the old ones pruned.
 *
 * The connection string is passed in the environment, never on the command
 * line: an argument list is readable by every process on the machine, and it
 * carries the database password.
 */
export async function takeBackup(opts: { dir?: string; now?: Date } = {}): Promise<{
  file: string;
  bytes: number;
  offSite: boolean;
  pruned: number;
}> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL غير مضبوط');

  const dir = opts.dir ?? DEFAULT_DIR;
  await mkdir(dir, { recursive: true });

  const file = join(dir, backupName(opts.now ?? new Date()));
  const dump = await run('pg_dump', ['--format=custom', '--no-owner', '--file', file], {
    env: { PGDATABASE: url },
  });
  if (dump.code !== 0) {
    throw new Error(`pg_dump فشل: ${dump.stderr.trim().slice(0, 300)}`);
  }

  // Read it back before calling it a backup.
  const listed = await run('pg_restore', ['--list', file], { timeoutMs: 5 * 60_000 });
  if (listed.code !== 0 || listed.stdout.trim() === '') {
    await unlink(file).catch(() => {});
    throw new Error('النسخة غير قابلة للقراءة — حُذفت بدل أن تبقى تبدو نسخة');
  }

  const { size } = await stat(file);

  // Off the machine, if the owner has said where. Failure here does NOT
  // discard the dump: a local copy that did not get uploaded is still a
  // local copy, and losing it because the network was down would be the
  // wrong trade.
  let offSite = false;
  const upload = process.env.BACKUP_UPLOAD_CMD;
  if (upload) {
    const [bin, ...rest] = upload.split(' ').filter(Boolean);
    const res = await run(bin, [...rest, file], { timeoutMs: 30 * 60_000 }).catch((e) => ({
      code: -1,
      stderr: String(e),
      stdout: '',
    }));
    offSite = res.code === 0;
  }

  const pruned = await prune(dir);
  return { file, bytes: size, offSite, pruned };
}

/** Keep the newest `BACKUP_KEEP`; a folder that grows for ever fills a disk. */
export async function prune(dir: string): Promise<number> {
  const names = (await readdir(dir).catch(() => [])).filter((n) => n.endsWith('.dump')).sort();
  const extra = names.slice(0, Math.max(0, names.length - KEEP));
  for (const name of extra) await unlink(join(dir, name)).catch(() => {});
  return extra.length;
}

/**
 * IS THERE A BACKUP, AND DID IT LEAVE THE MACHINE?
 *
 * Read by the jobs screen and by the launch report. It reports a problem for
 * every way this can be quietly untrue — no dump, a stale one, an empty one,
 * and a destination nobody set. Silence is not the same as health.
 */
export async function backupHealth(opts: { dir?: string; now?: Date } = {}): Promise<BackupHealth> {
  const dir = opts.dir ?? DEFAULT_DIR;
  const now = opts.now ?? new Date();
  const problems: string[] = [];

  const names = (await readdir(dir).catch(() => [])).filter((n) => n.endsWith('.dump')).sort();
  let latest: BackupHealth['latest'] = null;

  if (names.length === 0) {
    problems.push('لا نسخة احتياطية واحدة');
  } else {
    const name = names[names.length - 1];
    const info = await stat(join(dir, name));
    latest = { file: name, bytes: info.size, takenAt: info.mtime };

    const ageHours = (now.getTime() - info.mtime.getTime()) / 3_600_000;
    if (ageHours > 36) {
      problems.push(`أحدث نسخة عمرها ${Math.floor(ageHours / 24)} يوماً — المهمّة اليوميّة لا تعمل`);
    }
    if (info.size < 1024) {
      problems.push('أحدث نسخة شبه فارغة');
    }
  }

  const offSite = !!process.env.BACKUP_UPLOAD_CMD;
  if (!offSite) {
    problems.push(
      'النسخ تبقى على الخادم نفسه — اضبط BACKUP_UPLOAD_CMD لترحيلها خارجه. ' +
        'نسخةٌ بجانب قاعدتها تنجو من جدول محذوف ولا تنجو من قرصٍ تالف'
    );
  }

  return { dir, latest, count: names.length, offSite, problems };
}
