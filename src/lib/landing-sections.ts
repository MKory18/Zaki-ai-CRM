import { z } from 'zod';

/**
 * LANDING SECTIONS — a page is an ordered list of blocks, not a blob of HTML.
 *
 * The old editor handed the seller a textarea and asked for HTML. That gives
 * total freedom and, in practice, an ugly page: nobody writing a product page
 * at midnight is also going to get the spacing rhythm right.
 *
 * So the page is assembled from a FIXED set of blocks. The seller chooses
 * which to show, in what order, and what goes in them. Every block is already
 * designed and already themed, so the worst page anyone can build here is a
 * plain one — never a broken one.
 *
 * Content that the system already knows (product name, price, the offer
 * tiers, the regions) is NOT copied into a block. The block names the source
 * and the renderer reads it live, so raising a price in the catalogue raises
 * it on the page instead of leaving a stale number to sell at.
 */

// ─────────────────────────────────────────────────────
// The blocks
// ─────────────────────────────────────────────────────

/**
 * HOW A BLOCK LOOKS — the same three questions for all thirteen.
 *
 * Every block already knows WHAT it says. This is how wide it sits, where
 * its content lines up, how much air it gets, and what is behind it. Put on
 * the shared base rather than into each block, so adding a look never means
 * touching thirteen schemas and remembering all of them.
 *
 * Nothing here is a pixel, and nothing here is per-device. A phone, a
 * tablet and a desktop are not three designs to keep in step by hand — they
 * are one intention rendered at three widths. "wide" means wide on a laptop
 * and edge-to-edge on a phone because that is what wide MEANS on a phone.
 * The renderer does that with clamp(); the seller never sees a breakpoint.
 */
const background = z.object({
  kind: z.enum(['none', 'solid', 'gradient', 'image']).default('none'),
  /** Solid fill, or the first stop of a gradient. */
  from: z.string().max(9).default(''),
  /** The second stop. Gradients only. */
  to: z.string().max(9).default(''),
  angle: z.number().int().min(0).max(360).default(160),
  image: z.string().max(2048).default(''),
  /**
   * How much dark is laid over a background image, 0–0.8.
   *
   * Not decoration: white text on somebody's photograph is unreadable
   * exactly as often as the photograph is bright, and that is discovered
   * by the customer, not by the person who chose the photo.
   */
  overlay: z.number().min(0).max(0.8).default(0.35),
}).default({ kind: 'none', from: '', to: '', angle: 160, image: '', overlay: 0.35 });

/**
 * The words themselves.
 *
 * An empty value means "whatever the page decided" — the theme's font, the
 * palette's colour, the block's own size. That is deliberate: a page where
 * every block was set by hand is a page where changing the theme changes
 * nothing, and the theme is the thing that keeps it looking like one page.
 *
 * The font list is the THEME's list, not a second one. A page with two font
 * systems has two ways to be wrong.
 */
const typography = z.object({
  /** '' = the page's own font. Otherwise one of the theme's four. */
  font: z
    .enum(['', 'cairo', 'tajawal', 'almarai', 'system', 'ibm', 'rubik', 'changa', 'amiri', 'reem', 'lalezar', 'aref'])
    .default(''),
  /** Relative, never px — so it still fits on a phone. */
  scale: z.enum(['xs', 's', 'm', 'l', 'xl']).default('m'),
  weight: z.enum(['', 'normal', 'medium', 'bold', 'black']).default(''),
  italic: z.boolean().default(false),
  /** The body text. '' = derived from the palette and what is behind it. */
  color: z.string().max(9).default(''),
  /**
   * Headings, separately.
   *
   * One colour for a whole block turned the heading, the price and the
   * button's words the same shade — which is almost never what anybody
   * means. A heading is its own decision; '' follows the body colour.
   */
  headingColor: z.string().max(9).default(''),
}).default({ font: '', scale: 'm', weight: '', italic: false, color: '', headingColor: '' });

/**
 * The order button, which is not text.
 *
 * It was taking the block's font colour, so choosing red for a paragraph
 * turned the words on a green button red too. A button has its own fill,
 * its own label colour and its own size, and they are asked for here.
 */
