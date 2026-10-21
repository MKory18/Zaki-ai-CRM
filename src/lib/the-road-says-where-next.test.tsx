// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE ROAD IS NUMBERED IN THE MENU; THESE ARE THE NUMBERS' JOB.
 *
 * The owner, 21/10: «الخطوة يتودي للثانية». A parcel's five stops and the
 * courier's money's four are numbered in the sidebar (the registry's
 * `step`), and until now that was all they did: a person on stop 2 was
 * told nothing about stop 3 and had to go back to the menu to find it.
 *
 * Every screen that is a stop now says «الشحن · الخطوة 2 من 5» and offers
 * the next one — derived from the registry, so a stop added or moved
 * changes nine screens without anyone touching one of them.
 * ═══════════════════════════════════════════════════════════════════════
 */

const here = { path: '/ops/preparation' };
const user: { current: any } = { current: null };

vi.mock('next/navigation', () => ({ usePathname: () => here.path }));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ currentUser: user.current }) }));

import { RoadStrip } from '@/components/shell/RoadStrip';
import { roadPosition } from './next-stop';
import { ALL_ROUTES, NAV, findRoute } from './route-registry';
import { dashboardFiles, repoFile, stripComments } from './guard-source';

const everything = () => true;
const nothing = () => false;
const only = (...paths: string[]) => (r: { path: string }) => paths.includes(r.path);

/** A signed-in user holding exactly these permissions. */
const holding = (...permissions: string[]) => ({
  id: 'u1', role: 'WAREHOUSE', status: 'ACTIVE', permissions,
});

beforeEach(() => {
  here.path = '/ops/preparation';
  user.current = holding('ops.prepare', 'ops.ship', 'ops.track', 'ops.returns');
});
afterEach(() => cleanup());

describe('where you are on a road', () => {
  it('— the first stop of five, and the second is the next', () => {
    const at = roadPosition('/ops/preparation', everything)!;
    expect(at.road).toBe('الشحن');
    expect(at.here.step).toBe(1);
    expect(at.of).toBe(5);
    expect(at.next?.path).toBe('/ops/shipments/new');
  });

  it('and the courier’s money is a road of four, ending at the close', () => {
    const first = roadPosition('/finance/agents', everything)!;
    expect(first.road).toBe('المال');
    expect(first.of).toBe(4);
    expect(first.next?.path).toBe('/finance/collection');
    const last = roadPosition('/finance/closing', everything)!;
    expect(last.here.step).toBe(4);
    expect(last.next, 'آخر محطّة بلا «التالي»').toBeNull();
  });

  it('and the last stop of the shipping road has nothing after it', () => {
    expect(roadPosition('/ops/returns', everything)!.next).toBeNull();
  });

  it('and a screen that is not a stop is on no road at all', () => {
    for (const path of ['/orders', '/dashboard', '/finance/wallets', '/finance/profit', '/settings/geo']) {
      expect(roadPosition(path, everything), path).toBeNull();
    }
  });

  it('and an address underneath a stop is still that stop', () => {
    // The same longest-match rule the menu lights an item by.
    expect(roadPosition('/ops/tracking/anything', everything)!.here.path).toBe('/ops/tracking');
  });

  it('and it walks the whole road, one stop at a time, in order', () => {
    const walked: string[] = [];
    let at = roadPosition('/ops/preparation', everything);
    while (at) {
      walked.push(at.here.path);
      at = at.next ? roadPosition(at.next.path, everything) : null;
    }
    expect(walked).toEqual([
      '/ops/preparation', '/ops/shipments/new', '/ops/batches', '/ops/tracking', '/ops/returns',
    ]);
  });
});

describe('the next stop is the IMMEDIATE one, or nothing', () => {
  it('— a person who may open stop 1 and stop 5 is not told stop 5 comes next', () => {
    /*
     * THE CLAIM THAT RULES OUT «THE NEXT STOP YOU MAY OPEN».
     *
     * A warehouse keeper holds the first stop and the last. If «next» were
     * the next stop they can open, packing would end with «التالي:
     * المرتجعات» — a parcel from the shelf straight to returns. Stops 2 to 4
     * are somebody else's job, and saying nothing is the true answer.
     */
    const at = roadPosition('/ops/preparation', only('/ops/preparation', '/ops/returns'))!;
    expect(at.next).toBeNull();
    // …and it still says which stop this is.
    expect(at.here.step).toBe(1);
    expect(at.of).toBe(5);
  });

  it('and nobody is offered a stop they may not open', () => {
    expect(roadPosition('/ops/preparation', nothing)!.next).toBeNull();
  });
});

