import { newSection, landingSectionsSchema, type LandingSection, type SectionType } from './landing-sections';
import { DEFAULT_THEME, landingThemeSchema, type LandingTheme } from './landing-theme';

/**
 * FIFTEEN PAGES THAT ALREADY WORK.
 *
 * A template is not a list of block types. Five lists of the same blocks in
 * different orders are one template shown five times, and a seller who
 * tries two of them learns that the feature is decoration.
 *
 * So each of these carries a whole page: its accent colour, its mood, its
 * typeface, the blocks in an order with a reason, the look of each block,
 * and words that suit the thing being sold. A supplement page and a
 * perfume page are not the same page with the nouns swapped — one leads
 * with reassurance and the other with photographs, and that difference is
 * the only reason to offer both.
 *
 * Everything here is what a seller could have built by hand. Nothing in a
 * template can be set that the panels cannot also set, so there is no
 * second system to keep in step — and a page started from a template is
 * editable in exactly the ordinary way afterwards.
 */

type Look = NonNullable<LandingSection['look']>;
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

interface Brick {
  type: SectionType;
  look?: DeepPartial<Look>;
  /** Words for this block — the seller's to change, ours to start. */
  fields?: Record<string, unknown>;
}

export interface PageTemplate {
  key: string;
  label: string;
  /** What kind of product this shape is for, in a seller's words. */
  hint: string;
  /** A colour to show on the card, so the list is scannable at a glance. */
  swatch: string;
  theme: Partial<LandingTheme>;
  bricks: Brick[];
}

// ── shorthands, so the table below reads as design and not as syntax ──
const b = (type: SectionType, look?: DeepPartial<Look>, fields?: Record<string, unknown>): Brick => ({ type, look, fields });
const bg = (from: string, to?: string) =>
  ({ background: to ? { kind: 'gradient' as const, from, to, angle: 160 } : { kind: 'solid' as const, from } });
