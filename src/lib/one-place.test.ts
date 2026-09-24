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
