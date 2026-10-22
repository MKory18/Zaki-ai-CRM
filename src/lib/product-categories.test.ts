import { describe, expect, it } from 'vitest';
import {
  SUGGESTED_CATEGORIES,
  categoryChoices,
  categoryKey,
  choiceFor,
  suggestCategory,
} from './product-categories';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * WHICH SHELF A NAME POINTS AT — «انتا صنف افضل» (THE OWNER, 22/10).
 *
 * The rule is a table (`product-categories.ts`), and a table is only as good as the names it was held against. These are the
 * thirty-five products of the dev copy, BY NAME: the twelve somebody had already filed by hand (a rule that disagreed with the
 * owner's own filing would be wrong about something) and the twenty-three that were not. For the twenty-three, nineteen get a shelf
 * and four are left for a person — and "left" is a claim too: a confident wrong shelf is worse than a blank, because a blank is seen.
 * ═══════════════════════════════════════════════════════════════════════
 */

const SKIN = 'العناية بالبشرة';
const HAIR = 'العناية بالشعر';
const SUPP = 'مكمّلات';
const HEALTH = 'صحة وأعشاب';
const DEVICE = 'أجهزة العناية والتجميل';
const HOME = 'أجهزة منزلية';
const ELEC = 'إلكترونيات';
const KIDS = 'مستلزمات الأطفال';

/** The twenty-three that carried no category on the dev copy (all of the store «صحة بلس»). */
const UNFILED: Array<[string, string | null]> = [
  ['ماء الذهب', null],
  ['جهاز الليزر المنزلي الألماني إصدار 2025 - متوفر الان في سوري', DEVICE],
  ['صوبة القدس 4 شعلات', HOME],
  ['محضر الطعام', HOME],
  ['صوبة المازوت', HOME],
  ['ايفون اورانج', ELEC],
  ['مكواة عمودية', HOME],
  ['جهاز الليزر المنزلي الأمريكي', DEVICE],
  ['زيت الهند الأصلي', HAIR],
  ['قطرة طنين الأذن', HEALTH],
  ['ماء الكمأ', HEALTH],
  ['زيت الفلق', null],
  ['سليكس', null],
  ['كريم حرير', SKIN],
  ['الصابونة العشبية', SKIN],
  ['طاقية إنبات الشعر', HAIR],
  ['كرسي السجود', null],
  ['كريم إزالة الندبات الألماني الأصلي', SKIN],
  ['كريم تشققات القدم', SKIN],
  ['كريم ابو ميار', SKIN],
  ['كريم فطريات الأظافر', SKIN],
  ['كريم سنام الجمل', SKIN],
  ['بكج الزقات الصينية', HEALTH],
];

/** The twelve somebody had filed by hand — and the shelf each one sits on. */
const FILED: Array<[string, string]> = [
  ['زيت الأرغان للشعر', HAIR],
  ['شامبو ضد القشرة', HAIR],
  ['سيروم لتساقط الشعر', HAIR],
  ['كريم مرطّب للوجه', SKIN],
  ['غسول للبشرة الدهنية', SKIN],
  ['سيروم فيتامين سي', SKIN],
  ['كريم ليلي للتجاعيد', SKIN],
  ['واقٍ شمسي SPF 50', SKIN],
  ['مكمّل المغنيسيوم للنوم', SUPP],
  ['كولاجين للمفاصل', SUPP],
  ['فيتامين د ٥٠٠٠', SUPP],
  ['شراب حديد للأطفال', SUPP],
];

describe('the thirty-five products of the dev copy, by name', () => {
  it('— every one the owner had filed by hand is suggested the shelf it sits on: 12 of 12', () => {
    for (const [name, shelf] of FILED) expect(suggestCategory(name), name).toBe(shelf);
  });

  it('— the unfiled ones get the shelf the table decided, and four are left blank for a person', () => {
    for (const [name, shelf] of UNFILED) expect(suggestCategory(name), name).toBe(shelf);
    expect(UNFILED.filter(([, shelf]) => shelf === null).map(([name]) => name)).toEqual(['ماء الذهب', 'زيت الفلق', 'سليكس', 'كرسي السجود']);
    expect(UNFILED.filter(([, shelf]) => shelf !== null)).toHaveLength(19);
  });

  it('— and every shelf the table can suggest is the name of a shelf the dialog offers, spelt as the company spells it', () => {
    for (const shelf of new Set([...UNFILED, ...FILED].map(([, s]) => s).filter((s): s is string => s !== null))) {
      expect(SUGGESTED_CATEGORIES as readonly string[], shelf).toContain(shelf);
    }
  });
});

describe('reading a name', () => {
  it('takes the article and the «لل» off a word: «للشعر» is «شعر»', () => {
    expect(suggestCategory('منتج الشعر')).toBe(HAIR);
    expect(suggestCategory('منتج للشعر')).toBe(HAIR);
    expect(suggestCategory('منتج والشعر')).toBe(HAIR);
  });

  it('but only a leading one: «شعر» inside a word is not “the hair”, and a word that merely starts like an article is read whole', () => {
    // «اللبن» is «لبن» (milk) and matches nothing; «العاب» is the word «toys» whose first letters happen to be «ال» — it is
    // found because the rule word is written «العاب» and the name's word is read through the same stripping, so both are «عاب».
    expect(suggestCategory('اللبن')).toBeNull();
    expect(suggestCategory('ألعاب')).toBe(KIDS);
    expect(suggestCategory('الألعاب')).toBe(KIDS);
  });

  it('folds spelling, so a rule is found however the name was typed: ة / ه, أ / إ / ا, diacritics, case', () => {
    expect(suggestCategory('صوبة')).toBe(HOME);
    expect(suggestCategory('صوبه')).toBe(HOME);
    expect(suggestCategory('إيفون')).toBe(ELEC);
    expect(suggestCategory('ايفون')).toBe(ELEC);
    expect(suggestCategory('مُكَمِّل غذائي')).toBe(SUPP);
    expect(suggestCategory('IPHONE 15')).toBe(ELEC);
  });

  it('reads the English name too, when there is one', () => {
    expect(suggestCategory('منتج', 'Vitamin C')).toBe(SUPP);
    expect(suggestCategory('منتج', 'Hair Shampoo')).toBe(HAIR);
    expect(suggestCategory('منتج', null)).toBeNull();
    expect(suggestCategory('منتج', undefined)).toBeNull();
  });

  it('matches a word of four letters or more by its start — a plural, a feminine form — and a shorter one whole', () => {
    expect(suggestCategory('كريمة')).toBe(SKIN); // «كريم» (4) + ة
    expect(suggestCategory('كبسولات')).toBe(SUPP); // «كبسول» (5) + ات
    expect(suggestCategory('حفاضات')).toBe(KIDS); // «حفاض» (4) + ات
    expect(suggestCategory('فرن كهربائي')).toBe(HOME); // «فرن» (3) whole
    expect(suggestCategory('عطر فرنسي'), '«فرنسي» ليس «فرن»').toBeNull();
    expect(suggestCategory('شعره'), '«شعره» ليس «شعر» — كلمة من ثلاثة أحرف تُطابَق كاملة').toBeNull();
    // Starts-with, not contains: «شاحن» (a charger) is inside «مشاحنات» (quarrels), and that word is not a charger.
    expect(suggestCategory('شاحن سريع')).toBe(ELEC);
    expect(suggestCategory('مشاحنات'), 'كلمة تحوي «شاحن» في وسطها ليست «شاحن»').toBeNull();
  });

  it('is blank for a blank name', () => {
    expect(suggestCategory('')).toBeNull();
    expect(suggestCategory('   ')).toBeNull();
    expect(suggestCategory('---', '')).toBeNull();
  });
});

describe('a rule that needs a second word', () => {
  it('«واقي» is a sunscreen only beside «شمسي» — a screen protector is not', () => {
    expect(suggestCategory('واقي شمسي للوجه')).toBe(SKIN);
    expect(suggestCategory('واقي الشمس')).toBe(SKIN);
    expect(suggestCategory('واقي شاشة')).toBeNull();
  });

  it('«حديد» is a supplement only beside a supplement word — an iron bed is not', () => {
    expect(suggestCategory('شراب حديد')).toBe(SUPP);
    expect(suggestCategory('حديد كبسولات')).toBe(SUPP);
    expect(suggestCategory('سرير حديد')).toBeNull();
  });

  it('«ماء» is a health product only beside the truffle — and «كما» alone is the word «as»', () => {
    expect(suggestCategory('ماء الكمأ')).toBe(HEALTH);
    expect(suggestCategory('ماء الكمأة')).toBe(HEALTH);
    expect(suggestCategory('ماء الورد')).toBeNull();
    expect(suggestCategory('كما في الصورة')).toBeNull();
  });

  it('«زيت» is a hair product only beside an oil people use on hair', () => {
    expect(suggestCategory('زيت الهند')).toBe(HAIR);
    expect(suggestCategory('زيت الخروع')).toBe(HAIR);
    expect(suggestCategory('زيت الزيتون')).toBeNull();
  });

  it('a device is a beauty device only beside what it is for — «جهاز» alone is nothing', () => {
    expect(suggestCategory('جهاز تنحيف')).toBe(DEVICE);
    expect(suggestCategory('مكواة شعر')).toBe(DEVICE);
    expect(suggestCategory('ماكينة حلاقة')).toBe(DEVICE);
    expect(suggestCategory('جهاز')).toBeNull();
    expect(suggestCategory('جهاز تقوية الواي فاي')).toBeNull();
  });

  it('«ساعة» is electronics only when it is a smart one', () => {
    expect(suggestCategory('ساعة ذكية')).toBe(ELEC);
    expect(suggestCategory('smart watch ساعة')).toBe(ELEC);
    expect(suggestCategory('ساعة حائط')).toBeNull();
  });
});

describe('the order of the rules is the policy', () => {
  it('a beauty device stands above a household appliance: a hair iron is not an iron', () => {
    expect(suggestCategory('مكواة شعر')).toBe(DEVICE);
    expect(suggestCategory('مكواة عمودية')).toBe(HOME);
    expect(suggestCategory('جهاز الليزر المنزلي')).toBe(DEVICE);
  });

  it('hair stands above skin: a serum for hair loss is a hair product', () => {
    expect(suggestCategory('سيروم لتساقط الشعر')).toBe(HAIR);
    expect(suggestCategory('سيروم الوجه')).toBe(SKIN);
  });

  it('skin stands above supplements: a vitamin C serum is a serum, a collagen cream is a cream', () => {
    expect(suggestCategory('سيروم فيتامين سي')).toBe(SKIN);
    expect(suggestCategory('كريم كولاجين')).toBe(SKIN);
    expect(suggestCategory('فيتامين سي')).toBe(SUPP);
  });

  it('supplements stand above general health: collagen for the joints is a supplement', () => {
    expect(suggestCategory('كولاجين للمفاصل')).toBe(SUPP);
    expect(suggestCategory('مفاصل')).toBe(HEALTH);
    expect(suggestCategory('شراب')).toBe(HEALTH);
  });

  it('every shelf the table knows is reached by some name — none is dead weight', () => {
    const reached = new Set(
      [
        'ماكينة حلاقة', 'ايفون', 'صوبة', 'شامبو', 'كريم', 'مكمل', 'قطرة', 'حفاض',
      ].map((n) => suggestCategory(n))
    );
    expect([...reached].sort()).toEqual([...SUGGESTED_CATEGORIES].sort());
  });
});

describe('the shelves a dialog offers', () => {
  it('keys a shelf by what makes it the same shelf: spelling, a diacritic, a doubled space', () => {
    expect(categoryKey('مكمّلات')).toBe(categoryKey('مكملات'));
    expect(categoryKey('العناية بالبشرة')).toBe(categoryKey('العنايه  بالبشره'));
    expect(categoryKey('  Hair ')).toBe('hair');
    expect(categoryKey('العناية بالبشرة')).not.toBe(categoryKey('العناية بالشعر'));
  });

  it('offers the company’s own shelves first, then the suggested ones it does not have — marked as new', () => {
    const choices = categoryChoices([{ name: 'العناية بالبشرة' }, { name: 'مكمّلات' }, { name: 'تخفيضات' }]);
    expect(choices.slice(0, 3)).toEqual([
      { name: 'العناية بالبشرة', exists: true },
      { name: 'مكمّلات', exists: true },
      { name: 'تخفيضات', exists: true },
    ]);
    expect(choices.slice(3).every((c) => c.exists === false)).toBe(true);
    expect(choices.slice(3).map((c) => c.name)).toEqual(
      SUGGESTED_CATEGORIES.filter((n) => n !== 'العناية بالبشرة' && n !== 'مكمّلات')
    );
  });

  it('and a suggested shelf that is the same shelf as an existing one, spelt differently, is not offered twice', () => {
    const choices = categoryChoices([{ name: 'مكملات' }, { name: 'العنايه بالبشره' }]);
    expect(choices.filter((c) => categoryKey(c.name) === categoryKey('مكمّلات'))).toEqual([{ name: 'مكملات', exists: true }]);
    expect(choices.filter((c) => categoryKey(c.name) === categoryKey('العناية بالبشرة'))).toEqual([{ name: 'العنايه بالبشره', exists: true }]);
  });

  it('with no shelf at all, offers every suggested one, none of them existing', () => {
    expect(categoryChoices([])).toEqual(SUGGESTED_CATEGORIES.map((name) => ({ name, exists: false })));
  });

  it('chooses, for a suggestion, the company’s own spelling of that shelf — and nothing when there is no suggestion', () => {
    const choices = categoryChoices([{ name: 'مكملات' }]);
    expect(choiceFor('مكمّلات', choices)).toBe('مكملات');
    expect(choiceFor('إلكترونيات', choices)).toBe('إلكترونيات');
    expect(choiceFor(null, choices)).toBe('');
    expect(choiceFor('رفّ لا يعرفه أحد', choices)).toBe('');
  });
});
