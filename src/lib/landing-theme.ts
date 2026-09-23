/**
 * LANDING THEME — one colour in, a harmonious page out.
 *
 * Giving a seller a CSS box does not give them a beautiful page; it gives
 * them thirty decisions, and the page ends up with a red button, a blue
 * link and a green badge because each was chosen on a different day.
 *
 * So the page is themed, not painted. The seller picks ONE accent colour
 * and a mood, and every other shade is derived from it: the button, the
 * price, the badge tint, the border, the strip at the top. They cannot
 * clash, because they are the same colour at different lightnesses.
 *
 * The derivation runs in OKLCH — a space where equal lightness steps look
 * equal to the eye — so a pale tint of a yellow and a pale tint of a navy
 * read as equally pale, which is exactly what plain HSL gets wrong.
 */

import { z } from 'zod';

export interface LandingTheme {
  /** The one colour the seller picks, as #rrggbb. */
  accent: string;
  /** How the page carries itself. */
  mood: ThemeMood;
  /** Arabic display font for headings. */
  font: ThemeFont;
  /** Rounded or square corners throughout. */
  corners: 'soft' | 'sharp';
  /**
   * A photograph behind the WHOLE page, not behind one block.
   *
   * A block background paints one band; a seller who wants a textured page
   * had to set the same image on every block and keep them in step. This is
   * the page's own backdrop, set once.
   *
   * '' means the mood's flat paper, which stays the default — a photograph
   * behind body text is a good way to make a page unreadable, so it is a
   * choice and never an accident.
   */
  pageImage: string;
  /**
   * How much of the page colour is laid over that photograph, 0…0.95.
   *
   * Without it the text sits straight on the picture and the page cannot be
   * read. The veil is the page's own paper colour, so a warm page veils warm
   * and a clean page veils white — it never turns the photo grey.
   */
  pageVeil: number;
}

export type ThemeMood = 'clean' | 'warm' | 'bold' | 'calm';
export type ThemeFont =
  | 'tajawal' | 'cairo' | 'almarai' | 'ibm' | 'rubik' | 'noto'
  | 'changa' | 'reem' | 'lalezar' | 'marhey' | 'amiri' | 'aref'
  | 'readex' | 'alexandria' | 'vazir' | 'mada' | 'messiri' | 'baloo'
  | 'naskh' | 'scheherazade' | 'system';

export const DEFAULT_THEME: LandingTheme = {
  accent: '#b8256e',
  mood: 'clean',
  font: 'tajawal',
  corners: 'soft',
  pageImage: '',
  pageVeil: 0.82,
};

/** What a stored theme is allowed to be. Anything else falls back whole. */
export const landingThemeSchema = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  mood: z.enum(['clean', 'warm', 'bold', 'calm']),
  font: z.enum([
    'tajawal', 'cairo', 'almarai', 'ibm', 'rubik', 'noto',
    'changa', 'reem', 'lalezar', 'marhey', 'amiri', 'aref',
    'readex', 'alexandria', 'vazir', 'mada', 'messiri', 'baloo',
    'naskh', 'scheherazade', 'system',
  ]),
  corners: z.enum(['soft', 'sharp']),
  // Same-origin paths only. An absolute URL here is a way to make the
  // seller's page fetch from somewhere we do not control, and to leak every
  // visitor to it; uploads go through the page's own media route.
  pageImage: z.string().regex(/^(|\/[A-Za-z0-9/_.\-]*)$/).max(300).default(''),
  pageVeil: z.number().min(0).max(0.95).default(0.82),
});

export const MOODS: { key: ThemeMood; label: string; hint: string }[] = [
  { key: 'clean', label: 'نظيف', hint: 'أبيض واسع، حدود خفيفة' },
  { key: 'warm', label: 'دافئ', hint: 'خلفية كريمية، ظلال ناعمة' },
  { key: 'bold', label: 'جريء', hint: 'تباين عالٍ، عناوين ثقيلة' },
  { key: 'calm', label: 'هادئ', hint: 'رمادي فاتح، ألوان مخفّفة' },
];

/**
 * THE font library. There is exactly one, and it lives here.
 *
 * There were two: four families for the page theme and twelve for a single
 * block, so the same screen offered a seller a font in one panel that the
 * other panel could not see. Two lists of the same thing are two lists to
 * keep in step, and they were already out of step.
 *
 * Each row carries everything anybody needs about that face: the Arabic
 * name the seller reads, the CSS stack, and the Google family string with
 * its weights — `google` absent means the face is already on the device and
 * needs no stylesheet.
 *
 * The order is the order a seller should meet them: the three workhorses
 * that suit any page, then the display faces for a headline, then the two
 * serifs, then the system default.
 */
