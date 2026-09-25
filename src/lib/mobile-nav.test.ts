import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BOTTOM_SLOTS, mobileNav } from './mobile-nav';
import type { NavGroup } from './route-registry';

/**
 * A PHONE THAT OPENS ON YOUR OWN JOB.
 *
 * The same five tabs for everybody means a confirmation agent's phone opens
 * on a dashboard she cannot act on, with the one screen she uses four
 * hundred times a day behind a menu. So the tabs come from what this person
 * may open, ordered by how close each screen is to work done standing up.
 */

const group = (key: string, ...paths: string[]): NavGroup => ({
  key,
  label: key,
  routes: paths.map((path) => ({ path, label: path, icon: 'List', permissions: null, stage: null })),
});

const AGENT = [group('confirmation', '/confirmation/mine', '/confirmation/queue', '/confirmation/postponed')];
const OWNER = [
  group('main', '/dashboard', '/orders', '/customers', '/products', '/assistant'),
  group('finance', '/finance/wallets', '/finance/collection'),
  group('settings', '/settings/system', '/settings/geo'),
];

describe('which tabs a person gets', () => {
  it('an agent gets her queue, not a dashboard', () => {
    const { primary } = mobileNav(AGENT);
    expect(primary[0].path).toBe('/confirmation/mine');
    expect(primary.map((r) => r.path)).not.toContain('/dashboard');
  });

  it('work done standing outranks work done sitting', () => {
    const { primary } = mobileNav(OWNER);
    // Collecting money at a counter beats reading a wallet balance.
    expect(primary.map((r) => r.path).indexOf('/finance/collection')).toBeLessThan(
      primary.map((r) => r.path).indexOf('/finance/wallets') === -1 ? 99 : 0
    );
    expect(primary.map((r) => r.path)).toContain('/orders');
  });

  it('never more than the bar holds', () => {
    expect(mobileNav(OWNER).primary.length).toBeLessThanOrEqual(BOTTOM_SLOTS);
  });

  it('a screen nobody classified waits in the sheet rather than taking a slot', () => {
    // Enough classified screens to fill the bar, so the unclassified one
    // has to actually compete for a slot rather than getting one by default.
    const groups = [
      group('main', '/dashboard', '/orders', '/customers', '/products'),
      group('new', '/something/brand-new'),
    ];
    const { primary, rest } = mobileNav(groups);
    expect(primary.map((r) => r.path)).not.toContain('/something/brand-new');
    expect(rest.flatMap((g) => g.routes.map((r) => r.path))).toContain('/something/brand-new');
  });
});

describe('nothing is lost', () => {
  it('every route is either a tab or in the sheet — exactly once', () => {
    const { primary, rest } = mobileNav(OWNER);
    const seen = [...primary.map((r) => r.path), ...rest.flatMap((g) => g.routes.map((r) => r.path))];
    const all = OWNER.flatMap((g) => g.routes.map((r) => r.path));
    expect(seen.sort()).toEqual(all.sort());
  });

  it('and an empty group does not leave an empty heading in the sheet', () => {
    const { rest } = mobileNav([group('confirmation', '/confirmation/mine')]);
    expect(rest).toEqual([]);
  });
});

describe('the page you are on', () => {
  it('is always a tab, even when it did not earn a slot', () => {
    // A tab bar that does not contain the page you are looking at reads as
    // broken, and somebody taps around trying to find where they already are.
    const { primary } = mobileNav(OWNER, '/settings/geo');
    expect(primary.map((r) => r.path)).toContain('/settings/geo');
    expect(primary.length).toBeLessThanOrEqual(BOTTOM_SLOTS);
  });

  it('and a sub-page counts as its screen', () => {
    const { primary } = mobileNav(OWNER, '/settings/geo/countries/5');
    expect(primary.map((r) => r.path)).toContain('/settings/geo');
  });

  it('it does not displace anything when it already had a slot', () => {
    const before = mobileNav(OWNER).primary.map((r) => r.path);
    const after = mobileNav(OWNER, before[0]).primary.map((r) => r.path);
    expect(after).toEqual(before);
  });

  it('and it is still not duplicated into the sheet', () => {
    const { primary, rest } = mobileNav(OWNER, '/settings/geo');
    const inSheet = rest.flatMap((g) => g.routes.map((r) => r.path));
    for (const tab of primary) expect(inSheet).not.toContain(tab.path);
  });
});

/**
 * The requirements that are invisible until somebody is standing in a
 * warehouse holding a phone in one hand.
 */
describe('built for a thumb', () => {
  const nav = () => readFileSync(join(process.cwd(), 'src/components/shell/MobileNav.tsx'), 'utf8');

  it('every target is at least 44px — a tap that misses is a tap made twice', () => {
    const src = nav();
    const targets = (src.match(/<Link|<button/g) ?? []).length;
    const tapped = (src.match(/\$\{TAP\}/g) ?? []).length;
    expect(tapped, 'some target does not carry the 44px minimum').toBe(targets);
  });

  it('the bar clears the home indicator', () => {
    // A tab underneath it is a tab that closes the app instead of opening
    // a screen.
    expect(nav()).toContain('env(safe-area-inset-bottom)');
  });

  it('and the page leaves room for the bar it sits under', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/shell/Shell.tsx'), 'utf8');
    expect(shell).toContain('env(safe-area-inset-bottom)');
    expect(shell).toContain('<MobileNav');
  });
});

/**
 * The rule the whole section rests on: no screen scrolls sideways at 360px.
 * A table can only obey it by being something else on a phone, which is
 * what `Rows` is for.
 */
describe('nothing scrolls sideways', () => {
  function screens(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...screens(p));
      else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(p);
    }
    return out;
  }

  it('no system screen forces a width wider than a phone', () => {
    const offenders: string[] = [];
    for (const file of screens(join(process.cwd(), 'src/components/screens'))) {
      const src = readFileSync(file, 'utf8');
      // A fixed min-width in pixels above a phone's, with no responsive
      // prefix, is a guaranteed sideways scroll at 360.
      for (const m of src.matchAll(/(?<![a-z:-])min-w-\[(\d+)px\]/g)) {
        if (Number(m[1]) > 360) offenders.push(`${file.split(/[\\/]/).pop()}: ${m[0]}`);
      }
      if (/(?<![a-z:-])w-\[\d{4,}px\]/.test(src)) offenders.push(`${file.split(/[\\/]/).pop()}: fixed wide width`);
    }
    expect(offenders, `تمرير أفقي على ٣٦٠ بكسل:\n${offenders.join('\n')}`).toEqual([]);
  });
});
