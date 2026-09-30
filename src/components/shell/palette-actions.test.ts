import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_ROUTES, canAccessRoute, visibleNav } from '@/lib/route-registry';
import { ROLE_PERMISSIONS, type UserRole } from '@/types/auth';
import type { SessionUser } from '@/types/auth';

/**
 * THE GUARD CommandPalette.tsx SAYS IS HERE.
 *
 * Its own note reads: «an action here must be something the registry does
 * NOT name, and `palette-actions.test.ts` refuses any that is». That file
 * did not exist. A comment naming a guard that is not there is worse than
 * no comment: the next person reads the rule as enforced and adds the
 * seventh «شحنة جديدة» to a hand-maintained list.
 *
 * The rule exists because the FIRST version of the list was six actions —
 * «شحنة جديدة», «إغلاق اليوم», «استلام مرتجع» — and every one of them was
 * already a route in the menu under a noun. Not a third group: the second
 * group again, in a second vocabulary, free to drift from the permissions
 * the real routes carry.
 *
 * And the question this pass actually asks: does the palette offer a role
 * anything that role cannot do? The screens come from `visibleNav`, so
 * that is where it is checked — for every role, against the same
 * `canAccessRoute` the guard uses.
 */

const root = process.cwd();
const src = readFileSync(join(root, 'src/components/shell/CommandPalette.tsx'), 'utf8');

/** The `href` of every entry in the ACTIONS list, read off the source. */
function actionHrefs(): string[] {
  const list = src.slice(src.indexOf('const ACTIONS: Action[] = ['));
  const end = list.indexOf('\n];');
  return [...list.slice(0, end).matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
}

describe('an action is never a screen under a verb', () => {
  const hrefs = actionHrefs();

  it('found the list — a sweep over nothing proves nothing', () => {
    expect(src).toContain('const ACTIONS: Action[] = [');
    expect(hrefs.length).toBeGreaterThan(0);
  });

  it('and no action goes where the registry already names a screen', () => {
    const named = hrefs.filter((h) => ALL_ROUTES.some((r) => r.path === h.split('?')[0]));
    expect(
      named,
      `أفعالٌ هي شاشاتٌ بأسماءِ أفعال:\n${named.join('\n')}`
    ).toEqual([]);
  });

  it('and every action either goes somewhere or does something', () => {
    // An entry with neither draws a row that does nothing when pressed.
    const entries = src
      .slice(src.indexOf('const ACTIONS: Action[] = ['))
      .split(/\n  \{\n/)
      .slice(1);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const body = entry.split('\n  },')[0];
      const key = body.match(/key:\s*'([^']+)'/)?.[1] ?? '?';
      expect(/href:|run:/.test(body), `${key}: لا يقود ولا يفعل`).toBe(true);
    }
  });
});

describe('the screens it offers are the ones the account may open', () => {
  const userCan = (u: SessionUser, p: string) =>
    u.role === 'SUPER_ADMIN' || (u.permissions ?? []).includes(p);

  const roles = Object.keys(ROLE_PERMISSIONS) as UserRole[];

  it('found roles to check', () => {
    expect(roles.length).toBeGreaterThan(8);
  });

  for (const role of roles) {
    it(`offers ${role} nothing its own guard would refuse`, () => {
      const user = {
        status: 'ACTIVE',
        role,
        permissions: ROLE_PERMISSIONS[role],
      } as unknown as SessionUser;

      const refused = visibleNav(user, userCan)
        .flatMap((g) => g.routes)
        .filter((r) => !canAccessRoute(user, r, userCan))
        .map((r) => r.path);

      expect(refused, `${role}: شاشاتٌ معروضةٌ ومرفوضة:\n${refused.join('\n')}`).toEqual([]);
    });
  }

  it('and a role with nothing granted is offered only what needs nothing', () => {
    /*
     * Measured, not assumed: a PENDING_USER is offered «الملف الشخصي» and
     * only that. Its `permissions` is null — everyone holds their own
     * profile, the way everyone holds their own password. So the assertion
     * is not «nothing», which would be wrong; it is «nothing that asks for
     * a grant».
     */
    const pending = { status: 'ACTIVE', role: 'PENDING_USER', permissions: [] } as unknown as SessionUser;
    const offered = visibleNav(pending, userCan).flatMap((g) => g.routes);
    const gated = offered.filter((r) => r.permissions?.length);
    expect(gated.map((r) => r.path), 'عُرِض على حسابٍ معلّقٍ ما يحتاج صلاحيّة').toEqual([]);
    expect(offered.map((r) => r.path)).toEqual(['/admin/profile']);
  });
});

describe('and the palette keeps no list of its own', () => {
  it('reads the screens from the groups the server narrowed', () => {
    expect(src).toMatch(/groups: NavGroup\[\]/);
    expect(src).toMatch(/groups\s*\.flatMap|groups\.flatMap/);
  });

  it('and record lookup stays behind the rule it was always behind', () => {
    expect(src).toMatch(/if \(!open \|\| !canSearchRecords/);
  });
});
