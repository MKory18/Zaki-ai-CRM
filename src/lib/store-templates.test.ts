import { describe, expect, it } from 'vitest';
import { STORE_TEMPLATES, TEMPLATES_PLANNED, templateById } from './store-templates';
import {
  CONTRAST_PAIRS,
  FEATURE_ENGINE,
  TEMPLATE_FONT_KEYS,
  parseStoreSkin,
  resolveSkinPalette,
  skinToLandingTheme,
  skinToStoreTheme,
} from './store-skin';
import { LAYOUT_SLOTS } from './layout-slots';
import { contrastRatio, landingThemeSchema } from './landing-theme';
import { DEFAULT_THEME } from './landing-theme';
import { storeLayoutSchema } from './store-theme';
import { repoFile, stripComments } from './guard-source';

/**
 * THE TEMPLATES THIS PLATFORM SHIPS.
 *
 * Ten skins over one engine — three of them written, and the count is
 * said out loud so nobody reads a short list as a finished one.
 *
 * The contract was built first for exactly this: a template is data, and
 * every rule that matters about it — the contrast, the licence of its
 * faces, the capability it puts forward — is checked before it ships
 * rather than discovered by a seller who installed it.
 */

describe('every shipped template is a real one', () => {
  it('there are some, and the plan says how many there will be', () => {
    expect(STORE_TEMPLATES.length).toBeGreaterThan(0);
    expect(STORE_TEMPLATES.length).toBeLessThanOrEqual(TEMPLATES_PLANNED);
    expect(TEMPLATES_PLANNED).toBe(10);
  });

  /**
   * The module throws on import if one does not parse, so this passing
   * is partly tautological — which is the point. It is here so that the
   * reason is written down beside the list.
   */
  it.each(STORE_TEMPLATES.map((t) => [t.id, t] as const))('«%s» passes the contract', (_id, skin) => {
    const again = parseStoreSkin(JSON.parse(JSON.stringify(skin)));
    expect(again.ok, again.ok ? '' : JSON.stringify(again.errors)).toBe(true);
  });

  it('each has its own id, and can be found by it', () => {
    const ids = STORE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(templateById(id)?.id).toBe(id);
    expect(templateById('nothing')).toBeNull();
  });

  it('and says who it is for, which is a suggestion and not a fence', () => {
    for (const t of STORE_TEMPLATES) {
      expect(t.suggestedFor.length, t.id).toBeGreaterThan(2);
      expect(t.version, t.id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('and a bad one could not be shipped at all', () => {
  /**
   * THE STRONGEST FORM THIS RULE TAKES: `store-templates.ts` parses
   * every template at module load and THROWS, so a template that breaks
   * the contract does not fail a test — it fails the build, and nobody
   * can ship around it.
   *
   * Which makes it unmeasurable by mutation: break a template and the
   * suite never collects. So the rule is proven the other way here, on
   * copies: take a real one, break one thing, and watch the contract
   * refuse it.
   */
  const broken = (patch: (t: Record<string, unknown>) => void) => {
    const copy = JSON.parse(JSON.stringify(STORE_TEMPLATES[0])) as Record<string, unknown>;
    patch(copy);
    return parseStoreSkin(copy);
  };

  it('refuses ink nobody can read', () => {
    const r = broken((t) => {
      (t.palette as Record<string, string>).textPrimary = '#d8e2ea';
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toMatch(/التباين/);
  });

  it('refuses a part nobody built', () => {
    expect(broken((t) => {
      (t.layout as Record<string, string>).productPage = 'carousel3d';
    }).ok).toBe(false);
  });

  it('refuses a capability nothing serves', () => {
    const r = broken((t) => {
      t.feature = 'bundleBuilder';
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toMatch(/لا يخدمها المحرّك/);
  });

  it('refuses an entrance a shopper would wait through', () => {
    expect(broken((t) => {
      (t.motion as Record<string, unknown>).ms = 1500;
    }).ok).toBe(false);
  });

  it('refuses a face we may not publish', () => {
    expect(broken((t) => {
      (t.type as Record<string, string>).body = 'thmanyah';
    }).ok).toBe(false);
  });

  /** And the shipping function really is the one doing the refusing. */
  it('ships nothing it has not parsed', () => {
    const src = stripComments(repoFile('src/lib/store-templates.ts'));
    expect(src).toMatch(/const parsed = parseStoreSkin\(raw\);/);
    expect(src).toMatch(/throw new Error\(/);
    expect(src, 'قالب يُشحن بلا فحص').not.toMatch(/return raw as StoreSkin/);
  });
});

describe('no two are the same shop in different colours', () => {
  /**
   * «ما في قالبين بيتشاركوا نفس الترويسة ونفس البطل ونفس بطاقة المنتج
   * معاً». A seller who tries two and finds the same page learns the
   * feature is decoration — and stops trying the other eight.
   */
  it('no two share a header, a hero and a card all three', () => {
    const shapes = STORE_TEMPLATES.map((t) => `${t.layout.header}/${t.layout.hero}/${t.layout.productCard}`);
    expect(new Set(shapes).size, shapes.join(' | ')).toBe(shapes.length);
  });

  /**
   * NOT «no two share a feature».
   *
   * That was my inference from «كل قالب بيبرز ميزة تسوّق مميّزة», and
   * ten templates over eight served capabilities disproved it. The way
   * to satisfy it would have been to invent two capabilities — which is
   * precisely what this contract exists to stop: «الميزة قدرة بالمحرّك،
   * مش كود بالقالب».
   *
   * So the rule that survives is the one worth having: every capability
   * the engine serves is put forward by somebody. A capability nothing
   * showcases is one no seller will ever discover, and a doubled one
   * beside it is a wasted slot.
   */
  it('shows off every capability the engine has', () => {
    const served = Object.entries(FEATURE_ENGINE)
      .filter(([, engine]) => engine)
      .map(([name]) => name);
    const shown = new Set(STORE_TEMPLATES.map((t) => t.feature));
    expect([...served].filter((f) => !shown.has(f as never)), 'قدرة لا يبرزها أيّ قالب').toEqual([]);
  });

  /** And nothing is put forward that the engine cannot do — again. */
  it('and puts forward nothing else', () => {
    for (const t of STORE_TEMPLATES) expect(FEATURE_ENGINE[t.feature], t.id).toBeTruthy();
  });

  it('and no two are the same colour', () => {
    const accents = STORE_TEMPLATES.map((t) => t.palette.accent.toLowerCase());
    expect(new Set(accents).size).toBe(accents.length);
  });
});

describe('what the contract proved, measured again here', () => {
  /**
   * Not trusting the schema to have run: a template is the one thing in
   * this system a seller installs whole, and the numbers are cheap to
   * check. The customer reading them is often older, often outdoors,
   * on a cheap screen at full brightness.
   */
  it.each(STORE_TEMPLATES.map((t) => [t.id, t] as const))('«%s» is readable', (id, skin) => {
    const palette = resolveSkinPalette(skin);
    for (const pair of CONTRAST_PAIRS) {
      const ratio = contrastRatio(palette[pair.fg], palette[pair.bg]);
      expect(ratio, `${id} — ${pair.what}`).toBeGreaterThanOrEqual(pair.min);
    }
  });

  it.each(STORE_TEMPLATES.map((t) => [t.id, t] as const))('«%s» uses faces we may publish', (id, skin) => {
    expect(TEMPLATE_FONT_KEYS, `${id} heading`).toContain(skin.type.heading);
    expect(TEMPLATE_FONT_KEYS, `${id} body`).toContain(skin.type.body);
  });

  it.each(STORE_TEMPLATES.map((t) => [t.id, t] as const))('«%s» names parts that exist', (id, skin) => {
    for (const [slot, variant] of Object.entries(skin.layout)) {
      expect(LAYOUT_SLOTS[slot as keyof typeof LAYOUT_SLOTS] as readonly string[], `${id}.${slot}`)
        .toContain(variant);
    }
  });

  /**
   * «الميزة قدرة بالمحرّك، مش كود بالقالب». A template naming a
   * capability nothing serves is a page nobody can render.
   */
  it.each(STORE_TEMPLATES.map((t) => [t.id, t] as const))('«%s» puts forward something served', (id, skin) => {
    expect(FEATURE_ENGINE[skin.feature], `${id} — ${skin.feature}`).toBeTruthy();
  });

  it.each(STORE_TEMPLATES.map((t) => [t.id, t] as const))('«%s» moves once, quietly', (id, skin) => {
    expect(skin.motion.repeat, id).toBe(false);
    expect(skin.motion.ms, id).toBeLessThanOrEqual(400);
  });
});

describe('what a shop gets when it installs one', () => {
  it.each(STORE_TEMPLATES.map((t) => [t.id, t] as const))('«%s» lands on the theme', (id, skin) => {
    const written = skinToStoreTheme(skin);
    expect(written.accent, id).toBe(skin.palette.accent);
    expect(written.layout, id).toEqual(skin.layout);
    // The layout it writes is a layout the theme accepts.
    expect(storeLayoutSchema.safeParse(written.layout).success, id).toBe(true);
  });

  /**
   * A SINGLE_PRODUCT shop stays on landing-page structures and takes its
   * look from here. Derived on read, never stored — a copy of a skin's
   * colours in a page's theme column is a second owner.
   */
  it.each(STORE_TEMPLATES.map((t) => [t.id, t] as const))('«%s» exports a landing skin', (id, skin) => {
    const merged = { ...DEFAULT_THEME, ...skinToLandingTheme(skin) };
    expect(landingThemeSchema.safeParse(merged).success, id).toBe(true);
  });

  /**
   * Installing copies only what the template NAMED. A role it left to
   * the derived palette stays derived on the shop, so changing the
   * accent afterwards still changes the shop.
   */
  it('writes no colour a template did not choose', () => {
    for (const skin of STORE_TEMPLATES) {
      const named = Object.keys(skin.palette).filter((k) => k !== 'accent');
      expect(Object.keys(skinToStoreTheme(skin).colors).length, skin.id).toBe(named.length);
    }
  });
});

describe('the imagery guide a photographer could follow', () => {
  it.each(STORE_TEMPLATES.map((t) => [t.id, t] as const))('«%s» says what to shoot and what not to', (id, skin) => {
    expect(skin.imagery.lighting, id).toBeTruthy();
    expect(skin.imagery.background, id).toBeTruthy();
    expect(skin.imagery.ratio, id).toBeTruthy();
    // «وشو ممنوع» — the half that actually stops a grid looking broken.
    expect(skin.imagery.forbid.length, `${id}: بلا ممنوعات`).toBeGreaterThan(0);
  });
});
