import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * «في صلاحيات ظاهرة انها منسوبة لكن بالواقع مش موجودة».
 *
 * Nine screens let COMPANY_ADMIN through BY NAME — `role === 'COMPANY_ADMIN' || permissions.includes(...)` — while the
 * server's `can()` has no such bypass: only SUPER_ADMIN holds everything. So a company admin whose role had a box
 * unticked saw the button, pressed it, and got a refusal. And the browser's `userCan` did not read the aliases the
 * server reads, so it hid buttons the server allowed. The screen now asks the server's question, with the server's
 * table.
 */

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));

import { userCan } from './can';
import { attachGrants, can } from './authorization';
import { ALL_CATALOG_KEYS } from './permission-catalog';
import { LEGACY_ALIAS } from './permission-aliases';
import type { SessionUser } from '@/types/auth';

const person = (role: string, keys: string[]): SessionUser =>
  ({ id: 'u1', name: 'x', email: 'x@x', role, status: 'ACTIVE', companyId: 'c1', permissions: keys }) as unknown as SessionUser;

const onServer = (role: string, keys: string[]) =>
  attachGrants(person(role, keys), {
    fullAccess: role === 'SUPER_ADMIN',
    grants: Object.fromEntries(keys.map((k) => [k, { scope: 'ALL_COMPANY' }])),
  } as never);

describe('the browser gives the server’s answer', () => {
  const asked = [...ALL_CATALOG_KEYS, ...Object.keys(LEGACY_ALIAS)];

  it('for every key and every alias, whatever the role holds', () => {
    const holdings: [string, string[]][] = [
      ['COMPANY_ADMIN', []],
      ['COMPANY_ADMIN', ['orders.edit', 'settings.edit', 'reports.view']],
      ['MANAGER', ['products.edit', 'whatsapp.view']],
      ['SUPER_ADMIN', []],
    ];
    for (const [role, keys] of holdings) {
      for (const key of asked) {
        expect(userCan(person(role, keys), key), `${role} holding [${keys}] asked for ${key}`).toBe(can(onServer(role, keys), key));
      }
    }
  });

  it('an alias reaches its canonical key — the button the server allows is shown', () => {
    expect(userCan(person('MANAGER', ['orders.edit']), 'orders.update')).toBe(true);
  });

  it('NEGATIVE: a company admin with the box unticked is not shown the button the server will refuse', () => {
    expect(userCan(person('COMPANY_ADMIN', []), 'whatsapp.send')).toBe(false);
    expect(can(onServer('COMPANY_ADMIN', []), 'whatsapp.send')).toBe(false);
  });

  it('NEGATIVE: nobody signed in holds nothing', () => {
    expect(userCan(null, 'orders.view')).toBe(false);
  });
});

describe('no screen lets a role through by name', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) files.push(p);
    }
  };
  walk(join(process.cwd(), 'src/components'));

  /*
   * ANY comparison with an all-powerful role name in a screen, on one line or split over two (`const isAdmin = role
   * === 'COMPANY_ADMIN'` above `isAdmin || perms.includes(...)` was three of the nine). The one place allowed is the
   * roles screen's «system roles are edited by the company admin», because the server says exactly that, by name,
   * in api/roles/[id]/route.ts.
   */
  const ALLOWED: Record<string, string> = {
    'PermissionsScreen.tsx': 'system roles are editable by COMPANY_ADMIN — api/roles/[id]/route.ts checks the same name',
  };
  const BY_NAME = /===\s*'(COMPANY_ADMIN|MANAGER)'|'(COMPANY_ADMIN|MANAGER)'\s*===|\[[^\]]*'(COMPANY_ADMIN|MANAGER)'[^\]]*\]\.includes\(/;

  it('compares no role name to decide what a person may do', () => {
    const offenders = files.flatMap((f) => {
      const base = f.split(/[\\/]/).pop()!;
      if (ALLOWED[base]) return [];
      return readFileSync(f, 'utf8')
        .split('\n')
        .filter((line) => BY_NAME.test(line))
        .map((line) => `${base}: ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });

  it('the guard sees the split pattern it exists for', () => {
    expect(BY_NAME.test("  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN';")).toBe(true);
    expect(BY_NAME.test("    ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER'].includes(user.role);")).toBe(true);
    expect(BY_NAME.test("  COMPANY_ADMIN: 'مدير الشركة',")).toBe(false);
  });
});

describe('the alert about a bulk read of customers', () => {
  it('goes to the people who can grant and revoke access — a key that exists', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/pii-alert.ts'), 'utf8');
    const named = src.match(/audience: \{ permission: '([^']+)' \}/)?.[1];
    expect(named).toBe('users.edit');
    expect(ALL_CATALOG_KEYS.has(named!)).toBe(true);
  });
});
