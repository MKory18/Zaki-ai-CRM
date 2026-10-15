import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FAMILY, FAMILY_OF_TEMPLATE, LOW_STOCK_FLOOR, SELLING_FAMILIES,
  familyNameAr, familyOf, lowStock, offerDeadline, offersCountAr, trustRow,
} from './selling-blocks';
import { LANDING_FAMILIES } from './landing-matcher';
import { COD_LINE } from './landing-sections';
import { STORE_TEMPLATES } from './store-templates';
import { MIN_DELIVERIES } from './delivery-time';

/**
 * WHAT A SELLING BLOCK MAY SAY — the four kinds of claim, kept apart.
 *
 * «الدفع عند الاستلام» is ours to state. «يصل عادةً خلال يومين» has to be
 * measured. «بقي ٤ فقط» has to be low. «ينتهي بعد ساعة» has to belong to an
 * offer. Every one of these tests is an attempt to get a sentence out of
 * this module that the shop has not earned.
 */

describe('the three families', () => {
  /**
   * ONE LIST, AND IT IS THE MATCHER'S.
   *
   * `landing-matcher.ts` declares the ids and says in its own comment that
   * «two lists of the same four would be two lists to keep in step». This
   * file is the renderer that comment is addressed to, so the test is that
   * it did not start a second list — not that it agrees with the first one
   * today.
   */
  it('are the matcher’s own ids, not a second list of them', () => {
    expect([...SELLING_FAMILIES]).toEqual(LANDING_FAMILIES.map((f) => f.id));
    for (const f of SELLING_FAMILIES) {
      expect(familyNameAr(f), `العائلة «${f}» بلا اسم عربي`).toBeTruthy();
    }
  });

  /**
   * THE MAPPING IS ABOUT THE TEN SKINS, SO IT MUST NAME SKINS THAT EXIST.
   *
   * A key here that is not a template is a shop that will never match it,
   * and the family it was supposed to wear is a decision nobody applied.
   * `pearl` is the one template deliberately absent — §7.3 retires it with
   * no family — and it still has to be DRAWN, which the next test checks.
   */
  it('map only real templates, and every live one has a family', () => {
    const ids = new Set(STORE_TEMPLATES.map((t) => t.id));
    for (const key of Object.keys(FAMILY_OF_TEMPLATE)) {
      expect(ids.has(key), `«${key}» ليس قالباً موجوداً`).toBe(true);
    }
    const unmapped = STORE_TEMPLATES.map((t) => t.id).filter((id) => !FAMILY_OF_TEMPLATE[id]);
    // Exactly the retired one. A second name appearing here is a template
    // that was added without being given a look.
    expect(unmapped, 'قالب حيّ بلا عائلة').toEqual(['pearl']);
  });

  it('draw a shop that wore no template, and a shop wearing the retired one', () => {
    expect(familyOf(null)).toBe(DEFAULT_FAMILY);
    expect(familyOf('')).toBe(DEFAULT_FAMILY);
    expect(familyOf('  ')).toBe(DEFAULT_FAMILY);
    expect(familyOf('pearl')).toBe(DEFAULT_FAMILY);
    // And a value from the future, or from a hand-edited theme column: a
    // shop is drawn, never blank.
    expect(familyOf('something-nobody-shipped')).toBe(DEFAULT_FAMILY);
  });

  it('read the recorded template and nothing else', () => {
    expect(familyOf('lab')).toBe('clinic');
    expect(familyOf('herbs')).toBe('herbal');
    expect(familyOf('pulse')).toBe('trend');
    // Whitespace around a stored value is not a different shop.
    expect(familyOf(' pulse ')).toBe('trend');
  });
});

