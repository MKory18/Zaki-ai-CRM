/**
 * متجر «صحة بلس» (سوريا — دولار): المنتجات السبعة وعروضها كما هي في صور YouCan.
 *
 * هذا الملف وحده هو «ما قاله المالك»: أي رقم هنا مقروء من صورة، ولا رقم بُني من حساب.
 * `scripts/apply-sehha.ts` يقرؤه، ولا يعرف شيئاً عن الأسعار غيره.
 *
 * «التزم بالعروض الي بالصور» — فحيث اختلف عرض قديم بالنظام عن الصورة (القبعة كانت 100/180/250)
 * تُرجَّح الصورة، والعرض القديم الذي لا مقابل له بالصورة يُوقَف ولا يُحذف.
 */

export interface Tier {
  /** What the customer reads on the card. */
  name: string;
  quantity: number;
  /** Units given free on top of `quantity` («قطعتان + قطعة مجانية»). */
  freeQuantity: number;
  /** The price on the poster — the total the customer pays, delivery included. */
  price: number;
  /** The struck-through «was» price on the poster, when it shows one. */
  compareAt?: number;
}

export interface Item {
  /** The folder under `scripts/sehha/images`. */
  key: string;
  /** The product is looked up by this, in the store. */
  sku: string;
  /** Used only when the product does not exist yet. */
  create?: { name: string; nameEn?: string; sourceType: 'PURCHASED' | 'MANUFACTURED' };
  /** The single-unit price — what the catalogue shows before an offer is picked. */
  basePrice: number;
  tiers: Tier[];
  /** The landing page's public address: /lp/<slug>. */
  slug: string;
  pageName: string;
  /** The line above the posters. */
  strip: string;
  /**
   * Which posters (`<n>.webp`) are the product's own pictures, in order.
   *
   * The ones LEFT OUT are the «آراء العملاء / نتائج حقيقية» posters: faces that read as generated, presented
   * as «تجارب حقيقية». They stay in the folder, untouched, and are not put on the product or on a page by
   * this script — if they are real people the owner adds them himself; if not, they are not ours to publish.
   */
  posters: number[];
  /** Alt text, one per entry of `posters`. */
  alts: string[];
}

export const STORE_NAME = 'صحة بلس';

const FREE = 'توصيل مجاني داخل سوريا · الدفع عند الاستلام';
const FAST = 'شحن سريع داخل سوريا · الدفع عند الاستلام';

export const CATALOG: Item[] = [
  {
    key: 'albetchu',
    sku: 'LEG-4',
    basePrice: 20,
    tiers: [
      { name: 'عبوة واحدة', quantity: 1, freeQuantity: 0, price: 20 },
      { name: 'عبوتان', quantity: 2, freeQuantity: 0, price: 35 },
      { name: '3 عبوات', quantity: 3, freeQuantity: 0, price: 45 },
    ],
    slug: 'albetchu-scar-cream',
    pageName: 'ALBETCHU — كريم الندبات',
    strip: FREE,
    posters: [1, 2, 4],
    alts: ['كريم ALBETCHU للعناية بمظهر الندبات', 'العناية المتكاملة وطريقة الاستخدام', 'اختر عرضك'],
  },
  {
    key: 'hoodie',
    sku: 'HOODIE-01',
    create: { name: 'هودي بديل المازوت', sourceType: 'PURCHASED' },
    basePrice: 25,
    tiers: [
      { name: 'قطعة واحدة', quantity: 1, freeQuantity: 0, price: 25 },
      { name: 'قطعتان + قطعة مجانية', quantity: 2, freeQuantity: 1, price: 50 },
    ],
    slug: 'hoodie-heater-alternative',
    pageName: 'هودي بديل المازوت',
    strip: FREE,
    posters: [1, 2, 4],
    alts: ['هودي بديل المازوت', 'للشتاء دفء مختلف', 'اطلبها الآن'],
  },
  {
    key: 'clarden',
    sku: 'LEG-18',
    basePrice: 20,
    tiers: [
      { name: 'عبوة واحدة', quantity: 1, freeQuantity: 0, price: 20 },
      { name: 'عبوتان', quantity: 2, freeQuantity: 0, price: 35 },
      { name: '3 عبوات', quantity: 3, freeQuantity: 0, price: 45 },
    ],
    slug: 'clarden-ear-drops',
    pageName: 'Clarden — قطرة الأذن',
    strip: FREE,
    posters: [1, 2, 4],
    alts: ['لا تخلي طنين الأذن يزعج يومك', 'لأذن نظيفة وإحساس بالراحة', 'عرض خاص وتوصيل مجاني'],
  },
  {
    key: 'vara',
    sku: 'LEG-21',
    basePrice: 20,
    tiers: [
      { name: 'عبوة واحدة', quantity: 1, freeQuantity: 0, price: 20 },
      { name: 'عبوتان (وفر 5$)', quantity: 2, freeQuantity: 0, price: 35 },
      { name: 'ثلاث عبوات (وفر 15$)', quantity: 3, freeQuantity: 0, price: 45 },
    ],
    slug: 'vara-harir-cream',
    pageName: 'VARA حرير',
    strip: FAST,
    posters: [1, 2, 4],
    alts: ['كريم VARA حرير', 'عناية طبيعية لبشرة ناعمة', 'اختر العرض الأنسب لك'],
  },
  {
    key: 'kamaa',
    sku: 'LEG-19',
    basePrice: 15,
    tiers: [
      { name: 'عبوة واحدة', quantity: 1, freeQuantity: 0, price: 15 },
      { name: 'عبوتان + عبوة مجانية', quantity: 2, freeQuantity: 1, price: 25 },
    ],
    slug: 'kamaa-eye-water',
    pageName: 'ماء الكمأة للعين',
    strip: FREE,
    posters: [1, 2, 4],
    alts: ['ماء الكمأة للعين', 'مستخلص طبيعي للعناية بالعين', 'اطلب الآن'],
  },
  {
    key: 'cap',
    sku: 'LEG-23',
    basePrice: 50,
    tiers: [
      { name: 'قطعة واحدة', quantity: 1, freeQuantity: 0, price: 50, compareAt: 60 },
      { name: 'قطعتان', quantity: 2, freeQuantity: 0, price: 80, compareAt: 100 },
    ],
    slug: 'led-red-light-cap',
    pageName: 'قبعة العلاج بالضوء الأحمر',
    strip: FAST,
    posters: [1],
    alts: ['قبعة العلاج بالضوء الأحمر LED'],
  },
  {
    key: 'fungus',
    sku: 'LEG-7',
    basePrice: 20,
    tiers: [
      { name: 'عبوة واحدة', quantity: 1, freeQuantity: 0, price: 20 },
      { name: 'عبوتان', quantity: 2, freeQuantity: 0, price: 35 },
      { name: '3 عبوات', quantity: 3, freeQuantity: 0, price: 45 },
    ],
    slug: 'nail-fungus-cream',
    pageName: 'كريم العناية بالأظافر',
    strip: FREE,
    posters: [1, 2, 4],
    alts: ['العناية اليومية لأظافر أكثر صحة', 'عناية يومية لأظافر أكثر صحة', 'ابدأ عنايتك بأظافرك اليوم'],
  },
];
