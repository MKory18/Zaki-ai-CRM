import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from './[file]/route';
import { FONTS } from '@/lib/landing-theme';
import { GOOGLE_FAMILY } from '@/lib/block-look';

/**
 * THE GUARD IS THE WHOLE FEATURE.
 *
 * These faces are licensed for the machine they sit on. The licence permits
 * using them in your own work and forbids putting the file anywhere a third
 * party can fetch it — so the one thing that must be true is that a built,
 * deployed site does not serve them. Not "we remember not to deploy them":
 * the route refuses.
 *
 * A guard with no failing case is a comment. Every one here is the negative.
 */

const req = {} as never;
const at = (file: string) => GET(req, { params: Promise.resolve({ file }) });

afterEach(() => vi.unstubAllEnvs());

describe('a production build does not serve these fonts', () => {
  it('answers 404 for a font that exists on disk', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await at('thmanyah-sans-400.woff2');
    expect(res.status).toBe(404);
  });

  it('refuses before it reads anything, so a missing folder cannot change the answer', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // Every shape of request gets the same 404 in production — there is no
    // input that reaches the filesystem at all.
    for (const name of ['thmanyah-sans-400.woff2', 'anything.woff2', '../../.env']) {
      expect((await at(name)).status, name).toBe(404);
    }
  });
});

describe('outside production it serves names, not paths', () => {
  it('refuses to walk out of the folder', async () => {
    for (const bad of ['../.env', '../../package.json', 'a/b.woff2', '..%2F.env', 'x.woff2/../y']) {
      expect((await at(bad)).status, bad).toBe(404);
    }
  });

  it('refuses anything that is not a woff2', async () => {
    for (const bad of ['thmanyah-sans-400.otf', 'route.ts', 'thmanyah-sans-400', 'x.woff2.ts']) {
      expect((await at(bad)).status, bad).toBe(404);
    }
  });

  it('answers a missing file exactly as it answers a forbidden one', async () => {
    const missing = await at('not-a-real-font-here.woff2');
    const forbidden = await at('../.env');
    expect(missing.status).toBe(forbidden.status);
  });
});

describe('the registry keeps these faces off the published page', () => {
  it('never asks a remote service for one', () => {
    for (const f of FONTS.filter((x) => x.devOnly)) {
      expect(GOOGLE_FAMILY[f.key], f.key).toBeUndefined();
    }
  });

  it('never puts one in the public folder', () => {
    for (const f of FONTS.filter((x) => x.devOnly)) {
      expect(f.local, `${f.key} would be published`).toBeFalsy();
    }
  });

  it('tells the seller in the picker that it will not publish', () => {
    // A font that works while you design and vanishes when you publish is a
    // trap unless the label says so before the click.
    for (const f of FONTS.filter((x) => x.devOnly)) {
      expect(f.note, f.key).toMatch(/محلي/);
    }
  });
});

/**
 * THE NAME ON DISK AND THE NAME IN THE RULE.
 *
 * The @font-face URL is derived from the family name — lowercased, spaces
 * to hyphens — and the files are named to match. When they did not, two of
 * the three families simply drew in Georgia: no error, no 404 anybody saw,
 * just a font silently not being the font. This is that failure, caught
 * where it is cheap.
 */
describe('every machine-local face has the files its rule asks for', () => {
  const WEIGHTS = [300, 400, 500, 700, 900];

  it('finds each weight on disk under the name the CSS will request', async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    for (const f of FONTS.filter((x) => x.devOnly)) {
      const family = f.stack.split(',')[0].replace(/'/g, '').trim();
      const stem = family.toLowerCase().replace(/\s+/g, '-');
      for (const w of WEIGHTS) {
        const name = `${stem}-${w}.woff2`;
        expect(existsSync(join(process.cwd(), 'fonts-local', name)), name).toBe(true);
      }
    }
  });

  it('serves each of them', async () => {
    for (const f of FONTS.filter((x) => x.devOnly)) {
      const family = f.stack.split(',')[0].replace(/'/g, '').trim();
      const stem = family.toLowerCase().replace(/\s+/g, '-');
      for (const w of WEIGHTS) {
        const res = await at(`${stem}-${w}.woff2`);
        expect(res.status, `${stem}-${w}`).toBe(200);
        expect(res.headers.get('content-type')).toBe('font/woff2');
      }
    }
  });
});