describe('the trust row', () => {
  it('says the shop takes cash at the door, in the one wording of it', () => {
    const row = trustRow();
    expect(row).toHaveLength(1);
    expect(row[0].key).toBe('cod');
    // The SAME sentence the hero carries. Two wordings of one promise on
    // one page leaves a shopper wondering which of them is the deal.
    expect(row[0].text).toBe(COD_LINE);
  });

  /**
   * THE CLAIM THAT HAS TO BE MEASURED.
   *
   * A delivery window arrives from `delivery-time.ts`, which refuses to
   * summarise fewer than `MIN_DELIVERIES` deliveries. This module cannot
   * lower that floor — there is no argument to it that supplies a window —
   * and with no window there is no sentence.
   */
  it('promises a delivery time only when one was measured', () => {
    expect(trustRow({ delivery: null }).map((i) => i.key)).toEqual(['cod']);
    const row = trustRow({ delivery: { medianDays: 2, slowDays: 4, samples: MIN_DELIVERIES } });
    expect(row.map((i) => i.key)).toEqual(['cod', 'delivery']);
    expect(row[1].text).toContain('يومين');
    // A range when the usual and the slow case differ — never one number
    // standing in for both.
    expect(row[1].text).toContain('4 أيام');
  });

  /**
   * THE CLAIM THAT IS THE SELLER'S TO MAKE.
   *
   * «إرجاع/ضمان فقط إذا البائع حدّده». There is no default sentence: «إرجاع
   * مجاني خلال ١٤ يوم» written by us is a term the seller never agreed to
   * and a customer would hold them to.
   */
  it('mentions returns only when the seller wrote or published something', () => {
    expect(trustRow({ returns: null }).map((i) => i.key)).toEqual(['cod']);
    expect(trustRow({ returns: { text: '   ' } }).map((i) => i.key)).toEqual(['cod']);
    expect(trustRow({ returns: { href: '' } }).map((i) => i.key)).toEqual(['cod']);

    const written = trustRow({ returns: { text: 'بترجّعه خلال أسبوع وما بتخسر شي' } });
    expect(written[1].text).toBe('بترجّعه خلال أسبوع وما بتخسر شي');
    expect(written[1].href, 'جملة البائع ما إلها رابط').toBeUndefined();

    const linked = trustRow({ returns: { href: '/s/shop/pages/refund' } });
    expect(linked[1].href).toBe('/s/shop/pages/refund');
    // The policy is NAMED, not summarised: summarising it here would be
    // inventing the terms inside it.
    expect(linked[1].text).toContain('سياسة');
  });

  it('never returns an item with nothing in it', () => {
    const row = trustRow({
      delivery: { medianDays: 1, slowDays: 1, samples: 9 },
      returns: { text: 'ضمان شهر' },
    });
    expect(row).toHaveLength(3);
    for (const item of row) {
      expect(item.title.trim(), 'عنصر ثقة بلا عنوان').toBeTruthy();
      expect(item.text.trim(), 'عنصر ثقة بلا سطر').toBeTruthy();
    }
    // Each key once: a row with two delivery lines is a row where one of
    // them is from somewhere nobody can name.
    expect(new Set(row.map((i) => i.key)).size).toBe(3);
  });
});

describe('how many offers there are', () => {
  /** Arabic has a form for exactly two, and «2 عروض» is not it. */
  it('counts a dual, a plural and a large number each its own way', () => {
    expect(offersCountAr(2)).toBe('عرضان');
    expect(offersCountAr(3)).toBe('3 عروض');
    expect(offersCountAr(10)).toBe('10 عروض');
    expect(offersCountAr(11)).toBe('11 عرضاً');
    // Western digits, which is this product's rule wherever a number shows.
    expect(offersCountAr(7)).not.toMatch(/[٠-٩]/);
  });
});

describe('the deadline', () => {
  const at = (ms: number) => new Date(Date.now() + ms);

  it('is nothing at all when no offer ends', () => {
    expect(offerDeadline([])).toBeNull();
    expect(offerDeadline([{ endsAt: null }, { endsAt: undefined }, {}])).toBeNull();
  });

  it('is the soonest of the offers that do end', () => {
    const soon = at(3_600_000);
    const later = at(86_400_000);
    expect(offerDeadline([{ endsAt: later }, { endsAt: soon }])).toBe(soon.toISOString());
    // A string from JSON reads the same as a Date from Prisma: the public
    // page serialises its offers on the way to the browser.
    expect(offerDeadline([{ endsAt: soon.toISOString() }])).toBe(soon.toISOString());
  });

  it('ignores a date that is past, and a date that is not a date', () => {
    expect(offerDeadline([{ endsAt: at(-1000) }])).toBeNull();
    expect(offerDeadline([{ endsAt: 'يوم الخميس' }])).toBeNull();
    // And the live one beside the stale one still answers.
    const soon = at(60_000);
    expect(offerDeadline([{ endsAt: at(-5000) }, { endsAt: soon }])).toBe(soon.toISOString());
  });
});

describe('the remaining count', () => {
  it('is said only when it is genuinely low', () => {
    expect(lowStock(4)).toBe(4);
    expect(lowStock(LOW_STOCK_FLOOR)).toBe(LOW_STOCK_FLOOR);
    expect(lowStock(LOW_STOCK_FLOOR + 1), 'مخزون كبير يُعرض كأنّه شحّ').toBeNull();
  });

  it('and «unknown» and «none» are both silence, not a zero', () => {
    expect(lowStock(null)).toBeNull();
    expect(lowStock(undefined)).toBeNull();
    expect(lowStock(0), 'الصفحة بتقول «بقي ٠»').toBeNull();
    expect(lowStock(-3)).toBeNull();
    expect(lowStock(Number.NaN)).toBeNull();
  });

  /** A shelf count is an integer of pieces; a half is a reservation bug. */
  it('is a whole number of pieces', () => {
    expect(lowStock(4.8)).toBe(4);
  });
});
