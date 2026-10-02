import { describe, expect, it } from 'vitest';
import {
  CONTRAST_PAIRS,
  FORBIDDEN_SKIN_KEYS,
  FEATURE_ENGINE,
  FEATURES_SERVED,
  HOME_SECTIONS,
  SKIN_FEATURES,
  LAYOUT_SLOTS,
  NUMERAL_CSS,
  ROLE_THEME_FIELD,
  ROLE_VAR,
  SKIN_ROLES,
  TEMPLATE_FONTS,
  TEMPLATE_FONT_KEYS,
  parseStoreSkin,
  resolveSkinPalette,
  skinToLandingTheme,
  skinToStoreTheme,
  skinVars,
  type StoreSkin,
} from './store-skin';
import { FONTS, contrastRatio, landingThemeSchema } from './landing-theme';
import { landingSectionSchema } from './landing-sections';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storeColorsSchema, storeThemeVars, DEFAULT_STORE_THEME } from './store-theme';

/**
 * THE TEMPLATE CONTRACT, AND WHETHER IT ACTUALLY REFUSES ANYTHING.
 *
 * Every rule below is tested in both directions. A schema that accepts a
 * bad template is worth nothing, and a schema whose test only ever feeds
 * it good ones has never been seen to refuse — this file has burned that
 * way before, so each guard gets a mutation that must fail AND a
 * neighbour that must still pass.
 */

const ok = (over: Record<string, unknown> = {}): unknown => ({
  id: 'souq-basic',
  name: 'السوق',
  suggestedFor: 'البقالة والمنتجات اليومية',
  version: 1,
  mood: 'clean',
  palette: { accent: '#b8256e' },
  type: { heading: 'changa', body: 'tajawal' },
  shape: { corners: 'soft', borders: 'hairline', shadow: 'soft' },
  layout: {
    header: 'searchFirst',
    hero: 'offerStrip',
    categoryNav: 'chips',
    productCard: 'portrait',
    categoryPage: 'grid2',
    productPage: 'galleryTop',
    cart: 'drawer',
  },
  home: ['announcement', 'hero', 'offers', 'catalog', 'trust'],
  imagery: { lighting: 'bright', background: 'white', ratio: '1:1', forbid: ['خلفيات مزدحمة'] },
  motion: { entrance: 'fade', ms: 180, repeat: false },
  feature: 'deliveryEstimate',
  ...over,
});

const parsed = (over: Record<string, unknown> = {}): StoreSkin => {
  const r = parseStoreSkin(ok(over));
  if (!r.ok) throw new Error('fixture invalid: ' + JSON.stringify(r.errors));
  return r.skin;
};

const refusals = (raw: unknown): string[] => {
  const r = parseStoreSkin(raw);
  return r.ok ? [] : r.errors.map((e) => `${e.path}: ${e.message}`);
};

// ─────────────────────────────────────────────────────

describe('the fixture itself', () => {
  /**
   * THE ANCHOR. Every «this must be refused» below is worth exactly as
   * much as this line: a schema that refuses everything would pass all of
   * them and ship nothing.
   */
  it('a template that breaks no rule is accepted', () => {
    expect(parseStoreSkin(ok())).toMatchObject({ ok: true });
  });
});

describe('contrast — every text on its own background', () => {
  it('refuses ink that cannot be read on the card, and says the ratio', () => {
    const errors = refusals(ok({ palette: { accent: '#b8256e', textPrimary: '#cfd4db' } }));
    expect(errors.join(' | ')).toMatch(/النص على البطاقة/);
    expect(errors.join(' | ')).toMatch(/التباين \d+\.\d+:1/);
  });

  it('refuses button text that cannot be read on the button', () => {
    const errors = refusals(ok({ palette: { accent: '#b8256e', accentContrast: '#a0356c' } }));
    expect(errors.join(' | ')).toMatch(/نص الزر الأساسي/);
  });

  /**
   * THE NEGATIVE CONTROL. A dark ink on a pale card is the same two
   * fields, set to a legal pair. A rule that simply refused any named
   * colour would pass both tests above and fail this one.
   */
  it('accepts a named pair that is actually readable', () => {
    expect(refusals(ok({ palette: { accent: '#0f5132', textPrimary: '#10161f' } }))).toEqual([]);
  });

  /**
   * The rule measures the RESOLVED palette, not what the template wrote.
   * A skin that names three colours and inherits eleven is the normal
   * case, and the inherited ones are the ones nobody looked at.
   */
  it('measures roles the template never named', () => {
    const resolved = resolveSkinPalette(parsed());
    for (const pair of CONTRAST_PAIRS) {
      expect(contrastRatio(resolved[pair.fg], resolved[pair.bg])).toBeGreaterThanOrEqual(pair.min);
    }
  });
});