const button = z.object({
  /** '' = the theme's accent, which is the safe default. */
  fill: z.string().max(9).default(''),
  label: z.string().max(9).default(''),
  size: z.enum(['s', 'm', 'l']).default('m'),
  /** Full width on the row it sits in — the usual choice on a phone. */
  wide: z.boolean().default(false),
}).default({ fill: '', label: '', size: 'm', wide: false });

export type BlockButton = z.infer<typeof button>;

export type BlockTypography = z.infer<typeof typography>;

const look = z.object({
  width: z.enum(['narrow', 'normal', 'wide', 'full']).default('normal'),
  align: z.enum(['start', 'center', 'end']).default('center'),
  space: z.enum(['none', 'tight', 'normal', 'roomy']).default('normal'),
  background,
  text: typography,
  button,
}).default({
  width: 'normal',
  align: 'center',
  space: 'normal',
  background: { kind: 'none', from: '', to: '', angle: 160, image: '', overlay: 0.35 },
  text: { font: '', scale: 'm', weight: '', italic: false, color: '', headingColor: '' },
  button: { fill: '', label: '', size: 'm', wide: false },
});

export type BlockLook = z.infer<typeof look>;
export type BlockBackground = z.infer<typeof background>;

const base = { id: z.string().min(1), enabled: z.boolean().default(true), look };

/** A thin strip above everything — free delivery, a deadline, a promise. */
const announcement = z.object({
  ...base,
  type: z.literal('announcement'),
  text: z.string().max(140).default(''),
});

/** The first screen: image, headline, price, and the button that scrolls to the form. */
const hero = z.object({
  ...base,
  type: z.literal('hero'),
  image: z.string().max(2048).default(''),
  headline: z.string().max(120).default(''),
  subheadline: z.string().max(240).default(''),
  /** Show the product's price from the catalogue under the headline. */
  showPrice: z.boolean().default(true),
  ctaText: z.string().max(40).default('اطلب الآن'),
});

/** Why to buy it. Short lines, not paragraphs. */
const benefits = z.object({
  ...base,
  type: z.literal('benefits'),
  title: z.string().max(120).default(''),
  items: z.array(z.object({
    title: z.string().max(80).default(''),
    text: z.string().max(200).default(''),
  })).max(8).default([]),
});

/** More photos. People buy what they can see. */
const gallery = z.object({
  ...base,
  type: z.literal('gallery'),
  title: z.string().max(120).default(''),
  images: z.array(z.string().max(2048)).max(12).default([]),
});

/** Long-form description — the one place free text belongs. */
const text = z.object({
  ...base,
  type: z.literal('text'),
  title: z.string().max(120).default(''),
  body: z.string().max(4000).default(''),
});

/**
 * The quantity tiers. Their content comes from LandingPageOffer, because the
 * price a customer is charged must be the price the server holds — a number
 * typed into a section would be a second source of truth for money.
 */
const offers = z.object({
  ...base,
  type: z.literal('offers'),
  title: z.string().max(120).default('اختر العرض المناسب'),
});

/** What other buyers said. Plain names, no invented verification badge. */
const reviews = z.object({
  ...base,
  type: z.literal('reviews'),
  title: z.string().max(120).default('آراء المشترين'),
  items: z.array(z.object({
    name: z.string().max(60).default(''),
    text: z.string().max(400).default(''),
    stars: z.number().int().min(1).max(5).default(5),
  })).max(12).default([]),
});

/** Questions that stop a sale, answered before they are asked. */
const faq = z.object({
  ...base,
  type: z.literal('faq'),
  title: z.string().max(120).default('أسئلة شائعة'),
  items: z.array(z.object({
    q: z.string().max(200).default(''),
    a: z.string().max(800).default(''),
  })).max(12).default([]),
});

/**
 * Urgency. Deliberately narrow: a note and a countdown of real minutes from
 * the moment the visitor arrives. There is no "only 3 left" field, because
 * the system knows the real stock and inventing a smaller number to hurry
 * someone is a lie we would be shipping.
 */
