import { z } from 'zod';
import {
  FONTS,
  STATE_COLORS,
  contrastRatio,
  paletteFor,
  type LandingTheme,
  type ThemeFont,
} from './landing-theme';
import { landingSectionSchema, newSection, type LandingSection, type SectionType } from './landing-sections';
import { LAYOUT_SLOTS } from './layout-slots';
export { LAYOUT_SLOTS, type LayoutSlot } from './layout-slots';

/**
 * THE TEMPLATE CONTRACT — what a store template is allowed to be.
 *
 * Ten templates are one engine wearing ten skins. A skin carries LOOK and
 * LAYOUT only: colours, two typefaces, shapes, which variant of each engine
 * component to draw, how photographs should be shot, one quiet entrance,
 * and which shopping capability it puts in front. No selling logic. Price,
 * offers, cart, order, search, filters, guards, attribution and events are
 * the engine's, shared by all ten — a skin that could change any of them
 * would be a tenth copy of the shop to keep in step.
 *
 * WHY THIS IS NOT A SECOND THEME SYSTEM. A store already has a theme — the
 * seller's own, in store-theme.ts, which is a landing theme plus the shop's
 * settings. A skin does not replace it and does not emit beside it. It sits
 * UNDER it, as the middle of three layers:
 *
 *     derived palette  →  the skin  →  the colours the seller named
 *
 * `storeThemeVars` is still the only function that writes a CSS variable,
 * and every role below resolves to a variable that already had one owner.
 * Three of them are new because a catalogue needs three things a landing
 * page never did: a third surface, a price, and the price it replaced.
 *
 * WHAT THE SKIN MAY NOT SAY. Direction is not here: it is derived from the
 * shop's language (`directionOf`), and a template that carried `rtl` would
 * be a template that breaks the moment a shop is written in French.
 * Numerals are not here either — western and tabular, always, so a column
 * of prices lines up. Letter-spacing and text-transform are not here and
 * never will be: Arabic is a joined script, and tracking it apart or
 * «uppercasing» it produces something between a mistake and nonsense. Each
 * of those is refused BY NAME, with the reason, rather than falling out of
 * a generic «unknown key».
 *
 * THE LANDING PAGES. A SINGLE_PRODUCT shop stays on landing-page structures
 * and takes its look from here: `skinToLandingTheme` projects the skin onto
 * the four fields a landing theme owns. It is DERIVED on read, never stored
 * — a copy of a skin's colours sitting in a page's theme column is a second
 * owner, and the two would part company the first time a template is
 * revised.
 */

// ─────────────────────────────────────────────────────
// The faces a template may be built on
// ─────────────────────────────────────────────────────

/**
 * Arabic-covering, open licence, servable — the filter and nothing more.
 *
 * The facts live on the font library itself (`openArabic` in FONTS), so a
 * face added there is either offered to templates or is not. A hand-kept
 * list here would be a second answer to «which faces may we publish», and
 * it would fall behind on the first addition.
 */
export const TEMPLATE_FONTS = FONTS.filter((f) => f.openArabic);
export const TEMPLATE_FONT_KEYS: ThemeFont[] = TEMPLATE_FONTS.map((f) => f.key);

const templateFont = z
  .string()
  .refine((v) => (TEMPLATE_FONT_KEYS as string[]).includes(v), {
    message: 'خط غير مسموح لقالب — يجب أن يدعم العربية ورخصته مفتوحة',
  });

/**
 * Western, tabular, always — not a field a skin may set.
 *
 * A price column whose digits are different widths does not line up, and a
 * shop that writes ٱلأرقام in Arabic-Indic on one template and 1234 on the
 * next has two number systems in one catalogue. The engine emits this on
 * every page; the contract's part is to make it unsettable.
 */
export const NUMERAL_CSS: Readonly<Record<string, string>> = Object.freeze({
  fontVariantNumeric: 'tabular-nums lining-nums',
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
});

// ─────────────────────────────────────────────────────
// The colour roles
// ─────────────────────────────────────────────────────