describe('the five words a skin may not say', () => {
  it.each([
    ['letterSpacing', { shape: { corners: 'soft', borders: 'hairline', shadow: 'soft', letterSpacing: '0.05em' } }],
    ['textTransform', { type: { heading: 'changa', body: 'tajawal', textTransform: 'uppercase' } }],
    ['numerals', { numerals: 'arabic-indic' }],
    ['direction', { direction: 'rtl' }],
  ])('refuses %s by name, with the reason', (key, over) => {
    const errors = refusals(ok(over as Record<string, unknown>));
    expect(errors.some((e) => e.includes(FORBIDDEN_SKIN_KEYS[key]))).toBe(true);
  });

  /**
   * The reason, not a shrug. `.strict()` would already have refused all
   * four — as «unrecognized key», which reads to whoever wrote the
   * template as a typo. These are not typos.
   */
  it('gives a reason that is not zod own wording', () => {
    const errors = refusals(ok({ numerals: 'arabic-indic' }));
    expect(errors.join(' ')).toMatch(/الأرقام غربية جدولية دائماً/);
  });

  it('refuses a key nobody thought of, too', () => {
    expect(refusals(ok({ blurRadius: 4 })).length).toBeGreaterThan(0);
  });

  /** Numerals are a constant the engine emits, not a field anyone sets. */
  it('states the numerals it emits, frozen', () => {
    expect(NUMERAL_CSS.fontVariantNumeric).toContain('tabular-nums');
    expect(Object.isFrozen(NUMERAL_CSS)).toBe(true);
  });
});

describe('typefaces', () => {
  it('refuses a face this site may not publish', () => {
    const devOnly = FONTS.find((f) => f.devOnly);
    expect(devOnly, 'the library still has a devOnly face to test with').toBeTruthy();
    const errors = refusals(ok({ type: { heading: devOnly!.key, body: 'tajawal' } }));
    expect(errors.join(' ')).toMatch(/رخصته مفتوحة/);
  });

  it('refuses a face with no Arabic coverage', () => {
    expect(refusals(ok({ type: { heading: 'rubik', body: 'tajawal' } })).length).toBeGreaterThan(0);
  });

  /** The negative control: a face that IS on the list still passes. */
  it('accepts every face the library flagged', () => {
    for (const key of TEMPLATE_FONT_KEYS) {
      expect(refusals(ok({ type: { heading: key, body: key } })), key).toEqual([]);
    }
  });

  /**
   * TWO FAMILIES, BY SHAPE. The limit is the shape of the object rather
   * than a rule that counts, because a rule that counts can be satisfied
   * by a third family arriving somewhere else.
   */
  it('has nowhere to put a third family', () => {
    expect(
      refusals(ok({ type: { heading: 'changa', body: 'tajawal', accent: 'amiri' } })).length
    ).toBeGreaterThan(0);
  });

  /**
   * The list is a FILTER over the font library, not a copy of it. If this
   * ever has to change because someone added a face, the flag went on the
   * wrong face.
   */
  it('is derived from the library, and every face on it is servable', () => {
    expect(TEMPLATE_FONTS.length).toBeGreaterThan(8);
    for (const f of TEMPLATE_FONTS) {
      expect(f.devOnly, f.key).toBeFalsy();
      expect(Boolean(f.google || f.local), f.key).toBe(true);
    }
    expect(TEMPLATE_FONTS).toEqual(FONTS.filter((f) => f.openArabic));
  });
});

describe('motion', () => {
  it('cannot be made to repeat', () => {
    expect(
      refusals(ok({ motion: { entrance: 'fade', ms: 180, repeat: true } })).length
    ).toBeGreaterThan(0);
  });

  it('cannot outlast a slow connection worth of doubt', () => {
    expect(
      refusals(ok({ motion: { entrance: 'rise', ms: 900, repeat: false } })).length
    ).toBeGreaterThan(0);
  });

  /** The negative control: a legal entrance at a legal speed. */
  it('accepts one quiet entrance', () => {
    expect(refusals(ok({ motion: { entrance: 'rise', ms: 240, repeat: false } }))).toEqual([]);
  });
});

