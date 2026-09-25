import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/**
 * A NUMBER HAS ONE SCREEN, AND A FIELD HAS ONE EDITOR.
 *
 * The contract's rule: reading is one place, setting is another, and neither
 * is two places. It is a rule about where files put things, so it is checked
 * against the files — the moment somebody pastes the conversion rate back
 * onto the list "just so it's handy", this fails and says why.
 */

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('landing-page analytics are read on the performance screen', () => {
  it.each([
    'src/components/screens/LandingPagesScreen.tsx',
    'src/components/screens/LandingPageDetailScreen.tsx',
  ])('%s shows no counts of its own', (file) => {
    const src = read(file);
    // The counts came off the API row as viewsCount / ordersCount /
    // conversionRate. Rendering any of them here is the duplicate.
    for (const field of ['viewsCount', 'ordersCount', 'conversionRate']) {
      expect(src, `${file} still renders ${field}`).not.toContain(`lp.${field}`);
    }
  });

  it('the detail screen points at where they are read instead', () => {
    expect(read('src/components/screens/LandingPageDetailScreen.tsx')).toContain(
      '/growth/performance?tab=landing'
    );
  });

  it('and that screen actually opens on that tab', () => {
    const perf = read('src/components/screens/PerformanceScreen.tsx');
    // The link carries ?tab=, the screen reads it and lands on that tab.
    // Asserted as the pair rather than as one exact line, so adding a third
    // tab does not read as the link being broken.
    expect(perf).toContain("URLSearchParams(window.location.search).get('tab')");
    expect(perf).toContain("=== 'landing'");
    expect(perf).toContain('تحليلات صفحات الهبوط');
  });
});

describe('every order edit goes through the one that can answer «why»', () => {
  it('no screen PATCHes an order directly', () => {
    // An edit on company-wide authority is refused with REASON_REQUIRED, and
    // useOrderPatch is what turns that into the question. A call site that
    // skips it is a 400 the person can never get past — which is exactly
    // what three of them were until the review found it.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.test.tsx') || entry.name.endsWith('.test.ts')) continue;
        if (full.endsWith('useOrderPatch.ts')) continue;
        const src = read(full);
        if (!/api\/orders\/\$\{[^}]+\}`,\s*\{\s*\n?\s*method:\s*'PATCH'/m.test(src)) continue;
        // Carrying out an APPROVED change request is the one exemption, and
        // the server grants it: that door already wrote its own reason into
        // the audit, and strayFields refuses anything sent beside the id —
        // so a reason added here would turn a working apply into a 400.
        if (src.includes('changeRequestId')) continue;
        offenders.push(full);
      }
    };
    walk('src/components');
    expect(offenders, 'these must use useOrderPatch').toEqual([]);
  });
});

describe('the store logo and favicon have one editor', () => {
  it('only the identity card writes them', () => {
    // Every other screen that shows a logo shows it; StoreBrandField is the
    // one control that changes it.
    const writers = [
      'src/components/screens/StorefrontsScreen.tsx',
      'src/components/settings/StorefrontSettings.tsx',
      'src/components/screens/SystemSettingsScreen.tsx',
    ].filter((f) => fs.existsSync(f) && read(f).includes('StoreBrandField'));
    expect(writers, 'a second logo/favicon editor appeared').toEqual([]);
    expect(read('src/components/settings/StoreIdentityCard.tsx')).toContain('StoreBrandField');
  });
});

/**
 * A STORE'S ADDRESS HAS ONE EDITOR.
 *
 * It had two. `/store/domain` writes it, checks DNS, and clears
 * `domainVerifiedAt` on every change so a new address starts unverified.
 * The store settings form wrote the same column as a plain string and
 * touched nothing else — so an owner who edited the address there moved
 * the host and left the old tick standing.
 *
 * The dashboard then said "verified" about a domain nobody had looked up,
 * while the customer typing it met an error page. A wrong answer is worse
 * than no answer: nobody investigates a green tick.
 */
describe('the store domain is written in one place', () => {
  it('only the domain route clears and sets the verification', () => {
    const domainRoute = read('src/app/api/store/domain/route.ts');
    expect(domainRoute).toContain('domainVerifiedAt');

    // Anything else that writes `domain` without touching the verification
    // is the fault coming back.
    const geo = read('src/app/api/geo/stores/[id]/route.ts');
    expect(geo).not.toMatch(/data\.domain\s*=/);
  });

  it('the settings schema refuses a domain rather than ignoring one', () => {
    // `.strict()` turns a form that still sends it into a loud 400, not a
    // save that half worked.
    const schemas = read('src/lib/geo-schemas.ts');
    expect(schemas).toContain('.strict()');
    expect(schemas).not.toMatch(/^\s*domain: z\./m);
  });

  it('and the settings form points at the real editor instead of editing', () => {
    const form = read('src/components/settings/StorefrontSettings.tsx');
    expect(form).not.toContain('form.domain');
    expect(form).toContain('/store/domain');
  });
});