/**
 * Every colour a catalogue page paints with, named by the JOB it does.
 *
 * Named by role and not by tone, because «the red one» is not a decision a
 * template can make for a shop it has never seen. A danger red and a sale
 * badge are the same colour in most palettes and must be separable in one:
 * a shop whose brand IS red needs its «-20%» badge to be something else.
 */
export const SKIN_ROLES = [
  'surface0',
  'surface1',
  'surface2',
  'textPrimary',
  'textSecondary',
  'border',
  'accent',
  'accentContrast',
  'price',
  'priceCompare',
  'offerBadge',
  'success',
  'warning',
  'danger',
] as const;
export type SkinRole = (typeof SKIN_ROLES)[number];

/**
 * The variable each role is written to.
 *
 * Eleven of the fourteen already existed under these names and keep them —
 * renaming 251 usages to give the same colour a second spelling is the
 * duplication this file exists to avoid. The three that are new
 * (`surface-2`, `price`, `price-compare`, `offer-badge`) are roles a
 * landing page genuinely never had.
 */
export const ROLE_VAR: Readonly<Record<SkinRole, string>> = Object.freeze({
  surface0: '--store-page',
  surface1: '--store-card',
  surface2: '--store-surface-2',
  textPrimary: '--store-text',
  textSecondary: '--store-muted',
  border: '--store-border',
  accent: '--store-accent',
  accentContrast: '--store-accent-text',
  price: '--store-price',
  priceCompare: '--store-price-compare',
  offerBadge: '--store-offer-badge',
  success: '--store-success',
  warning: '--store-warning',
  danger: '--store-danger',
});

/**
 * Where each role is WRITTEN when a template is installed.
 *
 * Twelve of the fourteen are a field on `storeColorsSchema` under the same
 * name. Two are not, and they are the interesting ones:
 *
 * · `surface0` is the store theme's `background` — the page's colour had
 *   one owner already, under the name it has had since before roles
 *   existed. A second field meaning the same colour is the defect this
 *   whole file is organised against.
 * · `accent` is not a colour field at all. It is `theme.accent`, the one
 *   colour the entire palette is derived from, and it sits on the landing
 *   theme rather than beside the named colours. `skinToStoreTheme` writes
 *   it there, so it is `null` here rather than absent — the difference
 *   between «handled elsewhere» and «forgotten» is worth spelling.
 */
export const ROLE_THEME_FIELD: Readonly<Record<SkinRole, string | null>> = Object.freeze({
  surface0: 'background',
  surface1: 'surface1',
  surface2: 'surface2',
  textPrimary: 'textPrimary',
  textSecondary: 'textSecondary',
  border: 'border',
  accent: null,
  accentContrast: 'accentContrast',
  price: 'price',
  priceCompare: 'priceCompare',
  offerBadge: 'offerBadge',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
});

/**
 * Every text-on-background pair the contract measures, and the floor.
 *
 * 4.5:1 is WCAG AA for body text, and the brief's own number. The customer
 * this shop sells to is often older, often outdoors, and often on a cheap
 * screen at full brightness — the ratio is not a formality here.
 */
export const CONTRAST_PAIRS: readonly { fg: SkinRole; bg: SkinRole; min: number; what: string }[] =
  Object.freeze([
    { fg: 'textPrimary', bg: 'surface0', min: 4.5, what: 'النص على خلفية الصفحة' },
    { fg: 'textPrimary', bg: 'surface1', min: 4.5, what: 'النص على البطاقة' },
    { fg: 'textPrimary', bg: 'surface2', min: 4.5, what: 'النص على السطح الثالث' },
    { fg: 'textSecondary', bg: 'surface1', min: 4.5, what: 'النص الثانوي على البطاقة' },
    { fg: 'accentContrast', bg: 'accent', min: 4.5, what: 'نص الزر الأساسي' },
    { fg: 'price', bg: 'surface1', min: 4.5, what: 'السعر على البطاقة' },
    { fg: 'priceCompare', bg: 'surface1', min: 4.5, what: 'السعر قبل الخصم' },
  ]);

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'لون غير صالح');

/**
 * The accent is the only colour a skin MUST name. Everything else falls
 * back to the palette derived from it, so a skin that names one colour is
 * a whole coherent shop rather than thirteen holes.
 */
