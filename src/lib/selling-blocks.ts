import { deliveryWindowAr, type DeliveryWindow } from './delivery-time';
import { COD_LINE } from './landing-sections';
import { LANDING_FAMILIES, familyById, type LandingFamilyId } from './landing-matcher';

/**
 * WHAT A SELLING BLOCK IS ALLOWED TO SAY — in one place.
 *
 * «أقسام بتبيع»: the landing blocks redesigned for a cash-on-delivery order
 * taken on a phone. Every one of them is a sentence about the real world —
 * «الدفع عند الاستلام» · «يصل عادةً خلال يومين» · «بقي ٤ فقط» · «ينتهي العرض
 * بعد ٠٣:١١:٤٢» — and each of those four is a different kind of claim:
 *
 *   the first is a FACT about how this shop takes money, always true;
 *   the second is MEASURED, and below its sample floor there is no sentence;
 *   the third is a COUNT, and only a genuinely low one is worth printing;
 *   the fourth is a DEADLINE, and it belongs to an offer or it does not exist.
 *
 * They were decided in four different files, each with its own idea of when
 * a claim is earned, and the countdown had no source at all: it counted
 * `minutes` a seller typed, from the moment the visitor arrived, so a page
 * with no offer ending showed a clock running out and nothing happened when
 * it did. A shopper learns from that exactly once, and then no number on the
 * page is worth reading.
 *
 * So the four live here, together, where the difference between them is
 * visible. Nothing in this module queries anything: it takes the facts
 * already read for the page and decides what may be SAID about them, which
 * is why it can be checked without a database.
 */

// ─────────────────────────────────────────────────────
// The three families
// ─────────────────────────────────────────────────────

/**
 * THE FAMILIES ARE THE MATCHER'S LIST, NOT A SECOND ONE.
 *
 * `landing-matcher.ts` declares them and says why in its own words: «two
 * lists of the same four would be two lists to keep in step, so the ids are
 * the contract and they are chosen to be the ones a renderer would choose».
 * This file is that renderer. It takes the ids and the Arabic names from
 * there and adds nothing to them — what it owns is which SKIN wears which
 * family, and what each family LOOKS like, and neither of those belongs in
 * a list of ids.
 */
export type SellingFamily = LandingFamilyId;
export const SELLING_FAMILIES = LANDING_FAMILIES.map((f) => f.id) as readonly SellingFamily[];

/** The name a seller reads, from the one place that holds it. */
export function familyNameAr(id: SellingFamily): string {
  return familyById(id)?.name ?? id;
}

/**
 * A SHOP THAT WORE NO TEMPLATE IS NOT A SHOP WITH A MISSING FAMILY.
 *
 * `theme.template` is optional and says so at length: a shop painted by
 * hand has never worn one. It still has to be drawn, and the clinical
 * family is the one that assumes least — no ornament, one colour, the
 * arrangement the blocks already had.
 */
export const DEFAULT_FAMILY: SellingFamily = 'clinic';

/**
 * WHICH FAMILY EACH OF THE TEN SKINS BELONGS TO — `AUDIT.md` §7.3.
 *
 * DERIVED, NOT STORED, AND DELIBERATELY SO. A family column would be a
 * second answer to «what does this shop look like» beside the template the
 * seller actually chose, and the two would part company the first time a
 * skin was reassigned. The mapping is the table in §7.3, which is a
 * decision about the ten skins and not about any one shop.
 *
 * `pearl` is in the table as «retire (hide, never delete)» with no family
 * of its own, and a shop wearing it is still a shop that must be drawn —
 * it reads as the default rather than as nothing, the same rule
 * `effectiveVariant` applies to a retired layout slot.
 *
 * AND «علامة» IS HERE NOW — IT WAS NOT, AND THE REASON IT IS WORTH
 * READING. This table shipped with a note saying the owner's fourth
 * family was deliberately absent: «No template maps to it, so nothing
 * here can derive it, and `the-three-families.test.ts` holds that: a
 * family this stage has not drawn must be one this stage cannot select.»
 *
 * The storefront branch then drew it. «علامة» is a shipped template now
 * (`alama`, in `store-templates.ts`), its product page is built from the
 * product's own fields (`store-brand-template.ts`), and `brand` has a
 * look in this stage's own stylesheet beside the other three. So the
 * bargain is kept from the other side: the id is reachable BECAUSE it is
 * drawn, and the guard still fails the day somebody maps a template to a
 * family nobody drew.
 */
