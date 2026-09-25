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
    expect(perf).toContain("get('tab') === 'landing'");
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
