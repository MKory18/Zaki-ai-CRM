import { normalizeArabic } from './order-parser';

/**
 * WHICH SHELF A PRODUCT BELONGS ON — A TABLE A PERSON CAN READ, NOT A MODEL.
 *
 * THE OWNER, 22/10, asked what was blocking and answered the one about the products that carry no category with
 * «انتا صنف افضل»: he does not want a form to fill a hundred times, he wants the sorting done and his eye on the result. A
 * category decides who may see a product (a permission can be scoped to a shelf), how the reports group it, and what the
 * assistant can answer about a line of goods — and a product with none is in none of those. Measured on the dev copy before this
 * was written: 23 of 35 products unfiled; on production the figure the products screen already prints is «N منتجاً بلا تصنيف».
 *
 * WHY A TABLE AND NOT A MODEL. The same name always lands on the same shelf; the whole rule fits on a screen and can be argued with;
 * it costs nothing and needs no network; and no name goes anywhere — the owner's rule that nothing reaches an external model is
 * kept here by there being no model at all. A wrong guess is one row to change in a dialog, not a mystery to debug.
 *
 * WHAT IT DECIDES AND WHAT IT LEAVES. A shelf is suggested only when a WORD of the name says so. A name no rule recognises —
 * «ماء الذهب», «سليكس» — gets NO suggestion, and the dialog leaves that row for a person to choose: a confident wrong shelf is worse
 * than an honest blank, because a blank is seen and a wrong shelf is not. And nothing here writes anything: this file answers
 * «which shelf», the dialog shows the answer, and the person presses; the door that files the products is `categorise/route.ts`.
 *
 * MEASURED AGAINST THE DEV COPY, which is the only catalogue this was written against: the twelve products somebody had already
 * filed by hand are all suggested the shelf they sit on (12 of 12 — a rule that disagreed with the owner's own filing would be
 * wrong about something), and of the twenty-three unfiled, nineteen get a shelf and four are left blank. The test pins every one
 * of the thirty-five by name.
 *
 * HOW A NAME IS READ. Spelling is folded first (`normalizeArabic`: ة→ه, أإآ→ا, ى→ي, no diacritics, lower case), the name is cut into
 * words, and each word is read as written and also without a leading «ال» / «لل» / «وال» («للشعر» is also «شعر»). A rule word matches
 * a word of the name when they are the same, or — if the rule word is four letters or more — when the name's word starts with it
 * (a plural, a feminine form).
 * A short rule word is matched whole: «فرن» is an oven, «فرنسي» is not. A rule with `needs` fires only if one of those words is
 * ALSO there: «واقي» alone is a screen protector as likely as a sunscreen, «واقي شمسي» is a sunscreen.
 *
 * THE ORDER IS THE POLICY. The first rule that fires wins, so a more specific rule stands above the general one that shares its words:
 * a beauty device above a household appliance («مكواة شعر» is not an iron), hair above skin («سيروم لتساقط الشعر» is a hair product
 * though «سيروم» is a skin word), skin above supplements («سيروم فيتامين سي» is a serum), supplements above general health.
 */

/** The shelves this suggests, in the order a person would list them. Made only when a product is put on one. */
export const SUGGESTED_CATEGORIES = [
  'العناية بالبشرة',
  'العناية بالشعر',
  'مكمّلات',
  'صحة وأعشاب',
  'أجهزة العناية والتجميل',
  'أجهزة منزلية',
  'إلكترونيات',
  'مستلزمات الأطفال',
] as const;

export type SuggestedCategory = (typeof SUGGESTED_CATEGORIES)[number];

/** The most products one press files — the door's limit and the dialog's. One number, so the two cannot disagree. */
export const CATEGORISE_BATCH = 300;

interface Rule {
  category: SuggestedCategory;
  /** The rule fires when one of these is a word of the name. */
  any: readonly string[];
  /** ...and, when given, when one of these is ALSO a word of it. */
  needs?: readonly string[];
}

/** «الشعر» → «شعر», «للشعر» → «شعر», «والشعر» → «شعر». */
const ARTICLE = /^(?:وال|لل|ال)(\p{L}+)$/u;

/** A rule is written the way people write, and its spelling folded the way the names are. */
const rule = (category: SuggestedCategory, any: readonly string[], needs?: readonly string[]): Rule => ({
  category,
  any: any.map(normalizeArabic),
  ...(needs ? { needs: needs.map(normalizeArabic) } : {}),
});

const BEAUTY_DEVICE_USES = ['شعر', 'وجه', 'بشرة', 'جسم', 'حلاقة', 'تنحيف', 'تجميل', 'ازالة', 'مساج', 'تدليك', 'عناية', 'تنظيف'];