export const FONTS: { key: ThemeFont; label: string; stack: string; google?: string; note: string }[] = [
  { key: 'tajawal', label: 'طجوال', stack: "'Tajawal', system-ui, sans-serif", google: 'Tajawal:wght@400;500;700;800', note: 'واضح ومحايد' },
  { key: 'cairo', label: 'القاهرة', stack: "'Cairo', system-ui, sans-serif", google: 'Cairo:wght@400;600;700;800', note: 'الأكثر استخداماً' },
  { key: 'almarai', label: 'المراعي', stack: "'Almarai', system-ui, sans-serif", google: 'Almarai:wght@400;700;800', note: 'هادئ ومقروء' },
  { key: 'ibm', label: 'IBM بلكس', stack: "'IBM Plex Sans Arabic', system-ui, sans-serif", google: 'IBM+Plex+Sans+Arabic:wght@400;500;600;700', note: 'رسمي ومرتّب' },
  { key: 'rubik', label: 'روبيك', stack: "'Rubik', system-ui, sans-serif", google: 'Rubik:wght@400;500;700;800', note: 'ودود وعصري' },
  { key: 'noto', label: 'نوتو كوفي', stack: "'Noto Kufi Arabic', system-ui, sans-serif", google: 'Noto+Kufi+Arabic:wght@400;600;700;800', note: 'كوفي متّزن' },
  { key: 'changa', label: 'تشانغا', stack: "'Changa', system-ui, sans-serif", google: 'Changa:wght@400;600;700;800', note: 'عريض للعناوين' },
  { key: 'reem', label: 'ريم كوفي', stack: "'Reem Kufi', system-ui, sans-serif", google: 'Reem+Kufi:wght@400;600;700', note: 'هندسي أنيق' },
  { key: 'lalezar', label: 'لاله زار', stack: "'Lalezar', system-ui, cursive", google: 'Lalezar', note: 'صارخ وإعلاني' },
  { key: 'marhey', label: 'مرحي', stack: "'Marhey', system-ui, cursive", google: 'Marhey:wght@400;600;700', note: 'مرِح وشبابي' },
  { key: 'amiri', label: 'أميري', stack: "'Amiri', Georgia, serif", google: 'Amiri:wght@400;700', note: 'نسخ كلاسيكي' },
  { key: 'aref', label: 'عارف رقعة', stack: "'Aref Ruqaa', Georgia, serif", google: 'Aref+Ruqaa:wght@400;700', note: 'رقعة فخم' },
  { key: 'readex', label: 'ريدكس برو', stack: "'Readex Pro', system-ui, sans-serif", google: 'Readex+Pro:wght@300;400;500;600;700', note: 'حديث ومتوازن' },
  { key: 'alexandria', label: 'الإسكندرية', stack: "'Alexandria', system-ui, sans-serif", google: 'Alexandria:wght@400;500;700;800', note: 'هندسي نظيف' },
  { key: 'vazir', label: 'وزير', stack: "'Vazirmatn', system-ui, sans-serif", google: 'Vazirmatn:wght@400;500;700;800', note: 'مقروء على الشاشة' },
  { key: 'mada', label: 'مدى', stack: "'Mada', system-ui, sans-serif", google: 'Mada:wght@400;500;700;900', note: 'بسيط وواسع' },
  { key: 'messiri', label: 'المصيري', stack: "'El Messiri', system-ui, sans-serif", google: 'El+Messiri:wght@400;500;600;700', note: 'أنيق للعناوين' },
  { key: 'baloo', label: 'بالو بهيجان', stack: "'Baloo Bhaijaan 2', system-ui, cursive", google: 'Baloo+Bhaijaan+2:wght@400;600;700;800', note: 'سميك ومستدير' },
  { key: 'naskh', label: 'نوتو نسخ', stack: "'Noto Naskh Arabic', Georgia, serif", google: 'Noto+Naskh+Arabic:wght@400;500;600;700', note: 'نسخ للقراءة الطويلة' },
  { key: 'scheherazade', label: 'شهرزاد', stack: "'Scheherazade New', Georgia, serif", google: 'Scheherazade+New:wght@400;700', note: 'نسخ تقليدي فخم' },
  { key: 'system', label: 'خط النظام', stack: "system-ui, 'Segoe UI', Tahoma, sans-serif", note: 'الأسرع تحميلاً' },
];

/** Every key in the library, for the places that need the list as data. */
export const FONT_KEYS = FONTS.map((f) => f.key);

// ─────────────────────────────────────────────────────
// Colour, honestly
// ─────────────────────────────────────────────────────

/** #rrggbb → linear-light sRGB triple, or null when it is not a colour. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  // Undo the sRGB transfer function; blending gamma-encoded values is what
  // makes naive tints look muddy.
  return srgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  const enc = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    const s = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(s * 255).toString(16).padStart(2, '0');
  };
  return `#${enc(r)}${enc(g)}${enc(b)}`;
}

/** Linear sRGB → OKLab. */
function toOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → linear sRGB. */
function fromOklab([L, a, b]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/**
 * The same colour at a chosen lightness, keeping its hue.
 * `chroma` scales how saturated the result stays: a tint wants less.
 */
function atLightness(hex: string, lightness: number, chroma = 1): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [, a, b] = toOklab(rgb);
  return toHex(fromOklab([lightness, a * chroma, b * chroma]));
}

/** Perceived lightness of a colour, 0–1. */
export function lightnessOf(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  return toOklab(rgb)[0];
}

/** WCAG relative luminance, from the already-linear sRGB triple. */
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const INK = '#121926';
const PAPER = '#ffffff';