const urgency = z.object({
  ...base,
  type: z.literal('urgency'),
  text: z.string().max(140).default(''),
  /** 0 = no countdown. */
  minutes: z.number().int().min(0).max(1440).default(0),
  /** Show the real remaining stock when it is genuinely low. */
  showRealStock: z.boolean().default(false),
});

/** The order form. Always rendered; this block only fixes WHERE. */
const form = z.object({
  ...base,
  type: z.literal('form'),
  title: z.string().max(120).default('أكمل الطلب'),
  subtitle: z.string().max(240).default('ادفع عند الاستلام — لا حاجة لبطاقة'),
});

/** The three reassurances under the button. */
const trust = z.object({
  ...base,
  type: z.literal('trust'),
  items: z.array(z.object({
    title: z.string().max(40).default(''),
    text: z.string().max(80).default(''),
  })).max(4).default([]),
});

/**
 * A link a seller may put on their page.
 *
 * Only http(s) and same-site paths. `javascript:` and `data:` are the two
 * that turn a footer link into a script running on the page, and a landing
 * page is public, so the check lives in the schema — the one place both the
 * editor and the server go through.
 */
const externalUrl = z
  .string()
  .max(2048)
  .refine(
    (v) => v === '' || /^https?:\/\//i.test(v) || /^\/[^/]/.test(v) || /^(mailto|tel):/i.test(v),
    'رابط غير صالح'
  );

const footer = z.object({
  ...base,
  type: z.literal('footer'),
  text: z.string().max(200).default(''),
  phone: z.string().max(40).default(''),
  logo: z.string().max(2048).default(''),
  /** Columns of links — policies, about, contact. */
  columns: z.array(z.object({
    title: z.string().max(60).default(''),
    links: z.array(z.object({
      label: z.string().max(60).default(''),
      url: externalUrl.default(''),
    })).max(8).default([]),
  })).max(4).default([]),
});

/**
 * A button that follows the visitor down the page and lands them on the form.
 *
 * It is a block like any other so it is toggled the same way, but its
 * position in the list means nothing — it is fixed to the bottom of the
 * screen wherever it sits in the order.
 */
const sticky = z.object({
  ...base,
  type: z.literal('sticky'),
  text: z.string().max(40).default('اطلب الآن'),
  /** Show the current price on the button. */
  showPrice: z.boolean().default(true),
});

export const landingSectionSchema = z.discriminatedUnion('type', [
  announcement, hero, benefits, gallery, text, offers,
  reviews, faq, urgency, form, trust, footer, sticky,
]);

export type LandingSection = z.infer<typeof landingSectionSchema>;
export type SectionType = LandingSection['type'];

export const landingSectionsSchema = z.array(landingSectionSchema).max(40);

// ─────────────────────────────────────────────────────
// Names, for the editor
// ─────────────────────────────────────────────────────

export const SECTION_LABEL: Record<SectionType, string> = {
  announcement: 'شريط إعلان',
  hero: 'الواجهة',
  benefits: 'المميزات',
  gallery: 'معرض الصور',
  text: 'نص وشرح',
  offers: 'العروض',
  reviews: 'آراء المشترين',
  faq: 'أسئلة شائعة',
  urgency: 'تحفيز',
  form: 'نموذج الطلب',
  trust: 'ضمانات',
  footer: 'التذييل',
  sticky: 'زر عائم',
};

export const SECTION_HINT: Record<SectionType, string> = {
  announcement: 'سطر واحد فوق الصفحة كلها',
  hero: 'أول ما يراه الزائر: صورة وعنوان وسعر',
  benefits: 'لماذا يشتري — أسطر قصيرة لا فقرات',
  gallery: 'صور إضافية للمنتج',
  text: 'شرح مطوّل بخط الصفحة',
  offers: 'عروض الكميات — تُدار من تبويب العروض',
  reviews: 'تجارب مشترين سابقين',
  faq: 'الأسئلة التي تمنع الشراء',
  urgency: 'عدّاد وقت وملاحظة مخزون حقيقية',
  form: 'مكان النموذج في الصفحة',
  trust: 'ثلاث طمأنات تحت الزر',
  footer: 'شعار وروابط صفحات وحقوق',
  sticky: 'يلاحق الزائر وينقله لتعبئة البيانات',
};