const roomy = { space: 'roomy' as const };
const tight = { space: 'tight' as const };
const wide = { width: 'wide' as const };

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    key: 'classic',
    label: 'الصفحة الكاملة',
    hint: 'الأكثر استخداماً — تصلح لأي منتج، وفيها كل ما يحتاجه المتردّد',
    swatch: '#b8256e',
    theme: { accent: '#b8256e', mood: 'clean', font: 'tajawal', corners: 'soft' },
    bricks: [
      b('announcement'),
      b('hero', roomy),
      b('offers'),
      b('benefits'),
      b('form'),
      b('trust'),
      b('reviews'),
      b('faq'),
      b('footer'),
    ],
  },
  {
    key: 'short',
    label: 'قصيرة وسريعة',
    hint: 'للإعلانات المدفوعة — من الصورة إلى الطلب بأقل عدد خطوات',
    swatch: '#16a34a',
    theme: { accent: '#16a34a', mood: 'clean', font: 'cairo', corners: 'soft' },
    bricks: [
      b('hero', { ...roomy, button: { size: 'l', wide: true } }),
      b('benefits', tight),
      b('form'),
      b('trust', tight),
      b('sticky'),
    ],
  },
  {
    key: 'urgent',
    label: 'عرض ينتهي',
    hint: 'عدّاد ونُدرة — للحملات ذات مدّة، والمواسم',
    swatch: '#ef4444',
    theme: { accent: '#ef4444', mood: 'bold', font: 'changa', corners: 'sharp' },
    bricks: [
      b('announcement', {}, { text: 'العرض ينتهي قريباً — الكمية محدودة' }),
      b('hero', roomy),
      b('urgency', { ...bg('#fef2f2'), space: 'normal' }),
      b('offers'),
      b('form'),
      b('trust', tight),
      b('sticky'),
      b('footer'),
    ],
  },
  {
    key: 'luxury',
    label: 'فاخر',
    hint: 'للعطور والساعات والهدايا الغالية — مساحات واسعة وخط كلاسيكي',
    swatch: '#1c1917',
    theme: { accent: '#a98545', mood: 'warm', font: 'aref', corners: 'sharp' },
    bricks: [
      b('hero', { ...roomy, ...bg('#1c1917'), text: { headingColor: '#f5f0e6', color: '#d6cec0' }, button: { fill: '#a98545', label: '#1c1917' } }),
      b('gallery', roomy),
      b('text', { ...roomy, width: 'narrow' }, { title: 'الحرفية', body: 'اكتب هنا قصة المنتج: من صنعه، وممّ صُنع، ولماذا يستحق سعره.' }),
      b('offers', roomy),
      b('form'),
      b('trust', tight),
      b('footer', bg('#1c1917')),
    ],
  },
  {
    key: 'health',
    label: 'صحي ومكمّلات',
    hint: 'حيث الطمأنة أهم من الصورة — ضمانات وأسئلة قبل الطلب',
    swatch: '#0d9488',
    theme: { accent: '#0d9488', mood: 'calm', font: 'almarai', corners: 'soft' },
    bricks: [
      b('announcement', {}, { text: 'منتج أصلي — استرجاع خلال 14 يوماً' }),
      b('hero'),
      b('benefits', {}, { title: 'ماذا يفعل؟', items: [{ title: '', text: '' }, { title: '', text: '' }, { title: '', text: '' }] }),
      b('trust'),
      b('text', { width: 'narrow' }, { title: 'طريقة الاستخدام', body: '' }),
      b('faq'),
      b('offers'),
      b('form'),
      b('footer'),
    ],
  },
  {
    key: 'beauty',
    label: 'جمال وعناية',
    hint: 'الصور تبيع — معرض كبير وآراء حقيقيات',
    swatch: '#db2777',
    theme: { accent: '#db2777', mood: 'clean', font: 'readex', corners: 'soft' },
    bricks: [
      b('hero', { ...bg('#fdf2f8'), space: 'normal' }),
      b('gallery', wide),
      b('benefits', tight),
      b('reviews'),
      b('offers'),
      b('form'),
      b('trust', tight),
      b('sticky'),
    ],
  },
  {
    key: 'food',
    label: 'طعام ومطبخ',
    hint: 'ألوان دافئة وصور تفتح النفس',
    swatch: '#ea580c',
    theme: { accent: '#ea580c', mood: 'warm', font: 'marhey', corners: 'soft' },
    bricks: [
      b('announcement'),
      b('hero', bg('#fff7ed')),
      b('gallery'),
      b('benefits'),
      b('offers'),
      b('form'),
      b('reviews', tight),
      b('footer'),
    ],
  },
  {
    key: 'tech',
    label: 'إلكترونيات',
    hint: 'مواصفات وتفاصيل — لمن يقارن قبل أن يشتري',
    swatch: '#0ea5e9',
    theme: { accent: '#0ea5e9', mood: 'bold', font: 'ibm', corners: 'sharp' },
    bricks: [
      b('hero', { ...bg('#0f172a'), text: { headingColor: '#f1f5f9', color: '#cbd5e1' } }),
      b('benefits', {}, { title: 'المواصفات' }),
      b('gallery'),
      b('text', { width: 'wide' }, { title: 'التفاصيل التقنية', body: '' }),
      b('offers'),
      b('form'),
      b('faq'),
      b('trust', tight),
      b('footer'),
    ],
  },
  {
    key: 'fashion',
    label: 'أزياء',
    hint: 'صور كبيرة وكلام قليل — المقاسات في الأسئلة',
    swatch: '#111827',
    theme: { accent: '#111827', mood: 'clean', font: 'alexandria', corners: 'sharp' },
    bricks: [
      b('hero', { ...roomy, width: 'wide' }),
      b('gallery', { width: 'full', space: 'tight' }),
      b('offers'),
      b('faq', {}, { title: 'المقاسات والتبديل' }),
      b('form'),
      b('trust', tight),
      b('sticky'),
    ],
  },
  {
    key: 'gift',
    label: 'هدايا ومناسبات',
    hint: 'للأعياد والمواسم — عرض واضح وعدّاد',
    swatch: '#7c3aed',
    theme: { accent: '#7c3aed', mood: 'warm', font: 'messiri', corners: 'soft' },
    bricks: [
      b('announcement', {}, { text: 'توصيل قبل المناسبة — اطلب مبكراً' }),
      b('hero', bg('#faf5ff', '#f3e8ff')),
      b('offers'),
      b('urgency'),
      b('gallery', tight),
      b('form'),
      b('trust', tight),
      b('footer'),
    ],
  },
  {
    key: 'sport',
    label: 'رياضة ولياقة',
    hint: 'تباين عالٍ وخط عريض — نبرة تحفيزية',
    swatch: '#facc15',
    theme: { accent: '#facc15', mood: 'bold', font: 'baloo', corners: 'sharp' },
    bricks: [
      b('hero', { ...roomy, ...bg('#111827'), text: { headingColor: '#facc15', color: '#e5e7eb' }, button: { fill: '#facc15', label: '#111827', size: 'l', wide: true } }),
      b('benefits', {}, { title: 'النتيجة' }),
      b('reviews'),
      b('offers'),
      b('form'),
      b('sticky'),
      b('footer', bg('#111827')),
    ],
  },
  {
    key: 'kids',
    label: 'أطفال',
    hint: 'ألوان لطيفة وخط مستدير — والأم تقرأ الضمانات',
    swatch: '#38bdf8',
    theme: { accent: '#38bdf8', mood: 'clean', font: 'baloo', corners: 'soft' },
    bricks: [
      b('hero', bg('#f0f9ff')),
      b('gallery'),
      b('benefits'),
      b('trust', {}, { items: [{ title: 'آمن للأطفال', text: '' }, { title: 'دفع عند الاستلام', text: '' }, { title: 'استرجاع سهل', text: '' }] }),
      b('offers'),
      b('form'),
      b('faq'),
      b('footer'),
    ],
  },
  {
    key: 'service',
    label: 'خدمة أو اشتراك',
    hint: 'لا صور منتج — الشرح والأسئلة هما البيع',
    swatch: '#475569',
    theme: { accent: '#475569', mood: 'calm', font: 'vazir', corners: 'soft' },
    bricks: [
      b('hero', { space: 'normal' }),
      b('text', { width: 'narrow', space: 'roomy' }, { title: 'كيف تعمل الخدمة؟', body: '' }),
      b('benefits', {}, { title: 'ماذا تشمل؟' }),
      b('faq'),
      b('offers'),
      b('form'),
      b('trust', tight),
      b('footer'),
    ],
  },
  {
    key: 'proof',
    label: 'الدليل أولاً',
    hint: 'لمنتج له زبائن كثر — الآراء قبل السعر',
    swatch: '#059669',
    theme: { accent: '#059669', mood: 'clean', font: 'rubik', corners: 'soft' },
    bricks: [
      b('announcement', {}, { text: 'أكثر من 1000 عميل' }),
      b('hero', { space: 'normal' }),
      b('reviews', { ...bg('#f0fdf4'), space: 'roomy' }),
      b('benefits'),
      b('gallery', tight),
      b('offers'),
      b('form'),
      b('trust', tight),
      b('footer'),
    ],
  },
  {
    key: 'blank',
    label: 'ابدأ فارغاً',
    hint: 'الواجهة والنموذج فقط — ابنِ الباقي بنفسك',
    swatch: '#9aa4b2',
    theme: {},
    bricks: [b('hero'), b('form')],
  },
];