export const skinPaletteSchema = z
  .object({
    accent: hex,
    surface0: hex.optional(),
    surface1: hex.optional(),
    surface2: hex.optional(),
    textPrimary: hex.optional(),
    textSecondary: hex.optional(),
    border: hex.optional(),
    accentContrast: hex.optional(),
    price: hex.optional(),
    priceCompare: hex.optional(),
    offerBadge: hex.optional(),
    success: hex.optional(),
    warning: hex.optional(),
    danger: hex.optional(),
  })
  .strict();

// ─────────────────────────────────────────────────────
// Type, shape, layout, imagery, motion
// ─────────────────────────────────────────────────────

/**
 * Two families, at most — headings and body, and they may be the same face.
 *
 * The limit is the shape of this object rather than a rule that counts,
 * because a rule that counts can be satisfied by a third family arriving
 * somewhere else. Latin fallbacks are not a third choice: every stack in
 * the library already ends in one.
 */
export const skinTypeSchema = z
  .object({
    heading: templateFont,
    body: templateFont,
  })
  .strict();

export const skinShapeSchema = z
  .object({
    /** The landing theme's own vocabulary — `--store-radius` is derived from it. */
    corners: z.enum(['soft', 'sharp']),
    borders: z.enum(['hairline', 'solid', 'none']),
    shadow: z.enum(['none', 'soft', 'lifted']),
  })
  .strict();

/**
 * WHICH VARIANT OF EACH ENGINE COMPONENT THIS SKIN DRAWS.
 *
 * Every value is a name from the engine's parts catalogue — see
 * layout-slots.ts, and the note there on why the catalogue is its own
 * module rather than living here. Nothing in this object is a component;
 * it is a choice among components, and that is the whole difference
 * between ten templates and ten codebases.
 */

/**
 * `hero` has no «none».
 *
 * The first screen of the current storefront carries the shop's name three
 * times and not one product, not one offer, not one category. A template
 * that could switch the hero off would be able to ship that page again.
 */
export const skinLayoutSchema = z
  .object({
    header: z.enum(LAYOUT_SLOTS.header),
    hero: z.enum(LAYOUT_SLOTS.hero),
    categoryNav: z.enum(LAYOUT_SLOTS.categoryNav),
    productCard: z.enum(LAYOUT_SLOTS.productCard),
    categoryPage: z.enum(LAYOUT_SLOTS.categoryPage),
    productPage: z.enum(LAYOUT_SLOTS.productPage),
    cart: z.enum(LAYOUT_SLOTS.cart),
  })
  .strict();

/**
 * THE HOME PAGE'S SECTIONS ARE THE ONES THAT ALREADY EXIST.
 *
 * A shop's home page is an ordered `LandingSection[]` in `store.homeDraft`,
 * drawn by the block builder and installed by PAGE_TEMPLATES. This list
 * used to be eight names of my own — `categories`, `bestSellers`,
 * `newArrivals`, `brandStory`, `contact` — which is a second set of
 * section names for the same page, and the point at which a template
 * system becomes a second home-page system.
 *
 * Read from the union itself, so a section added to the builder is
 * offered to templates without anyone remembering to add it here. A
 * catalogue strip is the `catalog` block, which already knows how to show
 * categories, a limit, and prices.
 */
const ENGINE_OWNED: ReadonlySet<string> = new Set([
  // Drawn by the engine on every page — the locked core, not a choice.
  'footer',
  // The bottom cart bar: `cartBar` in the store's own settings.
  'sticky',
  // Belongs to the thank-you page.
  'thankyou',
]);

export const HOME_SECTIONS: SectionType[] = (
  landingSectionSchema as unknown as { options: { shape: { type: { value: SectionType } } }[] }
).options
  .map((o) => o.shape.type.value)
  .filter((t) => !ENGINE_OWNED.has(t));

export type HomeSection = SectionType;