export const FAMILY_OF_TEMPLATE: Readonly<Record<string, SellingFamily>> = Object.freeze({
  lab: 'clinic',
  pure: 'clinic',
  herbs: 'herbal',
  heritage: 'herbal',
  ritual: 'herbal',
  amber: 'herbal',
  pulse: 'trend',
  souq: 'trend',
  tender: 'trend',
  /*
   * THE FOURTH FAMILY, ADDED BY ITS OWN BRANCH.
   *
   * `alama` is the «علامة» template — a skin built entirely from product
   * fields, so an empty field makes its section disappear rather than
   * leaving a hole. Its family id is `brand`, which is what
   * `LANDING_FAMILIES` calls «علامة»; the template key is the Arabic word
   * transliterated, and the two are deliberately not the same string —
   * the key is what a seller's theme RECORDED, the id is what this
   * product calls the look.
   *
   * It is mapped here and not left to `DEFAULT_FAMILY` because the
   * fallback is «عيادة»: a brand skin silently wearing the clinic
   * family's trust row is the failure this map exists to prevent, and the
   * claim below would have passed on it.
   *
   * AND A LANDING PAGE IN THIS FAMILY IS STILL A LANDING PAGE. The
   * «علامة» PRODUCT page is built from the product's own fields and
   * draws none of these blocks — but a seller on this template may
   * still build a page in the block builder, and that page is drawn
   * by this stage. Which is why `brand` has a look in the block
   * stylesheet beside the other three: the guard below refuses a
   * family a template can reach and nobody drew.
   */
  alama: 'brand',
});

/**
 * The family a page is drawn in.
 *
 * Takes the recorded template key — `StoreTheme.template` — and nothing
 * else. It does NOT look at the accent or the layout slots: two skins may
 * share an accent, and a seller who changed a colour is still wearing the
 * template they picked. That is the same reasoning `store-theme.ts` gives
 * for recording the key in the first place.
 */
export function familyOf(template: string | null | undefined): SellingFamily {
  const key = (template ?? '').trim();
  return FAMILY_OF_TEMPLATE[key] ?? DEFAULT_FAMILY;
}

// ─────────────────────────────────────────────────────
// The trust row
// ─────────────────────────────────────────────────────

/**
 * ONE OF THE THREE REASSURANCES, AND WHERE IT CAME FROM.
 *
 * `key` is what the stylesheet and the guards address it by, so a family
 * cannot restyle «the second one» and then be wrong on a page where the
 * second one is absent.
 */
export interface TrustItem {
  key: 'cod' | 'delivery' | 'returns';
  title: string;
  /** The sentence under the title. Never empty: an item with nothing to say is not added. */
  text: string;
  /** Where the full policy is, when the shop has published one. */
  href?: string;
}

/**
 * The three things a COD shopper on a phone actually wants to know.
 *
 * «صف ثقة (دفع عند الاستلام · مدّة التوصيل · إرجاع/ضمان فقط إذا البائع
 * حدّده)». The parenthesis is the whole rule: the first is ours to state,
 * the second is the shop's to have measured, the third is the seller's to
 * have written. Two of the three can therefore be absent, and the row
 * renders with what is true.
 */
export interface SellingFacts {
  /**
   * What this shop's deliveries have actually taken, or null.
   *
   * Null is a real answer and the item disappears. `delivery-time.ts`
   * already refuses to summarise fewer than `MIN_DELIVERIES` deliveries,
   * so a window that arrives here has cleared the floor — this module
   * does not get to lower it.
   */
  delivery?: DeliveryWindow | null;
  /**
   * THE SELLER'S OWN GUARANTEE, OR THE POLICY THEY PUBLISHED, OR NOTHING.
   *
   * `text` is a sentence they wrote (the objections block's guarantee
   * line). `href` is their published returns policy, which is a page they
   * had to publish on purpose — the three legal pages are seeded as
   * DRAFTS precisely so that an unedited template is not mistaken for a
   * promise.
   *
   * Never both and never invented: there is no default sentence here,
   * because «إرجاع مجاني خلال ١٤ يوم» written by us is a term a seller
   * never agreed to and a customer would hold them to.
   */
  returns?: { text: string } | { href: string } | null;
}

