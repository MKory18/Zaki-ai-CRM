import { z } from 'zod';
import { landingSectionsSchema, type LandingSection } from './landing-sections';
import { DEFAULT_STORE_THEME, storeThemeSchema, type StoreTheme } from './store-theme';

/**
 * A SHOP'S LOOK, AS A FILE.
 *
 * Exported so a seller can keep a design they like, move it to another of
 * their shops, or hand it to somebody. Imported as UNTRUSTED input: a file
 * off a disk is a stranger, and it goes through exactly the schemas a save
 * goes through before anything is written.
 *
 * WHAT A TEMPLATE IS NOT ALLOWED TO CARRY.
 *
 *  - IMAGES. An image path belongs to the company that uploaded it, and the
 *    public media route serves it only for that company's pages. Carried
 *    across, it would either break for every visitor or reach for another
 *    company's file. They are stripped on the way OUT, so a file can never
 *    put another company's paths into your store, and again on the way IN,
 *    for a file that was not made here.
 *  - PRICES, OFFERS AND PIXELS. The contract's own rule for cloning a store:
 *    structure travels, money and tracking do not. A price is the shop's,
 *    not the design's, and a pixel belongs to whoever pays for the ads.
 *  - The DOMAIN, the logo and the phone — a shop's identity is not a look.
 *
 * What is left is the shape and the styling: the blocks, their order, their
 * words, and the theme.
 */

export const TEMPLATE_FILE_KIND = 'zaki.store-template';
export const TEMPLATE_FILE_VERSION = 1;

/** Fields on a block that hold an uploaded image, anywhere in the library. */
const IMAGE_FIELDS = ['image', 'images', 'background', 'before', 'after', 'avatar', 'logo', 'photo', 'cover'] as const;

/**
 * Every image path removed, at any depth.
 *
 * Deep rather than top-level: a slider's images live inside its items, and a
 * block's `look.background` holds one too. A shallow sweep would leave the
 * ones that are hardest to notice.
 */
export function stripImages<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripImages(v)) as unknown as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if ((IMAGE_FIELDS as readonly string[]).includes(key)) {
      // An image field keeps its SHAPE — '' or [] — so a block that expects
      // one does not meet an undefined it was never written for.
      out[key] = Array.isArray(v) ? [] : typeof v === 'object' && v !== null ? stripImages(v) : '';
      continue;
    }
    out[key] = stripImages(v);
  }
  return out as T;
}

export interface TemplateFile {
  kind: typeof TEMPLATE_FILE_KIND;
  version: number;
  name: string;
  exportedAt: string;
  theme: StoreTheme;
  sections: LandingSection[];
}

/** The file a seller downloads. */
export function exportTemplate(args: { name: string; theme: StoreTheme; sections: LandingSection[] }): TemplateFile {
  return {
    kind: TEMPLATE_FILE_KIND,
    version: TEMPLATE_FILE_VERSION,
    name: args.name.slice(0, 80),
    exportedAt: new Date().toISOString(),
    theme: stripImages(args.theme),
    sections: stripImages(args.sections),
  };
}

const fileSchema = z.object({
  kind: z.literal(TEMPLATE_FILE_KIND),
  version: z.number().int().min(1).max(TEMPLATE_FILE_VERSION),
  name: z.string().trim().max(80).default(''),
  theme: storeThemeSchema,
  sections: landingSectionsSchema,
});

export type ImportResult =
  | { ok: true; name: string; theme: StoreTheme; sections: LandingSection[] }
  | { ok: false; error: string };

/**
 * Read a file somebody uploaded.
 *
 * Refuses rather than repairs. A file that is nearly right is a file whose
 * author will want to know, and a design silently half-applied is worse than
 * one that did not apply: the seller would go looking for what they changed.
 */
export function importTemplate(raw: unknown): ImportResult {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, error: 'الملف ليس ملف قالب صالحاً' };
    }
  }

  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) {
    const kind = (value as { kind?: unknown } | null)?.kind;
    if (kind !== undefined && kind !== TEMPLATE_FILE_KIND) {
      return { ok: false, error: 'هذا ليس ملف قالب متجر' };
    }
    const version = (value as { version?: unknown } | null)?.version;
    if (typeof version === 'number' && version > TEMPLATE_FILE_VERSION) {
      return { ok: false, error: 'هذا القالب من نسخة أحدث من النظام — حدّث النظام أولاً' };
    }
    return { ok: false, error: 'تعذّرت قراءة القالب — قد يكون معدَّلاً أو ناقصاً' };
  }

  return {
    ok: true,
    name: parsed.data.name,
    // Stripped again on the way in: a file made elsewhere, or edited by
    // hand, must not put another company's image paths into this store.
    theme: { ...DEFAULT_STORE_THEME, ...stripImages(parsed.data.theme) } as StoreTheme,
    sections: stripImages(parsed.data.sections) as LandingSection[],
  };
}

/** A filename a seller will recognise a week later. */
export function templateFileName(storeName: string): string {
  const safe = storeName.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().slice(0, 40) || 'store';
  return `${safe}-${new Date().toISOString().slice(0, 10)}.zaki-template.json`;
}

/**
 * The Content-Disposition header for that filename.
 *
 * HTTP header values are latin-1, and an Arabic shop name is not — setting
 * one directly throws, which took the whole export down for every shop named
 * in Arabic, which is all of them. RFC 5987 is what this is for: an ASCII
 * fallback for anything that cannot read the second part, and `filename*`
 * carrying the real name percent-encoded as UTF-8.
 */
export function templateDisposition(storeName: string): string {
  const name = templateFileName(storeName);
  const ascii = name.replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').trim() || 'store-template.json';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