/**
 * HOW THIS TEMPLATE'S PHOTOGRAPHS SHOULD BE SHOT — advice with teeth.
 *
 * A template is a promise about a page that has not been filled in yet. The
 * one thing that breaks that promise every time is the seller's own
 * photographs: four products shot on four backgrounds in four lightings is
 * a grid that looks broken no matter how good the grid is. So the skin says
 * what it was designed for, the upload screen can say it back, and
 * `forbid` is the short list of what actually ruins this particular look.
 */
export const skinImagerySchema = z
  .object({
    lighting: z.enum(['bright', 'natural', 'moody', 'studio']),
    background: z.enum(['white', 'neutral', 'scene', 'colour']),
    ratio: z.enum(['1:1', '4:5', '3:4', '16:9']),
    forbid: z.array(z.string().trim().min(2).max(40)).max(6).default([]),
  })
  .strict();

/**
 * ONE QUIET ENTRANCE, AND NOTHING THAT REPEATS.
 *
 * `repeat` is a literal `false` rather than a boolean anyone may set. A
 * pulse, a bounce, a shimmer on a «-20%» badge — each of them costs frames
 * on the mid-range Android this shop is read on, and each of them keeps
 * costing them for as long as the page is open. The ceiling on `ms` is the
 * other half: an entrance slower than that reads as a page that has not
 * finished loading, on a connection where that is a live worry.
 */
export const skinMotionSchema = z
  .object({
    entrance: z.enum(['fade', 'rise', 'none']),
    ms: z.number().int().min(120).max(400),
    repeat: z.literal(false),
  })
  .strict();

/**
 * The shopping capabilities a skin may put in front.
 *
 * Every one of these is the ENGINE's: any template can turn any of them on,
 * and the skin decides only which one is prominent. A capability
 * implemented inside a template would be a capability the other nine
 * cannot have.
 */
export const SKIN_FEATURES = [
  'quickAdd',
  /**
   * «تسوّق حسب المشكلة» · «تسوّق حسب العمر» — two names for one
   * capability, and not a new one: it is a category's own question
   * («مناسب لـ», «الفئة العمرية») turned into the way in. What a
   * template chooses is which question leads.
   */
  'shopByNeed',
  /** «ترتيب الأكثر مبيعاً» — a numbered list, from delivered orders only. */
  'bestSellersRank',
  'compare',
  'bundleBuilder',
  'sizeHelper',
  'ingredientLens',
  'deliveryEstimate',
  'reorder',
  'giftNote',
  'stockNote',
  'whatsappAsk',
] as const;
export type SkinFeature = (typeof SKIN_FEATURES)[number];

/**
 * WHAT ACTUALLY SERVES EACH FEATURE, OR NOTHING.
 *
 * The brief lists a «محرّك الحقائق» among the things that already exist:
 * delivered orders, a rating from verified orders, a repeat-purchase rate,
 * and delivery days per governorate. Measured — the last one exists and is
 * good (`delivery-time.ts`, a median and percentiles, and it refuses to
 * promise a date from fewer than five deliveries). The other three do not
 * exist anywhere; `deliveredCount` appears twice in the repository and
 * both are local variables in unrelated sums.
 *
 * So the map is the record, and the schema is what makes the record
 * binding: a template may only put forward a capability something serves.
 * `null` is «nothing serves this yet», and the day one does, this is one
 * line and the feature becomes selectable. A test reads each module named
 * here and checks the export is really there, so the map cannot quietly
 * become a wish.
 */
export const FEATURE_ENGINE: Readonly<
  Record<SkinFeature, { module: string; export: string } | null>
> = Object.freeze({
  deliveryEstimate: { module: 'delivery-time', export: 'deliveryWindows' },
  // The cart exists: a product card can put one thing in it in a tap.
  quickAdd: { module: 'cart', export: 'addToCart' },
  /**
   * A category's own questions, turned into the way in. Not a new
   * capability — `facetsFor` has drawn them since the attributes
   * shipped; what a template chooses is which question leads.
   */
  shopByNeed: { module: 'product-attributes', export: 'facetsFor' },
  sizeHelper: { module: 'product-attributes', export: 'facetsFor' },
  ingredientLens: { module: 'product-attributes', export: 'matchesAttributes' },
  /** Delivered orders, above the sample floor, or nothing at all. */
  bestSellersRank: { module: 'store-facts', export: 'bestSellers' },
  compare: null,
  bundleBuilder: null,
  /**
   * «أرقام المخزون من الجرد» — the real remaining count, never an
   * invented scarcity. The urgency block has read it from the stock
   * ledger all along; what was missing was saying so here.
   */
  stockNote: { module: 'reservation', export: 'availableStock' },
  /** The shop's own WhatsApp, built in one place. */
  whatsappAsk: { module: 'store-contact', export: 'whatsappHref' },
  reorder: null,
  giftNote: null,
});