describe('what the screen draws', () => {
  it('— «الخطوة 1 من 5» and a link to the next stop, on the first stop', () => {
    render(<RoadStrip />);
    const nav = screen.getByRole('navigation', { name: 'مسار العمل' });
    expect(nav.textContent).toContain('الشحن');
    expect(nav.textContent).toMatch(/الخطوة\s*1\s*من\s*5/);
    const link = screen.getByRole('link', { name: /التالي: إنشاء شحنة/ });
    expect(link.getAttribute('href')).toBe('/ops/shipments/new');
  });

  it('and on the last stop it says where you are and offers nothing', () => {
    here.path = '/ops/returns';
    render(<RoadStrip />);
    expect(screen.getByRole('navigation', { name: 'مسار العمل' }).textContent).toMatch(/الخطوة\s*5\s*من\s*5/);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('and a person without the next stop’s permission is shown no link to it', () => {
    user.current = holding('ops.prepare');
    render(<RoadStrip />);
    expect(screen.getByRole('navigation', { name: 'مسار العمل' })).toBeTruthy();
    expect(screen.queryByRole('link'), 'رابط لشاشة ما يفتحها').toBeNull();
  });

  it('and a screen that is not a stop gets no strip', () => {
    here.path = '/orders';
    const { container } = render(<RoadStrip />);
    expect(container.innerHTML).toBe('');
  });

  it('and nobody signed in is offered no link', () => {
    user.current = null;
    render(<RoadStrip />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('and «next» points the way the rest of the product points', () => {
    /*
     * Every directional glyph here is drawn in its LTR sense and turned by
     * `icon-mirror`. The arrow that LOOKS left on this screen is therefore
     * the RIGHT one, flipped — and the left one, flipped, points backwards.
     * `icons.test.ts` insists on the class; this insists on which arrow,
     * which that test cannot know.
     */
    const src = stripComments(repoFile('src/components/shell/RoadStrip.tsx'));
    expect(src).toContain('RiArrowRightLine');
    expect(src, 'السهم اليسار + الانعكاس = يشير للخلف').not.toContain('RiArrowLeftLine');
    expect(src).toMatch(/RiArrowRightLine[^>]*icon-mirror/);
  });
});

describe('and it is wired once, in the shell, not nine times', () => {
  it('— the shell draws it above every screen', () => {
    const shell = stripComments(repoFile('src/components/shell/Shell.tsx'));
    const at = shell.indexOf('<RoadStrip />');
    expect(at, 'الشريط غير موصول بالإطار').toBeGreaterThan(-1);
    // Above the screen, inside <main>.
    expect(at).toBeGreaterThan(shell.indexOf('<main'));
    expect(at).toBeLessThan(shell.indexOf('{children}'));
  });

  it('and no screen draws its own copy — one place in the whole codebase renders it', () => {
    /*
     * Swept over EVERY dashboard file rather than a hand-picked four: the
     * rule is «derived from the registry, not placed per screen», and a
     * list of screens somebody remembered to check is the thing that rule
     * exists to avoid. Nine stops, one component, one caller.
     */
    const drawn = dashboardFiles('.tsx')
      .filter((f) => /<RoadStrip\b/.test(stripComments(f.src)))
      .map((f) => f.rel);
    expect(drawn).toEqual(['/src/components/shell/Shell.tsx']);
  });

  it('and there ARE nine stops for that one place to cover', () => {
    // Pinned so the claim above is not satisfied by a road that vanished.
    expect(ALL_ROUTES.filter((r) => r.step !== undefined)).toHaveLength(9);
  });

  it('and the strip’s steps are the registry’s, so it can never disagree with the menu', () => {
    // Every numbered route has a road position; every other has none.
    for (const route of ALL_ROUTES) {
      const at = roadPosition(route.path, everything);
      if (route.step === undefined) expect(at, route.path).toBeNull();
      else expect(at?.here.step, route.path).toBe(route.step);
    }
    expect(NAV.find((g) => g.key === 'ops')!.routes.every((r) => findRoute(r.path)?.step)).toBe(true);
  });
});