/** Blocks that may appear only once; the editor hides them when present. */
export const SINGLETON: SectionType[] = ['announcement', 'hero', 'offers', 'form', 'trust', 'footer', 'urgency', 'sticky'];

// ─────────────────────────────────────────────────────
// Reading what is stored
// ─────────────────────────────────────────────────────

/**
 * Parse stored sections, dropping anything that no longer validates.
 *
 * A page that has been live for a year must keep selling after a block gains
 * a field or loses one. So a bad block is skipped, never fatal: a page with
 * one missing section still takes orders, a page that throws takes none.
 */
export function parseSections(raw: unknown): LandingSection[] {
  const json = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!Array.isArray(json)) return [];

  const out: LandingSection[] = [];
  const seen = new Set<string>();
  for (const item of json) {
    const parsed = landingSectionSchema.safeParse(item);
    if (!parsed.success) continue;
    if (seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    out.push(parsed.data);
  }
  return out;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** A fresh block of a given type, with its defaults filled in. */
export function newSection(type: SectionType): LandingSection {
  const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
  const seed: Record<SectionType, unknown> = {
    announcement: { text: 'توصيل مجاني لجميع المحافظات' },
    hero: { headline: '', subheadline: '', image: '', showPrice: true, ctaText: 'اطلب الآن' },
    benefits: {
      title: 'لماذا هذا المنتج؟',
      items: [
        { title: 'جودة مضمونة', text: '' },
        { title: 'توصيل سريع', text: '' },
        { title: 'دفع عند الاستلام', text: '' },
      ],
    },
    gallery: { title: 'صور المنتج', images: [] },
    text: { title: '', body: '' },
    offers: { title: 'اختر العرض المناسب' },
    reviews: { title: 'آراء المشترين', items: [{ name: '', text: '', stars: 5 }] },
    faq: { title: 'أسئلة شائعة', items: [{ q: '', a: '' }] },
    urgency: { text: '', minutes: 0, showRealStock: false },
    form: { title: 'أكمل الطلب', subtitle: 'ادفع عند الاستلام — لا حاجة لبطاقة' },
    trust: {
      items: [
        { title: 'طلب آمن', text: 'بياناتك محفوظة' },
        { title: 'توصيل سريع', text: 'خلال أيام' },
        { title: 'دفع عند الاستلام', text: 'تدفع بعد ما تستلم' },
      ],
    },
    footer: {
      text: '',
      phone: '',
      logo: '',
      columns: [
        { title: 'عن المتجر', links: [{ label: '', url: '' }] },
        { title: 'الشروط والسياسات', links: [{ label: '', url: '' }] },
      ],
    },
    sticky: { text: 'اطلب الآن', showPrice: true },
  };

  return landingSectionSchema.parse({ id, type, enabled: true, ...(seed[type] as object) });
}

/**
 * The page a seller gets before touching anything — already a real page.
 * An empty canvas is not a starting point; it is a second task.
 */
export function starterSections(): LandingSection[] {
  // Offers sit high, right under the hero, the way a one-product page has
  // always worked — and the benefits then separate them from the form, which
  // carries its own offer picker. Side by side the two would read as a bug.
  return (['announcement', 'hero', 'offers', 'benefits', 'form', 'trust', 'footer'] as SectionType[])
    .map(newSection);
}

/** The form is not optional: without it the page cannot take an order. */
export function ensureForm(sections: LandingSection[]): LandingSection[] {
  if (sections.some((s) => s.type === 'form' && s.enabled)) return sections;
  const existing = sections.find((s) => s.type === 'form');
  if (existing) return sections.map((s) => (s.id === existing.id ? { ...s, enabled: true } : s));
  return [...sections, newSection('form')];
}
