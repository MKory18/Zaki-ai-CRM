import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A NEW MEMBER OF STAFF OPENS ON «ليل» — AND NOBODY WHO ALREADY WORKS HERE
 * IS TOUCHED, AND THE OWNER'S ROLE LOOK STILL ANSWERS FIRST.
 *
 * Three promises, each held by the doors themselves rather than by a
 * reading of the source:
 *   1. the two creation doors write «ليل» into the new person's own
 *      column (called for real, with the database stubbed, and the row
 *      they hand to `create` inspected);
 *   2. a role the owner published a look for keeps it: the new hire's own
 *      column stays empty, so `openingTheme` reaches the role's base;
 *   3. no path that changes an EXISTING user writes it — no update, no
 *      upsert, no migration, no backfill.
 *
 * ── THE MUTATIONS THIS WAS RUN AGAINST (each turned it red) ──
 *   · `newStaffTheme` returning «ليل» always       → the role-look test
 *   · `systemTheme: …` deleted from /api/users      → the users-door test
 *   · `systemTheme: …` deleted from /api/moderators → the moderators-door test
 *   · `NEW_STAFF_THEME = 'lyl'` (a typo)            → «is a real theme»
 *   · an update path writing `systemTheme: 'layl'`  → the existing-users sweep
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db, tx, requirePermission, requireCompanyTenant, logAudit } = vi.hoisted(() => {
  const tx = { user: { create: vi.fn() } };
  return {
    tx,
    db: {
      role: { findUnique: vi.fn() },
      user: { findUnique: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    requirePermission: vi.fn(),
    requireCompanyTenant: vi.fn(),
    logAudit: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: () => true,
}));
vi.mock('@/lib/auth', () => ({
  hashPassword: async () => 'hashed',
  resolveSingleCompanyId: async () => 'co-1',
  requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/user-permissions', () => ({ canConferRole: async () => ({ ok: true }) }));
vi.mock('@/lib/geo-access', () => ({ geoAccessError: async () => null, replaceGeoAccess: async () => undefined }));
vi.mock('@/lib/commission', () => ({ commissionByUserForOrders: async () => new Map() }));

import { NEW_STAFF_THEME, SHEET_THEMES, SYSTEM_THEMES, newStaffTheme, openingTheme } from './system-themes';
import { stripComments } from './guard-source';
import { POST as createUser } from '@/app/api/users/route';
import { POST as createModerator } from '@/app/api/moderators/route';

const ROLE_ID = '0b6f3c2e-6d5a-4c1e-9f0a-2b7d8e9c1a34';
// Synthetic, and shaped only to pass the house's own password rules.
const SAMPLE_PASSWORD = 'Sample-Pass-123';

const post = (body: unknown) =>
  new Request('http://local.test/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN', companyId: 'co-1', name: 'المالك' });
  requireCompanyTenant.mockResolvedValue({ user: { id: 'admin-1' }, companyId: 'co-1' });
  db.user.findUnique.mockResolvedValue(null);
  tx.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new-1', ...data }));
  db.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new-2', ...data }));
});

describe('the rule itself', () => {
  it('— «ليل» is a real theme, and not one the first-load sheet carries, so it costs that sheet nothing', () => {
    expect(SYSTEM_THEMES.some((t) => t.key === NEW_STAFF_THEME)).toBe(true);
    expect(NEW_STAFF_THEME).toBe('layl');
    expect((SHEET_THEMES as readonly string[]).includes(NEW_STAFF_THEME)).toBe(false);
  });

  it('— no role look: the new person is given «ليل», and opens on it', () => {
    expect(newStaffTheme(null)).toBe('layl');
    expect(newStaffTheme(undefined)).toBe('layl');
    expect(newStaffTheme('')).toBe('layl');
    expect(openingTheme(newStaffTheme(null), null)).toBe('layl');
  });

  it('— a role the owner published a look for: the own column stays empty, and the role answers', () => {
    expect(newStaffTheme('day')).toBeNull();
    expect(openingTheme(newStaffTheme('day'), 'day')).toBe('day');
  });
});

describe('the two creation doors write it — called for real', () => {
  it('— /api/users, with a role that has no look of its own: «ليل»', async () => {
    db.role.findUnique.mockResolvedValue({ id: ROLE_ID, name: 'WAREHOUSE', companyId: null, systemTheme: null });
    const res = await createUser(post({ name: 'موظف جديد', email: 'new.hire@example.test', password: SAMPLE_PASSWORD, roleId: ROLE_ID }) as never);
    expect(res.status, await res.clone().text()).toBeLessThan(300);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create.mock.calls[0][0].data.systemTheme).toBe('layl');
  });

  it('— /api/users, with a role the owner gave «نهاري»: nothing written, so «نهاري» is what they open on', async () => {
    db.role.findUnique.mockResolvedValue({ id: ROLE_ID, name: 'WAREHOUSE', companyId: null, systemTheme: 'day' });
    const res = await createUser(post({ name: 'موظف جديد', email: 'new.hire@example.test', password: SAMPLE_PASSWORD, roleId: ROLE_ID }) as never);
    expect(res.status, await res.clone().text()).toBeLessThan(300);
    const data = tx.user.create.mock.calls[0][0].data;
    expect(data.systemTheme ?? null).toBeNull();
    expect(openingTheme(data.systemTheme, 'day')).toBe('day');
  });

  it('— /api/users, by the legacy role name (no role row, so no role look): «ليل»', async () => {
    const res = await createUser(post({ name: 'موظف جديد', email: 'new.hire@example.test', password: SAMPLE_PASSWORD, role: 'MODERATOR' }) as never);
    expect(res.status, await res.clone().text()).toBeLessThan(300);
    expect(db.role.findUnique).not.toHaveBeenCalled();
    expect(tx.user.create.mock.calls[0][0].data.systemTheme).toBe('layl');
  });

  // `/api/moderators` was the third door that made staff. It is closed now
  // (410 — it skipped the role and password checks `/api/users` makes), so
  // the rule here is that it makes nobody at all, theme or no theme.
  it('— /api/moderators: closed, and makes nobody', async () => {
    const res = await createModerator();
    expect(res.status).toBe(410);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe('and nobody who already exists is touched', () => {
  const ROOT = process.cwd();
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });

  // One door now: `/api/moderators` is closed (410) and creates nobody.
  it('— «ليل» is written only where a user is CREATED: the one door, through the one rule', () => {
    const writers = walk(join(ROOT, 'src'))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => /newStaffTheme\(|NEW_STAFF_THEME/.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(ROOT.length + 1).split('\\').join('/'))
      .sort();
    expect(writers).toEqual(['src/app/api/users/route.ts', 'src/lib/system-themes.ts']);
    for (const door of ['src/app/api/users/route.ts']) {
      const body = stripComments(readFileSync(join(ROOT, door), 'utf8'));
      // Inside the `data` of a `create`, and in no update of any kind.
      const call = body.indexOf('systemTheme: newStaffTheme(');
      expect(call, door).toBeGreaterThan(-1);
      const opener = body.lastIndexOf('.create(', call);
      expect(opener, `${door}: الثيم خارج create`).toBeGreaterThan(-1);
      expect(body.slice(opener, call)).not.toMatch(/\.(update|updateMany|upsert)\(/);
    }
  });

  it('— no update, upsert or raw statement anywhere writes the literal theme into a user', () => {
    const offenders: string[] = [];
    for (const f of walk(join(ROOT, 'src')).filter((x) => /\.(ts|tsx)$/.test(x) && !/\.test\.tsx?$/.test(x))) {
      const body = stripComments(readFileSync(f, 'utf8'));
      if (/systemTheme:\s*'layl'|system_theme\s*=\s*'layl'/.test(body)) offenders.push(f.slice(ROOT.length + 1));
    }
    expect(offenders).toEqual([]);
  });

  it('— and no migration backfills it: the column already existed, and existing rows keep what they chose', () => {
    const dir = join(ROOT, 'prisma', 'migrations');
    const sql = walk(dir).filter((f) => f.endsWith('.sql'));
    expect(sql.length).toBeGreaterThan(0);
    for (const f of sql) expect(readFileSync(f, 'utf8'), f).not.toMatch(/layl/);
  });
});