/** Said once, here, because the row and the hero must not word it differently. */
const DELIVERY_TITLE = 'مدّة التوصيل';
const RETURNS_TITLE = 'الإرجاع والضمان';
const COD_TITLE = 'الدفع عند الاستلام';

export function trustRow(facts: SellingFacts = {}): TrustItem[] {
  const out: TrustItem[] = [];

  /*
   * ALWAYS FIRST, AND NOT BEHIND A FLAG.
   *
   * It is the same sentence the hero carries as part of the locked core
   * (`COD_LINE`), imported rather than retyped: a shopper who reads two
   * wordings of one promise on one page wonders which of them is the deal.
   */
  out.push({ key: 'cod', title: COD_TITLE, text: COD_LINE });

  const window = deliveryWindowAr(facts.delivery);
  if (window) out.push({ key: 'delivery', title: DELIVERY_TITLE, text: window });

  const returns = facts.returns;
  if (returns && 'text' in returns && returns.text.trim()) {
    out.push({ key: 'returns', title: RETURNS_TITLE, text: returns.text.trim() });
  } else if (returns && 'href' in returns && returns.href.trim()) {
    out.push({
      key: 'returns',
      title: RETURNS_TITLE,
      // The shop's own policy, named as a policy rather than summarised:
      // summarising it here would be inventing the terms it contains.
      text: 'اقرأ سياسة الاستبدال والإرجاع',
      href: returns.href.trim(),
    });
  }

  return out;
}

/**
 * «عرضان» · «3 عروض» · «12 عرضاً» — Arabic counts a dual.
 *
 * Not a detail. «2 عروض» is wrong in the way that tells a reader the
 * sentence was assembled by a machine, on the line that invites them to
 * choose what they are buying. Arabic has a form for exactly two, a plural
 * for three to ten, and a singular accusative above that, and all three
 * are one short function rather than a template string at the call site.
 *
 * Western digits throughout, which is this product's rule everywhere a
 * number is shown — and the dual carries no digit at all, because that is
 * how it is said.
 */
export function offersCountAr(count: number): string {
  if (count === 2) return 'عرضان';
  if (count >= 3 && count <= 10) return `${count} عروض`;
  return `${count} عرضاً`;
}

// ─────────────────────────────────────────────────────
// The clock — NOT HERE. See `countdown.ts`.
//
// This module briefly owned «when does the offer stop», as the soonest
// future `Offer.endsAt`. S6 landed the owner's own D8 first and holds
// the same rule in `countdownEnd`, beside the two sources a seller may
// choose between and the refusal that stops «تلقائي» with nothing behind
// it. Two answers to one question is exactly what this file exists to
// prevent, so the second one left.
// ─────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────
// The shelf
// ─────────────────────────────────────────────────────

/**
 * HOW FEW IS FEW ENOUGH TO SAY OUT LOUD.
 *
 * Twenty, which is the number the urgency block already used — kept, not
 * retuned, because this change is about where the rule lives and not about
 * what it decides. Above it the count is said by the shop having the thing
 * in stock, and «بقي ٤٠٠ فقط» is not scarcity, it is a warehouse report.
 */
export const LOW_STOCK_FLOOR = 20;

/**
 * The real remaining count, when it is worth printing.
 *
 * Null for unknown, null for zero, null for plenty — three different
 * reasons to say nothing, and the block draws nothing for all three rather
 * than drawing «بقي ٠». Inventing scarcity is the one thing these blocks
 * deliberately cannot do, so there is no argument here that raises the
 * floor or supplies a count.
 */
export function lowStock(stock: number | null | undefined): number | null {
  if (typeof stock !== 'number' || !Number.isFinite(stock)) return null;
  if (stock <= 0 || stock > LOW_STOCK_FLOOR) return null;
  return Math.floor(stock);
}