/** The features a template may actually put forward today. */
export const FEATURES_SERVED: SkinFeature[] = SKIN_FEATURES.filter((f) => FEATURE_ENGINE[f]);

// ─────────────────────────────────────────────────────
// The keys a skin is refused for carrying
// ─────────────────────────────────────────────────────

/**
 * Refused by name, with the reason.
 *
 * `.strict()` already refuses an unknown key, but it refuses it as «مفتاح
 * غير معروف» — which reads, to whoever wrote the template, as a typo. These
 * are not typos. They are the five things a designer reaches for first and
 * that this product has decided against, so each one answers with the
 * decision instead of with a shrug.
 */
export const FORBIDDEN_SKIN_KEYS: Readonly<Record<string, string>> = Object.freeze({
  letterSpacing: 'لا تباعد أحرف — العربية خط متّصل، وتباعد حروفه يفكّ الكلمة',
  tracking: 'لا تباعد أحرف — العربية خط متّصل، وتباعد حروفه يفكّ الكلمة',
  textTransform: 'لا تحويل حالة — العربية بلا حالة أحرف، والتحويل يفسد اللاتيني المخلوط',
  numerals: 'الأرقام غربية جدولية دائماً — ليست خياراً للقالب',
  direction: 'الاتجاه مشتقّ من لغة المتجر، ولا يُخزَّن في القالب',
  dir: 'الاتجاه مشتقّ من لغة المتجر، ولا يُخزَّن في القالب',
});

