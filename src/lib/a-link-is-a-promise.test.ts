import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canAccessRoute, findRoute } from './route-registry';
import type { SessionUser } from '@/types/auth';

/**
 * A LINK IS A PROMISE THAT CLICKING LEADS SOMEWHERE.
 *
 * `notification.ts` already says this, and drops a link the recipient's
 * own guard would refuse: «The change-request alert sent the holding
 * agent to a queue her role cannot open».
 *
 * The dashboard never learned it. Found with a real session — signed in
 * as `sara@bioderma.com`, a MODERATOR — its cards offered
 *
 *   /confirmation/queue · /ops/tracking · /ops/returns · /admin/users
 *
 * and every one of them landed on «لا تملك صلاحية لهذه الشاشة». The
 * sidebar was right all along: it filters through `canAccessRoute`. Only
 * the screen's own cards did not ask.
 *
 * THE RULE IS NOT WRITTEN TWICE. `canAccessRoute` takes the permission
 * check as a PARAMETER precisely so the sidebar can pass the server's
 * `can` and a screen can pass the client's `userCan`.
 */

const root = process.cwd();
const dashboard = readFileSync(join(root, 'src/components/screens/DashboardScreen.tsx'), 'utf8');

describe('the dashboard offers no door it cannot open', () => {
  it('asks the same question the sidebar asks', () => {
    expect(dashboard).toMatch(/import \{ canAccessRoute, findRoute \} from '@\/lib\/route-registry'/);
    expect(dashboard).toMatch(/canAccessRoute\(currentUser, route, userCan\)/);
  });

  it('and every internal link it draws goes through that question', () => {
    const code = dashboard
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    /*
     * A literal `href="/x"` is allowed only when the same path is also put
     * to the gate somewhere in this file — `mayOpen('/x')` wrapping the
     * element, or `linkTo('/x')` producing the href. Reading the href alone
     * flags the guarded ones; reading the gate alone misses a second,
     * ungated link to the same place.
     */
    const bare = [...code.matchAll(/href="(\/[a-z][\w/-]*)"/g)].map((m) => m[1]);
    const ungated = bare.filter((p) => !code.includes(`mayOpen('${p}')`));
    expect(ungated, `روابطُ لا تسأل إن كان الدورُ يفتحها:\n${ungated.join('\n')}`).toEqual([]);
  });

  it('and the ones it may open are still offered', () => {
    // `linkTo` returns the path when allowed — a gate that returned
    // nothing always would pass the test above and break the screen.
    expect(dashboard).toMatch(/const linkTo = \(path: string\): string \| undefined =>\s*\(mayOpen\(path\) \? path : undefined\)/);
  });
});

/**
 * AND THE RULE ITSELF, EXERCISED — not only its spelling in a file.
 */
describe('canAccessRoute, asked as a screen asks it', () => {
  const moderator = {
    status: 'ACTIVE',
    role: 'MODERATOR',
    permissions: ['orders.view', 'customers.view', 'products.view', 'reports.view'],
  } as unknown as SessionUser;

  const userCan = (u: SessionUser, p: string) =>
    u.role === 'SUPER_ADMIN' || (u.permissions ?? []).includes(p);

  const may = (path: string) => {
    const route = findRoute(path);
    return !!route && canAccessRoute(moderator, route, userCan);
  };

  it('refuses the four the dashboard used to offer a moderator', () => {
    for (const path of ['/confirmation/queue', '/ops/tracking', '/ops/returns', '/admin/users']) {
      expect(may(path), path).toBe(false);
    }
  });

  it('and allows the ones that role really holds', () => {
    for (const path of ['/orders', '/customers', '/products']) {
      expect(may(path), path).toBe(true);
    }
  });

  it('and a path outside the registry is not a door at all', () => {
    expect(may('/nowhere')).toBe(false);
  });
});