const RULES: readonly Rule[] = [
  // A device for beauty or care stands above everything that shares its words: «جهاز الليزر المنزلي» is not a household appliance.
  rule('أجهزة العناية والتجميل', ['ليزر', 'سشوار', 'مدلك', 'laser']),
  rule('أجهزة العناية والتجميل', ['جهاز', 'مكواة', 'ماكينة', 'فرشاة'], BEAUTY_DEVICE_USES),
  rule('إلكترونيات', [
    'ايفون', 'iphone', 'جوال', 'موبايل', 'هاتف', 'سماعة', 'سماعات', 'شاحن', 'كاميرا', 'لابتوب', 'تابلت', 'ايباد',
    'سامسونج', 'شاومي', 'تلفزيون', 'تلفاز', 'راوتر', 'ايربودز', 'airpods', 'بلوتوث',
  ]),
  rule('إلكترونيات', ['ساعة'], ['ذكية', 'ذكي', 'smart']),
  rule('أجهزة منزلية', [
    'صوبة', 'مدفأة', 'دفاية', 'مكواة', 'محضر', 'خلاط', 'مفرمة', 'غلاية', 'قلاية', 'مكنسة', 'مروحة', 'سخان', 'ثلاجة', 'غسالة',
    'فرن', 'ميكرويف', 'عجان', 'عصارة', 'محمصة', 'شواية', 'مكيف', 'ايرفراير', 'طباخ', 'موقد',
  ]),
  // Hair above skin: «سيروم لتساقط الشعر» is hair although «سيروم» is a skin word.
  rule('العناية بالشعر', ['شعر', 'شامبو', 'بلسم', 'قشرة', 'تساقط', 'صلع', 'انبات', 'كيراتين', 'حنا', 'لحية', 'hair', 'shampoo']),
  rule('العناية بالشعر', ['زيت'], ['هند', 'ارغان', 'خروع', 'جوجوبا']),
  rule('العناية بالبشرة', [
    'كريم', 'سيروم', 'غسول', 'مرطب', 'ماسك', 'تونر', 'مقشر', 'صابون', 'تجاعيد', 'نمش', 'كلف', 'ندبات', 'تبييض', 'بشرة', 'لوشن',
    'spf', 'sunscreen', 'cream', 'serum', 'soap',
  ]),
  rule('العناية بالبشرة', ['واقي', 'واق'], ['شمسي', 'شمس']),
  // Supplements above general health: «كولاجين للمفاصل» is a supplement though «مفاصل» is a health word.
  rule('مكمّلات', [
    'مكمل', 'فيتامين', 'كولاجين', 'اوميجا', 'اوميغا', 'مغنيسيوم', 'زنك', 'كالسيوم', 'بروتين', 'ارجنين', 'كرياتين', 'بيوتين',
    'كبسول', 'اقراص', 'vitamin', 'omega', 'collagen', 'protein', 'supplement',
  ]),
  rule('مكمّلات', ['حديد'], ['شراب', 'كبسول', 'اقراص', 'فيتامين', 'مكمل']),
  rule('صحة وأعشاب', [
    'عشب', 'اعشاب', 'عشبي', 'شراب', 'قطرة', 'قطرات', 'لصقة', 'لصقات', 'زقة', 'زقات', 'مسكن', 'طنين', 'ضغط', 'سكري', 'مفاصل', 'علاج',
  ]),
  // The truffle water is a traditional eye remedy; «كما» alone is the word «as», so it only counts beside «ماء».
  rule('صحة وأعشاب', ['ماء'], ['كما', 'كماة']),
  rule('مستلزمات الأطفال', ['حفاض', 'رضاعة', 'رضيع', 'مصاصة', 'بيبي', 'baby', 'العاب', 'لعبة']),
];

/**
 * The words of a name — each as written AND, when it begins with an article, without it. Both, because «ال» is an article in
 * «الشعر» and part of the word in «ألعاب»; «الألعاب» is both at once, and only reading it both ways finds «ألعاب» in it.
 */
function wordsOf(text: string): string[] {
  const out: string[] = [];
  for (const word of normalizeArabic(text).split(/[^\p{L}\p{N}]+/u)) {
    if (word === '') continue;
    out.push(word);
    const stripped = ARTICLE.exec(word)?.[1];
    if (stripped !== undefined) out.push(stripped);
  }
  return out;
}

/** A rule word matches a word of the name when they are the same, or — from four letters up — when the name's word starts with it. */
const hits = (words: readonly string[], keys: readonly string[]): boolean =>
  words.some((w) => keys.some((k) => w === k || (k.length >= 4 && w.startsWith(k))));

/**
 * The shelf the NAME of a product points at, or `null` when no rule recognises it. The English name is read too when there is one.
 */
export function suggestCategory(name: string, nameEn?: string | null): SuggestedCategory | null {
  const words = wordsOf(`${name} ${nameEn ?? ''}`);
  for (const r of RULES) {
    if (hits(words, r.any) && (r.needs === undefined || hits(words, r.needs))) return r.category;
  }
  return null;
}

/**
 * A category name reduced to what makes it the same shelf: «مكمّلات» and «مكملات», «العناية بالبشرة» and «العنايه بالبشره» are one.
 * The door matches an existing category by this key before it makes a new one, so a spelling can never double a shelf.
 */
export const categoryKey = (name: string): string => normalizeArabic(name).replace(/\s+/g, ' ').trim();

/** One entry of the list a row's select offers: a shelf that exists, or one the suggestion would make. */
export interface CategoryChoice {
  name: string;
  exists: boolean;
}

/**
 * THE LIST EVERY ROW OFFERS: the shelves the company has, then the suggested ones it does not have yet (marked, so a person can see
 * that choosing it makes a new shelf). A suggested name that is the same shelf as an existing one is not offered twice.
 */
export function categoryChoices(existing: ReadonlyArray<{ name: string }>): CategoryChoice[] {
  const taken = new Set(existing.map((c) => categoryKey(c.name)));
  return [
    ...existing.map((c) => ({ name: c.name, exists: true })),
    ...SUGGESTED_CATEGORIES.filter((n) => !taken.has(categoryKey(n))).map((n) => ({ name: n, exists: false })),
  ];
}

/**
 * The entry of `choices` a suggestion stands for — the company's own spelling when it already has the shelf — or `''` (nothing
 * chosen) when there is no suggestion.
 */
export function choiceFor(suggestion: string | null, choices: readonly CategoryChoice[]): string {
  if (suggestion === null) return '';
  const key = categoryKey(suggestion);
  return choices.find((c) => categoryKey(c.name) === key)?.name ?? '';
}
