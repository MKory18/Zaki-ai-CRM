import { z } from 'zod';
import {
  DEFAULT_THEME,
  fontValueSchema,
  landingThemeSchema,
  paletteFor,
  paletteVars,
  type FontValue,
  type LandingTheme,
  type Palette,
} from './landing-theme';

/**
 * WHAT A STORE LOOKS LIKE — one owner, one record.
 *
 * The colour engine already exists: one accent, a mood, and a palette
 * derived from them (landing-theme.ts). This does NOT replace it. A store's
 * theme IS a landing theme plus the things only a shop has — a header, a
 * footer, how a price is written, what the checkout asks for, whether a
 * cart bar rides at the bottom of the screen, and what order the home page
 * puts its sections in.
 *
 * WHO OWNS A COLOUR. The store does. A landing page used to carry its own
 * theme, and so did the store, which is two answers to "what colour is this
 * shop" — the same mistake as a currency on the organisation AND on the
 * country. A page's theme is now an OVERRIDE: absent by default, and when
 * present it is that one page departing from its store's template, which
 * the editor says out loud. `themeForPage` below is the only place the two
 * are combined.
 *
 * EVERY COLOUR IS A VARIABLE. The eight the seller can name are emitted as
 * CSS custom properties beside the derived ones; nothing is written as a
 * hex literal in a component. A colour left unset is not a blank — it is
 * the palette's own, derived from the accent, so a seller who sets one
 * colour gets a coherent shop rather than seven holes.
 */

// ─────────────────────────────────────────────────────
// The pieces
// ─────────────────────────────────────────────────────

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'لون غير صالح');

/**
 * The three typefaces of tab «عام».
 *
 * The base `font` on the landing theme stays what it always was: the body
 * face, and the fallback for the other two. Headings and menus are
 * departures from it, so they are absent until the seller sets them —
 * storing a copy of the body font in all three would make changing the body
 * font change nothing.
 */
export const storeFontsSchema = z.object({
  heading: fontValueSchema.optional(),
  menu: fontValueSchema.optional(),
});

/**
 * The named colours. Each optional, each falling back to the derived
 * palette — see storePalette below.
 */
export const storeColorsSchema = z.object({
  primary: hex.optional(),
  secondary: hex.optional(),
  primaryLight: hex.optional(),
  secondaryLight: hex.optional(),
  background: hex.optional(),
  success: hex.optional(),
  warning: hex.optional(),
  danger: hex.optional(),
});

export const storeHeaderSchema = z.object({
  /** Bar height in px. Bounded so a header cannot eat the page. */
  height: z.number().int().min(48).max(160).default(72),
  background: hex.optional(),
  /** Stays at the top as the customer scrolls. */
  sticky: z.boolean().default(true),
});

/**
 * The footer's COPYRIGHT — a line of text, and nothing else.
 *
 * Its LINKS used to be here too. The contract named «روابط التذييل» in the
 * template tab and «التذييل» among the five menus, which is one field with
 * two owners — the thing this whole section exists to stop. The links moved
 * to /store/menus (the FOOTER menu), where they gain an order and a
 * visibility flag; migration 20260925130000_store_menus carried over the
 * ones already saved and removed the key from the theme.
 */
export const storeFooterSchema = z.object({
  copyright: z.string().trim().max(160).default(''),
});

export const storeProductSchema = z.object({
  /** How a price is written: the plain number, or struck-through beside it. */
  priceStyle: z.enum(['plain', 'with_compare']).default('plain'),
  /** Show how many are left. Off by default — a low number can lose a sale. */
  showStock: z.boolean().default(false),
  /** A «-20%» badge on a discounted product. */
  discountBadge: z.boolean().default(true),
  imageOrder: z.enum(['as_uploaded', 'newest_first']).default('as_uploaded'),
});

/** The checkout fields a shop may reorder or require. Identity is the phone. */
export const CHECKOUT_FIELDS = ['name', 'phone', 'altPhone', 'region', 'address', 'note'] as const;
export type CheckoutField = (typeof CHECKOUT_FIELDS)[number];

/**
 * Name, phone, region and address are what a parcel needs to arrive and a
 * COD sale needs to be priced. They cannot be made optional from a settings
 * screen, so they are not offered — a shop that could turn the region off
 * would take orders it cannot price or ship.
 */
export const MANDATORY_CHECKOUT_FIELDS: readonly CheckoutField[] = ['name', 'phone', 'region', 'address'];

