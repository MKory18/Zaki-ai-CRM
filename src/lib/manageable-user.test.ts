import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { repoFile, stripComments } from './guard-source';
import { manageableUserWhere, mayActOnUser, USER_NOT_FOUND } from './manageable-user';

/**
 * «الموظف غير موجود» — REPORTED FOUR TIMES, ON FOUR SCREENS.
 *
 * Each report was fixed where it was seen, and it came back somewhere else,
 * because there was no one place to fix. Four routes under `/api/users/:id`
 * each answered «which user may this admin see» by hand:
 *
 *   the page          `findUnique` plus fifteen inline lines
 *   the profile       `OR: [{ companyId }, { companyId: null }]`
 *   the permissions   its own reading of a null-company target
 *   the geo access    `{ id, companyId }` — which cannot match a user whose
 *                     company is null, and the owner's own SUPER_ADMIN
 *                     account is exactly such a user
 *
 * So the countries-and-stores block on the owner's page answered «المستخدم
 * غير موجود» about the person reading it. The fix is not a fifth patch: it
 * is one function, and a guard that fails the build when a route writes its
 * own again.
 */

const admin = (companyId: string | null, role = 'COMPANY_ADMIN') => ({ role, companyId }) as never;
const OWNER = admin(null, 'SUPER_ADMIN');
const CO = admin('co-1');

describe('who an admin may see', () => {
  /** THE BUG, AS A TEST. */
  it('a company admin sees an unplaced account — including the owner’s', () => {
    const w = manageableUserWhere(CO, 'u1') as { OR?: unknown[] };
    expect(w.OR, 'النطاق ما زال يشترط شركةً على الهدف').toEqual([
      { companyId: 'co-1' },
      { companyId: null },
    ]);
  });

  /** Seeing an unplaced account is how it gets adopted. */
  it('because an account with no company is what a new signup is', () => {
    expect(JSON.stringify(manageableUserWhere(CO, 'u1'))).toContain('"companyId":null');
  });

  it('the platform owner is scoped to nothing at all', () => {
    expect(manageableUserWhere(OWNER, 'u1')).toEqual({ id: 'u1' });
  });

  /**
   * A company admin with no company is a broken session. It resolves to
   * nobody rather than to everybody — the direction a mistake should fail.
   */
  it('and a company admin with no company sees nobody, not everybody', () => {
    const w = manageableUserWhere(admin(null), 'u1') as { companyId?: string };
    expect(w.companyId, 'جلسةٌ مكسورة تفتح كلّ المستخدمين').toBe('__none__');
  });

  /** Confirming that an id exists elsewhere is itself an answer. */
  it('and a stranger is «not found», never «forbidden»', () => {
    expect(USER_NOT_FOUND).toBe('المستخدم غير موجود');
  });
});

describe('and acting is narrower than seeing', () => {
  it('a company admin acts on their own people', () => {
    expect(mayActOnUser(CO, { companyId: 'co-1' })).toBe(true);
  });

  it('never on another company’s', () => {
    expect(mayActOnUser(CO, { companyId: 'co-2' })).toBe(false);
  });

  /** `assignRole` on a pending account IS the adoption. */
  it('and on an unplaced one only to adopt it', () => {
    expect(mayActOnUser(CO, { companyId: null }, { adopting: true })).toBe(true);
    expect(mayActOnUser(CO, { companyId: null }), 'يحذف حساباً خارج شركته').toBe(false);
  });

  it('while the platform owner acts on anybody', () => {
    expect(mayActOnUser(OWNER, { companyId: null })).toBe(true);
    expect(mayActOnUser(OWNER, { companyId: 'co-9' })).toBe(true);
  });

  it('and a session with no company acts on nobody', () => {
    expect(mayActOnUser(admin(null), { companyId: 'co-1' })).toBe(false);
    expect(mayActOnUser(admin(null), { companyId: null }, { adopting: true })).toBe(false);
  });
});

/**
 * THE GUARD THAT STOPS A FIFTH HAND-WRITTEN ANSWER.
 *
 * Every previous fix was correct and local, and the next route was written
 * from the same instinct — «scope it by companyId» — which is right for an
 * order and wrong for a user, because a user may belong to no company.
 */
describe('no route under /api/users writes its own scope', () => {
  const dir = join(process.cwd(), 'src', 'app', 'api', 'users');

  const routes = (): { rel: string; src: string }[] => {
    const out: { rel: string; src: string }[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const full = join(d, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === 'route.ts') {
          out.push({ rel: full.slice(process.cwd().length + 1).replace(/\\/g, '/'), src: stripComments(readFileSync(full, 'utf8')) });
        }
      }
    };
    walk(dir);
    return out;
  };

  it('finds the routes it is guarding', () => {
    expect(routes().length, 'لم يُعثر على مسارات المستخدمين').toBeGreaterThan(3);
  });

  /** The exact shape that has broken four times. */
  it('and none of them looks a user up by `{ id, companyId }`', () => {
    const offenders = routes()
      .filter((r) => /user\.find(First|Unique)\(\{\s*where:\s*\{\s*id[^}]*companyId/.test(r.src))
      .map((r) => r.rel);
    expect(offenders, `نطاقٌ مكتوبٌ بيده:\n${offenders.join('\n')}`).toEqual([]);
  });

  /** And the OR spelled out by hand is the same answer written twice. */
  it('nor spells the company-or-null rule out by hand', () => {
    const offenders = routes()
      .filter((r) => /OR:\s*\[\s*\{\s*companyId[^\]]*\{\s*companyId:\s*null/.test(r.src))
      .map((r) => r.rel);
    expect(offenders, `قاعدةٌ منسوخة:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the ones that look a user up call the shared rule', () => {
    for (const rel of [
      'src/app/api/users/[id]/route.ts',
      'src/app/api/users/[id]/profile/route.ts',
      'src/app/api/users/[id]/geo-access/route.ts',
    ]) {
      const src = stripComments(repoFile(rel));
      expect(src, `${rel} لا يستعمل القاعدة المشتركة`).toMatch(/manageableUserWhere\(|mayActOnUser\(/);
    }
  });
});
