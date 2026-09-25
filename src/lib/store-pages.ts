import { z } from 'zod';

/**
 * THE SHOP'S OWN PAGES.
 *
 * Who we are, the terms, the privacy policy, how returns work, how to reach
 * us. Not landing pages: a landing page sells one product and carries
 * offers, a pixel and an order form. These are the words a shop must have,
 * and two of them are words an advertising platform checks for before it
 * will review a campaign.
 *
 * WHY THREE ARE CREATED WITH THE STORE. A seller who discovers on the
 * morning of a campaign that the shop has no privacy policy has lost the
 * morning. So every store gets the three legal ones, as DRAFTS with a
 * skeleton text carrying the shop's name — never published, because
 * publishing a policy the seller has not read is putting words in their
 * mouth. The screen says which are still drafts, and why it matters.
 *
 * Pure and client-safe: the screen shows the same list this file defines.
 */

export const PAGE_KINDS = ['ABOUT', 'TERMS', 'PRIVACY', 'REFUND', 'CONTACT', 'CUSTOM'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const PAGE_KIND_AR: Record<PageKind, string> = {
  ABOUT: 'من نحن',
  TERMS: 'الشروط والأحكام',
  PRIVACY: 'سياسة الخصوصية',
  REFUND: 'سياسة الاستبدال والإرجاع',
  CONTACT: 'تواصل معنا',
  CUSTOM: 'صفحة إضافية',
};

/**
 * The three an ad platform's review looks for. A shop missing any of them
 * published is told so on the pages screen, in those words — not as a
 * warning triangle whose meaning nobody can guess.
 */
export const REQUIRED_FOR_ADS: readonly PageKind[] = ['PRIVACY', 'TERMS', 'REFUND'];

export interface PageSeed {
  slug: string;
  title: string;
  kind: PageKind;
  sortOrder: number;
  /** `{{store}}` is replaced with the shop's name. */
  body: string;
}

/**
 * The seeded pages, in the order a seller should meet them.
 *
 * The bodies are skeletons, and each ends by saying so. A default policy
 * that reads as finished is worse than none: it is a promise the shop has
 * not made, in the shop's name.
 */
export const PAGE_SEEDS: PageSeed[] = [
  {
    slug: 'privacy',
    title: 'سياسة الخصوصية',
    kind: 'PRIVACY',
    sortOrder: 1,
    body: [
      'يوضّح هذا النصّ كيف يتعامل «{{store}}» مع بياناتك.',
      '',
      'ما نجمعه: اسمك ورقم هاتفك وعنوانك، وهي ما نحتاجه لتوصيل طلبك والاتصال بك بشأنه.',
      '',
      'كيف نستعمله: لتنفيذ الطلب وتوصيله ومتابعته معك، ولا شيء غير ذلك.',
      '',
      'مع من نتشاركه: شركة الشحن التي توصّل طلبك، بالقدر الذي يلزمها للوصول إليك. لا نبيع بياناتك ولا نؤجّرها لأحد.',
      '',
      'حقوقك: تستطيع أن تطلب منّا حذف بياناتك أو تصحيحها بالاتصال بنا.',
      '',
      '— راجع هذا النصّ وعدّله ليطابق ما تفعله فعلاً قبل نشره.',
    ].join('\n'),
  },
  {
    slug: 'terms',
    title: 'الشروط والأحكام',
    kind: 'TERMS',
    sortOrder: 2,
    body: [
      'بطلبك من «{{store}}» فأنت توافق على ما يلي.',
      '',
      'الطلب: يُعتبر الطلب مؤكَّداً بعد اتصالنا بك وتأكيدك له.',
      '',
      'السعر والدفع: السعر المعروض يشمل ما هو مذكور في صفحة المنتج. الدفع عند الاستلام ما لم يُذكر خلاف ذلك.',
      '',
      'التوصيل: مدّة التوصيل تقديرية وقد تتأثّر بالظروف خارج سيطرتنا.',
      '',
      'الإلغاء: يمكنك إلغاء الطلب قبل شحنه بالاتصال بنا.',
      '',
      '— راجع هذا النصّ وعدّله ليطابق سياستك الفعلية قبل نشره.',
    ].join('\n'),
  },
  {
    slug: 'refund',
    title: 'سياسة الاستبدال والإرجاع',
    kind: 'REFUND',
    sortOrder: 3,
    body: [
      'سياسة «{{store}}» في الاستبدال والإرجاع.',
      '',
      'متى يُقبل الإرجاع: إذا وصلك المنتج تالفاً أو مخالفاً لما طلبته، تواصل معنا وسنعالج الأمر.',
      '',
      'المدّة: أبلغنا خلال المدّة المذكورة في تأكيد طلبك.',
      '',
      'حالة المنتج: يجب أن يكون بحالته وتغليفه الأصليين.',
      '',
      'كيف تطلب الإرجاع: اتصل بنا على رقم الدعم المذكور في أسفل الصفحة.',
      '',
      '— راجع هذا النصّ وعدّله ليطابق سياستك الفعلية قبل نشره.',
    ].join('\n'),
  },
];

/**
 * The seeded rows for one store, ready to insert.
 *
 * `isPublished: false` is stated here rather than left to the column's
 * default: that these arrive as DRAFTS is the rule, not a database detail,
 * and a rule nobody can see at the call site is a rule somebody will
 * "tidy up" later.
 */
export function seedPagesFor(
  storeName: string
): (Omit<PageSeed, 'body'> & { body: string; isPublished: false })[] {
  return PAGE_SEEDS.map((seed) => ({
    ...seed,
    body: seed.body.replaceAll('{{store}}', storeName),
    isPublished: false,
  }));
}

/** Which of the three an ad review wants are not published on this shop. */
export function missingForAds(pages: { kind: string; isPublished: boolean }[]): PageKind[] {
  return REQUIRED_FOR_ADS.filter((kind) => !pages.some((p) => p.kind === kind && p.isPublished));
}

// ─────────────────────────────────────────────────────
// What a page may be
// ─────────────────────────────────────────────────────

/**
 * Lower-case latin, digits and hyphens. The same shape a store slug and a
 * landing page slug already have, because they all end up in an address and
 * one rule is easier to trust than three.
 */
export const pageSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'المعرّف: أحرف إنجليزية صغيرة وأرقام وشرطات');

export const storePageCreateSchema = z.object({
  slug: pageSlugSchema,
  title: z.string().trim().min(2).max(120),
  /**
   * Plain text. It is rendered as text — paragraph per blank line — and
   * never as markup, so a page cannot carry a script or an iframe into the
   * shop. A seller who wants a designed page builds a landing page.
   */
  body: z.string().trim().max(20000).default(''),
  kind: z.enum(PAGE_KINDS).default('CUSTOM'),
  isPublished: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const storePageUpdateSchema = storePageCreateSchema.partial().strict();

/** Text into paragraphs, for rendering. Blank lines separate; nothing else. */
export function paragraphsOf(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