/**
 * Ink or paper on this colour — whichever is actually READABLE on it, by
 * measured contrast rather than by a lightness threshold.
 *
 * A threshold gets the easy cases right and fails the ones in the middle,
 * which is where most brand colours live. A yellow button with white text
 * is a button nobody reads, and so is a mid-green one.
 */
export function readableOn(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return PAPER;
  const bg = luminance(rgb);
  const onInk = contrast(bg, luminance(parseHex(INK)!));
  const onPaper = contrast(bg, luminance(parseHex(PAPER)!));
  return onInk >= onPaper ? INK : PAPER;
}

export function isValidHex(hex: string): boolean {
  return parseHex(hex) !== null;
}

// ─────────────────────────────────────────────────────
// The palette a page is built from
// ─────────────────────────────────────────────────────

export interface Palette {
  accent: string;
  accentText: string;
  accentDark: string;
  accentTint: string;
  accentBorder: string;
  pageBg: string;
  cardBg: string;
  text: string;
  muted: string;
  border: string;
  radius: string;
  fontStack: string;
  headingWeight: number;
  /** The backdrop layer, ready for `background-image`, or '' for none. */
  pageBackdrop: string;
}

const MOOD_BASE: Record<ThemeMood, { pageBg: string; cardBg: string; text: string; muted: string; border: string; headingWeight: number }> = {
  clean: { pageBg: '#ffffff', cardBg: '#ffffff', text: '#121926', muted: '#697586', border: '#e3e8ef', headingWeight: 800 },
  warm:  { pageBg: '#fdfaf6', cardBg: '#ffffff', text: '#1c1917', muted: '#78716c', border: '#eadfd3', headingWeight: 800 },
  bold:  { pageBg: '#ffffff', cardBg: '#ffffff', text: '#0b0f19', muted: '#4b5563', border: '#d1d5db', headingWeight: 900 },
  calm:  { pageBg: '#f8fafc', cardBg: '#ffffff', text: '#1e293b', muted: '#64748b', border: '#e2e8f0', headingWeight: 700 },
};

/** Everything the page needs to paint itself, derived from one colour. */
export function paletteFor(theme: Partial<LandingTheme> | null | undefined): Palette {
  const t = { ...DEFAULT_THEME, ...(theme ?? {}) };
  const accent = isValidHex(t.accent) ? t.accent : DEFAULT_THEME.accent;
  const base = MOOD_BASE[t.mood] ?? MOOD_BASE.clean;
  const font = FONTS.find((f) => f.key === t.font) ?? FONTS[0];

  return {
    accent,
    accentText: readableOn(accent),
    // Pressed and hovered states: the same hue, one step down.
    accentDark: atLightness(accent, Math.max(0.2, lightnessOf(accent) - 0.12)),
    // A wash for badges and selected rows — pale enough for dark text on it.
    accentTint: atLightness(accent, 0.96, 0.18),
    accentBorder: atLightness(accent, 0.86, 0.45),
    ...base,
    radius: t.corners === 'sharp' ? '4px' : '14px',
    fontStack: font.stack,
    // The veil goes in the SAME background-image, above the photo: one
    // property, no extra element, and nothing for a block to sit under by
    // accident. Both stops are the page's own paper colour, so the veil
    // tints toward the page rather than washing it grey.
    pageBackdrop: backdropFor(t.pageImage, t.pageVeil, base.pageBg),
  };
}

/**
 * The page's backdrop as one `background-image` value.
 *
 * Refuses anything that is not a same-origin path, the same rule the schema
 * carries — a value can reach here from an older row that was stored before
 * the rule existed, and a page is not the place to find that out.
 */
function backdropFor(image: string | undefined, veil: number | undefined, paper: string): string {
  if (!image || !/^\/[A-Za-z0-9/_.\-]*$/.test(image)) return '';
  const a = Math.min(0.95, Math.max(0, veil ?? 0.82));
  const rgb = parseHex(paper);
  const tint = rgb
    ? `rgba(${rgb.map((v) => Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255)).join(',')},${a})`
    : `rgba(255,255,255,${a})`;
  return `linear-gradient(${tint}, ${tint}), url("${image}")`;
}

/** The palette as CSS custom properties, for a style attribute. */
export function paletteVars(palette: Palette): Record<string, string> {
  return {
    '--lp-accent': palette.accent,
    '--lp-accent-text': palette.accentText,
    '--lp-accent-dark': palette.accentDark,
    '--lp-accent-tint': palette.accentTint,
    '--lp-accent-border': palette.accentBorder,
    '--lp-page': palette.pageBg,
    '--lp-card': palette.cardBg,
    '--lp-text': palette.text,
    '--lp-muted': palette.muted,
    '--lp-border': palette.border,
    '--lp-radius': palette.radius,
    '--lp-font': palette.fontStack,
    '--lp-heading-weight': String(palette.headingWeight),
    // `none` rather than omitting the variable: the stylesheet's fallback
    // then has nothing to guess, and turning the photograph off is one
    // value changing rather than a rule appearing and disappearing.
    '--lp-page-image': palette.pageBackdrop || 'none',
  };
}