describe('the home page and the layout slots', () => {
  it('refuses the same section twice', () => {
    const errors = refusals(ok({ home: ['offers', 'catalog', 'offers'] }));
    expect(errors.join(' ')).toMatch(/مكرّر/);
  });

  it('refuses an empty home page', () => {
    expect(refusals(ok({ home: [] })).length).toBeGreaterThan(0);
  });

  /**
   * THE FIRST SCREEN CANNOT BE SWITCHED OFF. The storefront this replaces
   * opened on the shop's name three times and not one product; a template
   * that could set `hero: none` would be able to ship that page again.
   */
  it('has no way to remove the hero', () => {
    expect(LAYOUT_SLOTS.hero).not.toContain('none');
    expect(refusals(ok({ layout: { ...(ok() as { layout: object }).layout, hero: 'none' } })).length)
      .toBeGreaterThan(0);
  });

  /** Negative control: every declared variant of every slot is accepted. */
  it('accepts every variant the engine library declares', () => {
    const baseLayout = (ok() as { layout: Record<string, string> }).layout;
    for (const [slot, variants] of Object.entries(LAYOUT_SLOTS)) {
      for (const variant of variants) {
        expect(refusals(ok({ layout: { ...baseLayout, [slot]: variant } })), `${slot}=${variant}`)
          .toEqual([]);
      }
    }
  });

  it('accepts every home section the engine declares', () => {
    expect(refusals(ok({ home: [...HOME_SECTIONS] }))).toEqual([]);
  });

  /**
   * THE SECOND HOME-PAGE SYSTEM THAT IS NOT BEING BUILT.
   *
   * A shop's home page is an ordered `LandingSection[]`, drawn by the
   * block builder and installed by PAGE_TEMPLATES. This list used to be
   * eight names of the contract's own invention — `categories`,
   * `bestSellers`, `brandStory` — which is where a template system turns
   * into a second page system. It is read from the builder's own union,
   * so a section added there is offered here without anyone remembering.
   */
  it('names only sections the block builder actually has', () => {
    const builder = (landingSectionSchema as unknown as {
      options: { shape: { type: { value: string } } }[];
    }).options.map((o) => o.shape.type.value);
    for (const section of HOME_SECTIONS) expect(builder, section).toContain(section);
    // And the three the engine draws itself are not a template's to pick.
    for (const owned of ['footer', 'sticky', 'thankyou']) {
      expect(HOME_SECTIONS as string[], owned).not.toContain(owned);
      expect(refusals(ok({ home: [owned] })).length, owned).toBeGreaterThan(0);
    }
    // The negative control: nothing else was dropped on the way.
    expect(HOME_SECTIONS.length).toBe(builder.length - 3);
  });
});

describe('a feature the engine does not have is not a feature', () => {
  /**
   * «الميزة قدرة بالمحرّك، مش كود بالقالب». The brief lists a facts engine
   * among what already exists — delivered orders, a verified rating, a
   * repeat rate, delivery days per governorate. Measured: the last one
   * exists and is good; the other three do not exist anywhere. A contract
   * that let a template put forward a capability nothing serves would be
   * promising a page nobody can render.
   */
  it('refuses a capability nothing serves, and names it', () => {
    const errors = refusals(ok({ feature: 'bundleBuilder' }));
    expect(errors.join(' ')).toMatch(/لا يخدمها المحرّك بعد/);
  });

  it('accepts the one the engine does serve', () => {
    expect(refusals(ok({ feature: 'deliveryEstimate' }))).toEqual([]);
    expect(FEATURES_SERVED).toContain('deliveryEstimate');
  });

  /**
   * And the map is not a wish. Every module it names is read, and the
   * export it claims has to be there — so the day the cart exists,
   * `quickAdd` cannot be switched on by editing one word.
   */
  it('names modules that exist and export what it claims', () => {
    const root = join(process.cwd(), 'src', 'lib');
    for (const [feature, engine] of Object.entries(FEATURE_ENGINE)) {
      if (!engine) continue;
      const file = join(root, `${engine.module}.ts`);
      expect(existsSync(file), `${feature} → ${engine.module}`).toBe(true);
      expect(readFileSync(file, 'utf8'), `${feature} → ${engine.export}`)
        .toMatch(new RegExp(`export (async )?(function|const) ${engine.export}\\b`));
    }
  });

  it('every feature the contract declares is answered either way', () => {
    for (const f of SKIN_FEATURES) expect(Object.keys(FEATURE_ENGINE)).toContain(f);
  });
});