export const storeCheckoutSchema = z.object({
  fieldOrder: z.array(z.enum(CHECKOUT_FIELDS)).max(CHECKOUT_FIELDS.length).default([...CHECKOUT_FIELDS]),
  /** Beyond the four that are always required. */
  required: z.array(z.enum(CHECKOUT_FIELDS)).max(CHECKOUT_FIELDS.length).default([]),
  submitText: z.string().trim().max(40).default(''),
  buttonColor: hex.optional(),
  afterOrderMessage: z.string().trim().max(300).default(''),
});

/**
 * The bar that follows the customer up the page with what is in the cart.
 *
 * A Single Product store has no cart, so this is not a setting it can hold —
 * the tab is absent there, not greyed out, and `cartBarApplies` is what both
 * the screen and the server ask.
 */
export const storeCartBarSchema = z.object({
  enabled: z.boolean().default(true),
  label: z.string().trim().max(40).default(''),
});

/**
 * The home page's COVER IMAGE, and nothing about its sections.
 *
 * The order of the sections briefly lived here as `sectionOrder`. It belongs
 * to the page builder (/store/design), where the sections themselves are —
 * an order stored apart from the things it orders is a second owner, and the
 * two drift the first time a section is added anywhere but here.
 */
export const storeHomeSchema = z.object({
  /** Same-origin path only, like the landing theme's page image. */
  coverImage: z.string().regex(/^(|\/[A-Za-z0-9/_.\-]*)$/).max(300).default(''),
});

// ─────────────────────────────────────────────────────
// The whole thing
// ─────────────────────────────────────────────────────

/**
 * A store's theme: the landing theme, plus the shop-only parts.
 *
 * `.partial()` on the additions, not on the base: a store stored before
 * this existed is a valid landing theme and nothing more, and must keep
 * working exactly as it did.
 */
export const storeThemeSchema = landingThemeSchema.extend({
  fonts: storeFontsSchema.optional(),
  colors: storeColorsSchema.optional(),
  header: storeHeaderSchema.optional(),
  footer: storeFooterSchema.optional(),
  product: storeProductSchema.optional(),
  checkout: storeCheckoutSchema.optional(),
  cartBar: storeCartBarSchema.optional(),
  home: storeHomeSchema.optional(),
});

/**
 * The base is stated as `LandingTheme`, not inferred.
 *
 * `fontValueSchema` is a refined `z.string()`, so zod infers `font: string`
 * and the narrow `FontValue` — which every font helper takes — would be
 * lost the moment a theme came from a parse. The runtime check is the
 * refinement; this keeps the compiler's half of the same fact.
 */
export type StoreTheme = LandingTheme &
  Omit<z.infer<typeof storeThemeSchema>, keyof LandingTheme>;

/** A parsed theme, with the font fields carrying the type their rule proves. */
const asStoreTheme = (value: z.infer<typeof storeThemeSchema>): StoreTheme => value as StoreTheme;

export const DEFAULT_STORE_THEME: StoreTheme = {
  ...DEFAULT_THEME,
  fonts: {},
  colors: {},
  header: storeHeaderSchema.parse({}),
  footer: storeFooterSchema.parse({}),
  product: storeProductSchema.parse({}),
  checkout: storeCheckoutSchema.parse({}),
  cartBar: storeCartBarSchema.parse({}),
  home: storeHomeSchema.parse({}),
};

/**
 * The stored JSON, or the house theme.
 *
 * A stored value that fails the schema falls back FIELD BY FIELD rather
 * than whole: a shop that saved a header height this code no longer accepts
 * should lose that height, not its colour and its fonts with it.
 */
export function parseStoreTheme(raw: string | null | undefined): StoreTheme {
  if (!raw) return DEFAULT_STORE_THEME;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_STORE_THEME;
  }
  if (!parsed || typeof parsed !== 'object') return DEFAULT_STORE_THEME;

  const whole = storeThemeSchema.safeParse({ ...DEFAULT_THEME, ...(parsed as object) });
  if (whole.success) return { ...DEFAULT_STORE_THEME, ...asStoreTheme(whole.data) };

  // Piece by piece, keeping whatever still parses.
  const row = parsed as Record<string, unknown>;
  const base = landingThemeSchema.safeParse({ ...DEFAULT_THEME, ...row });
  const out: StoreTheme = {
    ...DEFAULT_STORE_THEME,
    ...(base.success ? (base.data as unknown as LandingTheme) : {}),
  };
  const parts = {
    fonts: storeFontsSchema, colors: storeColorsSchema, header: storeHeaderSchema,
    footer: storeFooterSchema, product: storeProductSchema, checkout: storeCheckoutSchema,
    cartBar: storeCartBarSchema, home: storeHomeSchema,
  } as const;
  for (const [key, schema] of Object.entries(parts)) {
    const got = schema.safeParse(row[key] ?? {});
    if (got.success) (out as unknown as Record<string, unknown>)[key] = got.data;
  }
  return out;
}