/** Deep-merge a template's look onto the block's defaults. */
function withLook(section: LandingSection, look: DeepPartial<Look> | undefined): LandingSection {
  if (!look) return section;
  const base = section.look as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(look)) {
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v)
        ? { ...((base[k] as Record<string, unknown>) ?? {}), ...(v as Record<string, unknown>) }
        : v;
  }
  return { ...section, look: out } as LandingSection;
}

/**
 * A template as a real page: its blocks and its theme.
 *
 * Parsed through the section schema on the way out, so a template that got
 * something wrong fails HERE, in a test, and not on a seller's page. It is
 * the same validation the save route runs, which is the point — a template
 * cannot produce a page the system would refuse to store.
 */
export function buildTemplate(key: string): { sections: LandingSection[]; theme: LandingTheme } {
  const t = PAGE_TEMPLATES.find((x) => x.key === key) ?? PAGE_TEMPLATES[PAGE_TEMPLATES.length - 1];

  const sections = t.bricks.map((brick) => {
    const fresh = newSection(brick.type);
    const withFields = brick.fields ? ({ ...fresh, ...brick.fields } as LandingSection) : fresh;
    return withLook(withFields, brick.look);
  });

  return {
    sections: landingSectionsSchema.parse(sections),
    // Cast after the parse, not before: the schema is what decides the
    // value is a real font, and zod widens the enum it validated back to
    // string on the way out.
    theme: landingThemeSchema.parse({ ...DEFAULT_THEME, ...t.theme }) as LandingTheme,
  };
}