describe('one owner per colour', () => {
  /**
   * A role whose variable nobody writes is a role the page cannot paint,
   * and a role with two variables is the defect this contract exists to
   * prevent. Both directions, from the list of roles itself.
   */
  it('gives every role exactly one variable, and no variable twice', () => {
    const vars = SKIN_ROLES.map((r) => ROLE_VAR[r]);
    expect(vars.filter(Boolean)).toHaveLength(SKIN_ROLES.length);
    expect(new Set(vars).size).toBe(SKIN_ROLES.length);
  });

  /**
   * THE ONE THAT MATTERS. Every role the skin can name must be a field the
   * shop's theme can actually hold — otherwise installing a template
   * silently drops a colour, and the template looks different on the shop
   * from how it looked in the gallery.
   */
  it('lands every role on a field the store theme accepts', () => {
    for (const role of SKIN_ROLES) {
      const field = ROLE_THEME_FIELD[role];
      if (field === null) continue; // the accent, which is not a colour field
      const probe = storeColorsSchema.safeParse({ [field]: '#123456' });
      expect(probe.success, `${role} → colors.${field}`).toBe(true);
      expect((probe as { data: Record<string, string> }).data[field]).toBe('#123456');
    }
  });

  /** And the accent is not merely missing — it is written somewhere else. */
  it('writes the accent onto the theme, not among the colours', () => {
    expect(ROLE_THEME_FIELD.accent).toBeNull();
    expect(skinToStoreTheme(parsed()).accent).toBe('#b8256e');
  });

  /**
   * Installing copies only what the template NAMED. Copying the resolved
   * value in would freeze it, and changing the accent afterwards would
   * then change nothing.
   */
  it('copies the named colours and leaves the derived ones derived', () => {
    expect(skinToStoreTheme(parsed()).colors).toEqual({});
    expect(skinToStoreTheme(parsed({ palette: { accent: '#0f5132', offerBadge: '#b8256e' } })).colors)
      .toEqual({ offerBadge: '#b8256e' });
  });

  /** The four a catalogue needs, reaching the page through the one emitter. */
  it('paints the new roles through storeThemeVars', () => {
    const plain = storeThemeVars(DEFAULT_STORE_THEME);
    for (const v of ['--store-price', '--store-price-compare', '--store-offer-badge', '--store-surface-2']) {
      expect(plain[v], v).toBeTruthy();
    }
    const named = storeThemeVars({
      ...DEFAULT_STORE_THEME,
      colors: { offerBadge: '#0f5132', textPrimary: '#101010' },
    });
    expect(named['--store-offer-badge']).toBe('#0f5132');
    expect(named['--store-text']).toBe('#101010');
    // The negative control: a role nobody named is still the derived one.
    expect(named['--store-price']).toBe(plain['--store-price']);
  });
});

describe('what a landing page inherits', () => {
  /**
   * DERIVED, NEVER STORED. A SINGLE_PRODUCT shop's whole address is a
   * landing page and must not look like a different business; a copy of
   * the skin's colours sitting in a page's theme column would be a second
   * owner, and the two would part on the first revision.
   */
  it('projects onto exactly the four fields a landing theme owns', () => {
    const skin = parsed();
    expect(skinToLandingTheme(skin)).toEqual({
      accent: '#b8256e',
      mood: 'clean',
      font: 'tajawal',
      corners: 'soft',
    });
  });

  it('produces something a landing theme actually accepts', () => {
    const merged = { ...DEFAULT_STORE_THEME, ...skinToLandingTheme(parsed()) };
    expect(landingThemeSchema.safeParse(merged).success).toBe(true);
  });

  it('follows the skin when the skin changes', () => {
    expect(skinToLandingTheme(parsed({ palette: { accent: '#0f5132' } })).accent).toBe('#0f5132');
  });
});

describe('the gallery card', () => {
  it('can paint a template the shop has not installed', () => {
    const vars = skinVars(parsed({ palette: { accent: '#0f5132', offerBadge: '#b8256e' } }));
    expect(vars['--store-accent']).toBe('#0f5132');
    expect(vars['--store-offer-badge']).toBe('#b8256e');
    // Every role, so a preview is never half-painted.
    for (const role of SKIN_ROLES) expect(vars[ROLE_VAR[role]], role).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('identity', () => {
  it('refuses an id that cannot sit in a URL', () => {
    expect(refusals(ok({ id: 'Souq Basic' })).length).toBeGreaterThan(0);
  });

  it('refuses a version that cannot move forward', () => {
    expect(refusals(ok({ version: 0 })).length).toBeGreaterThan(0);
  });

  /** «مقترح لـ» is a suggestion and must be said; it is never a restriction. */
  it('requires the suggestion badge to say something', () => {
    expect(refusals(ok({ suggestedFor: '' })).length).toBeGreaterThan(0);
  });
});