// ─────────────────────────────────────────────────────
// Reading it
// ─────────────────────────────────────────────────────

/** Whether the bottom cart bar is a setting this store can even hold. */
export function cartBarApplies(storeType: string | null | undefined): boolean {
  return storeType !== 'SINGLE_PRODUCT';
}

/** The checkout fields this shop shows, in order, with nothing lost or doubled. */
export function checkoutOrder(theme: StoreTheme): CheckoutField[] {
  const wanted = theme.checkout?.fieldOrder ?? [];
  const seen = new Set<CheckoutField>();
  const ordered: CheckoutField[] = [];
  for (const f of wanted) {
    if (!seen.has(f)) { seen.add(f); ordered.push(f); }
  }
  // A field the stored order forgot is appended rather than dropped: the
  // address must not disappear because an older row listed five fields.
  for (const f of CHECKOUT_FIELDS) if (!seen.has(f)) ordered.push(f);
  return ordered;
}

/** Which checkout fields are required — the four that always are, plus the shop's. */
export function requiredCheckoutFields(theme: StoreTheme): CheckoutField[] {
  const chosen = new Set<CheckoutField>(theme.checkout?.required ?? []);
  for (const f of MANDATORY_CHECKOUT_FIELDS) chosen.add(f);
  return CHECKOUT_FIELDS.filter((f) => chosen.has(f));
}

/** The fields a page may depart from its store on. */
const LANDING_THEME_KEYS = Object.keys(landingThemeSchema.shape) as (keyof LandingTheme)[];

/**
 * A page's theme: its store's, unless that page overrides it.
 *
 * The store is the template; an override is one page departing from it, and
 * the editor says so out loud. The merge is FIELD BY FIELD: a page that
 * saved one value this code no longer accepts — a mood renamed, a colour
 * written another way — keeps the rest of what it chose. Refusing the whole
 * override would repaint a live page over one stale field, which is exactly
 * the kind of quiet change nobody would connect to a deploy.
 *
 * A key the theme does not have is dropped rather than carried through: an
 * override is a theme, not a bag of whatever a row happens to hold.
 */
export function themeForPage(
  storeTheme: StoreTheme,
  pageOverride: Partial<LandingTheme> | null | undefined
): LandingTheme {
  if (!pageOverride) return storeTheme;
  let out: LandingTheme = storeTheme;
  for (const key of LANDING_THEME_KEYS) {
    const value = (pageOverride as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const candidate = { ...out, [key]: value };
    if (landingThemeSchema.safeParse(candidate).success) out = candidate as LandingTheme;
  }
  return out;
}

/** The face used for headings / menus, falling back to the body face. */
export function headingFont(theme: StoreTheme): FontValue {
  return (theme.fonts?.heading as FontValue | undefined) ?? theme.font;
}
export function menuFont(theme: StoreTheme): FontValue {
  return (theme.fonts?.menu as FontValue | undefined) ?? theme.font;
}

/**
 * Every variable a shop's pages paint themselves with.
 *
 * The derived palette first — so a colour the seller never named is the one
 * the accent implies — then the named ones on top. Nothing here is a hex
 * literal in a component: a component reads var(--lp-…), and this is the
 * one place the values are decided.
 */
export function storeThemeVars(theme: StoreTheme): Record<string, string> {
  const palette: Palette = paletteFor(theme);
  const vars: Record<string, string> = {
    ...paletteVars(palette),
    '--lp-primary': theme.colors?.primary ?? palette.accent,
    '--lp-secondary': theme.colors?.secondary ?? palette.text,
    '--lp-primary-light': theme.colors?.primaryLight ?? palette.accentTint,
    '--lp-secondary-light': theme.colors?.secondaryLight ?? palette.muted,
    '--lp-success': theme.colors?.success ?? '#00a651',
    '--lp-warning': theme.colors?.warning ?? '#f59e0b',
    '--lp-danger': theme.colors?.danger ?? '#fb323f',
    '--lp-header-h': `${theme.header?.height ?? 72}px`,
    '--lp-header-bg': theme.header?.background ?? palette.cardBg,
  };
  if (theme.colors?.background) {
    vars['--lp-page'] = theme.colors.background;
  }
  return vars;
}