/** Every key anywhere in the value, however deep. */
function keysWithin(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) keysWithin(v, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      keysWithin(v, out);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────
// The whole thing
// ─────────────────────────────────────────────────────

const base = z
  .object({
    /** Stable, lowercase, and part of a URL — it is how a shop says which. */
    id: z.string().regex(/^[a-z][a-z0-9-]{2,29}$/, 'معرّف غير صالح'),
    name: z.string().trim().min(2).max(40),
    /** The «مقترح لـ» badge. A suggestion, never a restriction. */
    suggestedFor: z.string().trim().min(2).max(60),
    /** Rises when the shipped template changes, so an installed copy can say it is behind. */
    version: z.number().int().min(1),
    /** The landing theme's own vocabulary, so the exported skin needs no translation. */
    mood: z.enum(['clean', 'warm', 'bold', 'calm']),
    palette: skinPaletteSchema,
    type: skinTypeSchema,
    shape: skinShapeSchema,
    layout: skinLayoutSchema,
    home: z.array(z.enum(HOME_SECTIONS as [SectionType, ...SectionType[]]))
      .min(1)
      .max(HOME_SECTIONS.length),
    imagery: skinImagerySchema,
    motion: skinMotionSchema,
    feature: z.enum(SKIN_FEATURES),
  })
  .strict();

/**
 * The two typefaces are stated as `ThemeFont`, not inferred.
 *
 * `templateFont` is a refined `z.string()`, so zod infers `body: string`
 * and `paletteFor` — which takes the narrow `FontValue` — would stop
 * accepting it. The refinement is the runtime check; this is the
 * compiler's half of the same fact. store-theme.ts states `StoreTheme`
 * the same way and says why.
 */
export type StoreSkin = Omit<z.infer<typeof base>, 'type'> & {
  type: { heading: ThemeFont; body: ThemeFont };
};

/**
 * The contract as one schema: the shape, the named refusals, no repeated
 * home section, and every text pair readable.
 *
 * The contrast check runs on the RESOLVED palette and not on what the skin
 * wrote, because a skin that names three colours and inherits eleven is the
 * normal case — and the inherited ones are exactly the ones nobody looked
 * at.
 */
export const storeSkinSchema = base
  .superRefine((skin, ctx) => {
    const seen = new Set<HomeSection>();
    skin.home.forEach((section, i) => {
      if (seen.has(section)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `قسم «${section}» مكرّر في الرئيسية`,
          path: ['home', i],
        });
      }
      seen.add(section);
    });

    if (!FEATURE_ENGINE[skin.feature]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `«${skin.feature}» لا يخدمها المحرّك بعد — لا قالب يقدر أن يبرزها`,
        path: ['feature'],
      });
    }

    const resolved = resolveSkinPalette(skin as StoreSkin);
    for (const pair of CONTRAST_PAIRS) {
      const ratio = contrastRatio(resolved[pair.fg], resolved[pair.bg]);
      if (ratio < pair.min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${pair.what}: التباين ${ratio.toFixed(2)}:1 وأقلّ مقبول ${pair.min}:1`,
          path: ['palette', pair.fg],
        });
      }
    }
  });

/**
 * Every role's colour: derived from the accent, then whatever the skin named.
 *
 * Takes the loose shape rather than a parsed `StoreSkin` because the schema
 * calls it DURING validation — a contrast rule that could only run on a
 * value that had already passed validation would never refuse anything.
 */
export function resolveSkinPalette(skin: {
  mood: StoreSkin['mood'];
  palette: Partial<Record<SkinRole, string>> & { accent: string };
  type: { body: ThemeFont };
  shape: { corners: 'soft' | 'sharp' };
}): Record<SkinRole, string> {
  const p = paletteFor({
    accent: skin.palette.accent,
    mood: skin.mood,
    font: skin.type.body,
    corners: skin.shape.corners,
  });

  const derived: Record<SkinRole, string> = {
    surface0: p.pageBg,
    surface1: p.cardBg,
    surface2: p.surface2,
    textPrimary: p.text,
    textSecondary: p.muted,
    border: p.border,
    accent: p.accent,
    accentContrast: p.accentText,
    // A price is read, not decorated: it is the page's own ink until a
    // template says otherwise, and the price it replaced is the muted one.
    price: p.text,
    priceCompare: p.muted,
    // The badge is the brand's colour, not the danger red. A discount is
    // good news, and a shop whose accent IS red still needs the two apart.
    offerBadge: p.accent,
    success: STATE_COLORS.success,
    warning: STATE_COLORS.warning,
    danger: STATE_COLORS.danger,
  };

  const out = { ...derived };
  for (const role of SKIN_ROLES) {
    const named = skin.palette[role];
    if (named) out[role] = named;
  }
  return out;
}

/**
 * The skin's colours as the variables the pages already read — FOR A
 * PREVIEW, not for a live shop.
 *
 * A live shop paints from `storeThemeVars`, and there is no second
 * resolution order at paint time: installing a template writes the shop's
 * theme, which is what this repo already does with PAGE_TEMPLATES. This is
 * for the gallery card, where a template has to be shown in its own
 * colours by a shop that has not installed it and may never.
 */
export function skinVars(skin: StoreSkin): Record<string, string> {
  const resolved = resolveSkinPalette(skin);
  const vars: Record<string, string> = {};
  for (const role of SKIN_ROLES) vars[ROLE_VAR[role]] = resolved[role];
  return vars;
}

/**
 * THE SKIN A LANDING PAGE WEARS — derived, never stored.
 *
 * A SINGLE_PRODUCT shop's whole address is a landing page, and it should
 * not look like a different business from the catalogue templates. These
 * are the four fields a landing theme owns; everything else a skin carries
 * is about pages a landing page does not have.
 *
 * Returned as a `Partial<LandingTheme>` so it can go straight through
 * `themeForPage`, which is the one place a page's look and a store's look
 * are combined.
 */
export function skinToLandingTheme(skin: StoreSkin): Partial<LandingTheme> {
  return {
    accent: skin.palette.accent,
    mood: skin.mood,
    font: skin.type.body,
    corners: skin.shape.corners,
  };
}

/**
 * WHAT INSTALLING THIS TEMPLATE WRITES ON THE SHOP.
 *
 * Installing copies. It does not leave a pointer for the renderer to
 * follow: this repo's templates already work that way, the seller edits
 * what a template gave them afterwards in the ordinary panels, and a
 * shop whose colours lived half in a template and half in its own theme
 * would have two answers to every one of them.
 *
 * ONLY THE COLOURS THE SKIN ACTUALLY NAMED are written. A role the skin
 * left to the derived palette stays derived on the shop too — copying the
 * resolved value in would freeze it, and changing the accent afterwards
 * would then change nothing.
 *
 * The caller writes this into the DRAFT. A template is a thing to try.
 */
/**
 * A SKIN'S HOME PAGE, AS SECTIONS A SELLER CAN THEN EDIT.
 *
 * `skin.home` is a list of section TYPES — the order a template proposes,
 * not a page. This turns it into real sections through `newSection`, which
 * is the same helper `buildTemplate` uses for the fifteen page shapes, so a
 * home page started from a skin and one started from a page template are
 * the same kind of thing afterwards and the panels edit both.
 *
 * It deliberately does NOT carry words. A template that wrote headlines
 * would put a stranger's sentences in a seller's shop, and the seller would
 * find them live.
 */
export function skinToSections(skin: StoreSkin): LandingSection[] {
  return skin.home.map((type) => newSection(type));
}

export function skinToStoreTheme(skin: StoreSkin): {
  accent: string;
  mood: StoreSkin['mood'];
  font: ThemeFont;
  corners: 'soft' | 'sharp';
  fonts: { heading: ThemeFont; menu: ThemeFont };
  colors: Record<string, string>;
  layout: StoreSkin['layout'];
} {
  const colors: Record<string, string> = {};
  for (const role of SKIN_ROLES) {
    const named = skin.palette[role];
    const field = ROLE_THEME_FIELD[role];
    if (named && field) colors[field] = named;
  }
  return {
    accent: skin.palette.accent,
    mood: skin.mood,
    font: skin.type.body,
    corners: skin.shape.corners,
    fonts: { heading: skin.type.heading, menu: skin.type.heading },
    colors,
    // The seven slots, whole. Dropping them was what made a template
    // installable and invisible.
    layout: skin.layout,
  };
}

/**
 * The forbidden keys this value carries, wherever they sit in it.
 *
 * In front of the schema and not inside it. `.strict()` fails the object
 * on an unknown key, and a failed object means the refinements never run —
 * so a refinement is the one place these sentences could never be read
 * from. Measured before this moved: `numerals: 'arabic-indic'` answered
 * «Unrecognized key», which reads as a typo.
 */
export function forbiddenKeysIn(raw: unknown): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  for (const key of keysWithin(raw)) {
    const why = FORBIDDEN_SKIN_KEYS[key];
    if (why) out.push({ path: key, message: why });
  }
  return out;
}

export type SkinParseResult =
  | { ok: true; skin: StoreSkin }
  | { ok: false; errors: { path: string; message: string }[] };

/**
 * Parse a skin, and say what is wrong with it in sentences.
 *
 * «أي تخصيص بيخرب عنصر منهم بينرفض مع السبب» — a refusal without the reason
 * is the same refusal, and the person reading it is the one who has to fix
 * the template.
 */
export function parseStoreSkin(raw: unknown): SkinParseResult {
  const named = forbiddenKeysIn(raw);
  const result = storeSkinSchema.safeParse(raw);
  if (result.success && named.length === 0) return { ok: true, skin: result.data as StoreSkin };

  // Zod will also have refused each of those keys, as «unrecognized». The
  // named sentence replaces that line rather than sitting beside it: two
  // refusals for one key reads as two problems.
  const alsoSaid = (message: string) => named.some((n) => message.includes(`"${n.path}"`));
  const rest = result.success
    ? []
    : result.error.issues
        .filter((i) => !alsoSaid(i.message))
        .map((i) => ({ path: i.path.join('.'), message: i.message }));

  return { ok: false, errors: [...named, ...rest] };
}
