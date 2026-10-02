import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('./db', () => ({ db: {} }));

import {
  offerInputSchema,
  offerPatchSchema,
  clearOtherDefaults,
  liveOfferWhere,
  toOfferView,
} from './offers';
import { computeCod } from './money';
import { zodMessage } from './zod-message';

/**
 * Offers used to exist twice: on the product and again on every landing page.
 * Merging them into one place removes the drift, but it puts every price a
 * customer sees behind this one schema — so the ways it can be wrong are all
 * ways of charging the wrong amount.
 */

describe('what an offer may say', () => {
  it('accepts a bundle with a gift', () => {
    const parsed = offerInputSchema.parse({
      name: 'ثلاث قطع + واحدة هدية',
      quantity: 3,
      freeQuantity: 1,
      sellingPrice: 150,
      compareAtPrice: 240,
    });
    expect(parsed.quantity).toBe(3);
    expect(parsed.freeQuantity).toBe(1);
    expect(parsed.deliveryIncluded).toBe(true);
  });

  it('refuses an offer of nothing', () => {
    expect(offerInputSchema.safeParse({ name: 'x', quantity: 0, sellingPrice: 10 }).success).toBe(false);
  });

  it('refuses a nameless offer, which a customer cannot tell apart', () => {
    expect(offerInputSchema.safeParse({ name: '', quantity: 1, sellingPrice: 10 }).success).toBe(false);
  });

  it('refuses a negative price rather than paying the customer', () => {
    expect(offerInputSchema.safeParse({ name: 'x', quantity: 1, sellingPrice: -5 }).success).toBe(false);
  });

  it('reads numbers that arrive as strings from a form', () => {
    const parsed = offerInputSchema.parse({ name: 'x', quantity: '2', sellingPrice: '35.5' });
    expect(parsed.quantity).toBe(2);
    expect(parsed.sellingPrice).toBe(35.5);
  });

  it('defaults a plain offer to one unit, no gift, active', () => {
    const parsed = offerInputSchema.parse({ name: 'قطعة', sellingPrice: 20 });
    expect(parsed).toMatchObject({ quantity: 1, freeQuantity: 0, discount: 0, status: 'ACTIVE' });
  });
});

describe('the view a customer is shown', () => {
  const base = {
    id: 'o1', name: 'قطعتان', quantity: 2, freeQuantity: 0,
    sellingPrice: 108, compareAtPrice: 120, isDefault: true,
  };

  it('shows the bundle total as the price, never a unit price', () => {
    expect(toOfferView(base).price).toBe(108);
  });

  /**
   * THE RULE THAT CHANGED. A typed «was» price used to be shown as typed —
   * and the offers screen filled it in from `basePrice × (quantity + free)`,
   * so the saving a customer read was arithmetic about a price the shop had
   * never charged. Evidence now, or nothing.
   */
  it('shows nothing when no delivered order supports it', () => {
    expect(toOfferView(base).compareAtPrice).toBeNull();
    expect(toOfferView(base, undefined).compareAtPrice).toBeNull();
  });

  it('shows the evidenced price when orders support it', () => {
    expect(toOfferView(base, 120).compareAtPrice).toBe(120);
  });

  /** The seller's number is a ceiling. It may be lower; it may never be higher. */
  it('never shows more of a saving than the orders prove', () => {
    expect(toOfferView({ ...base, compareAtPrice: 200 }, 120).compareAtPrice).toBe(120);
  });

  it('honours a claim below the evidence', () => {
    expect(toOfferView({ ...base, compareAtPrice: 115 }, 120).compareAtPrice).toBe(115);
  });

  it('hides a "was" price that is not above the price', () => {
    // 108 was 108 is not a saving; it is a lie with extra steps.
    expect(toOfferView({ ...base, compareAtPrice: 108 }, 108).compareAtPrice).toBeNull();
    expect(toOfferView({ ...base, compareAtPrice: 90 }, 90).compareAtPrice).toBeNull();
  });

  /** A claim with no number at all still shows the evidence. */
  it('needs no claim to show what really happened', () => {
    expect(toOfferView({ ...base, compareAtPrice: null }, 120).compareAtPrice).toBe(120);
  });

  it('carries the ending, so the countdown has one source', () => {
    const ends = new Date('2026-10-01T00:00:00.000Z');
    expect(toOfferView({ ...base, endsAt: ends }).endsAt).toBe(ends);
    expect(toOfferView(base).endsAt).toBeNull();
  });
});

describe('what «on sale right now» means', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');

  /**
   * ONE PREDICATE. Three reads used to spell `status: 'ACTIVE'` themselves —
   * this one and the two in storefront.ts — so adding an ending would have
   * been three edits, and the forgotten one would have gone on selling a
   * bundle that had finished.
   */
  it('is active, and either endless or not yet over', () => {
    expect(liveOfferWhere(now)).toEqual({
      status: 'ACTIVE',
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    });
  });

  it('asks the database, not the page', () => {
    // A finished offer must be unreachable by guessing its id, the same way
    // an inactive one is — so the rule is a `where`, never a filter after.
    expect(Object.keys(liveOfferWhere(now))).toEqual(['status', 'OR']);
  });
});

describe('an ending must be one', () => {
  const ok = { name: 'عرض', sellingPrice: 20 };

  it('accepts no ending at all', () => {
    expect(offerInputSchema.parse(ok).endsAt).toBeUndefined();
  });

  it('accepts an ending', () => {
    const parsed = offerInputSchema.parse({ ...ok, endsAt: '2026-12-31T21:00:00.000Z' });
    expect(parsed.endsAt).toBeInstanceOf(Date);
  });

  it('refuses something that is not a moment', () => {
    expect(offerInputSchema.safeParse({ ...ok, endsAt: 'قريباً' }).success).toBe(false);
  });
});

describe('exactly one default per product', () => {
  const tx = { offer: { updateMany: vi.fn() } } as never;
  beforeEach(() => vi.clearAllMocks());

  it('clears the others when one is made default', async () => {
    await clearOtherDefaults(tx, { id: 'b', productId: 'p1', companyId: 'c1', isDefault: true });
    const args = (tx as any).offer.updateMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ companyId: 'c1', productId: 'p1', isDefault: true });
    expect(args.where.id).toEqual({ not: 'b' });
    expect(args.data).toEqual({ isDefault: false });
  });

  it('touches nothing when the offer is not the default', async () => {
    await clearOtherDefaults(tx, { id: 'b', productId: 'p1', companyId: 'c1', isDefault: false });
    expect((tx as any).offer.updateMany).not.toHaveBeenCalled();
  });

  it('never clears defaults of another product', async () => {
    // Two defaults across products is correct; two within one product means
    // the landing page and the order screen quote different prices.
    await clearOtherDefaults(tx, { id: 'b', productId: 'p1', companyId: 'c1', isDefault: true });
    expect((tx as any).offer.updateMany.mock.calls[0][0].where.productId).toBe('p1');
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────────
 * A DISCOUNT BIGGER THAN THE PRICE IT REDUCES.
 *
 * `discount` is ABSOLUTE money, and the ceiling on it was a million — never
 * the offer's own price. `sellingPrice: 25, discount: 30` was therefore a
 * storable row, and four doors read it four ways: three clamp it to the
 * subtotal and charge nothing, while AI intake's write path reads the
 * clamped 0 as «no price given» and charges the product's base price.
 *
 * These tests assert the REFUSAL, with the numbers. Deleting the
 * `superRefine` from offers.ts makes every one of them fail saying 25 and
 * 30 — none of them merely checks that a rule exists somewhere by name.
 * ───────────────────────────────────────────────────────────────────────────
 */
describe('a discount may not swallow the price it reduces', () => {
  const ok = { name: 'قطعتان', quantity: 2, sellingPrice: 25 };

  it('refuses 30 off a price of 25 — the row the four doors disagreed about', () => {
    expect(offerInputSchema.safeParse({ ...ok, discount: 30 }).success).toBe(false);
  });

  it('says what is wrong and what the limit is, in Arabic, naming both numbers', () => {
    const r = offerInputSchema.safeParse({ ...ok, discount: 30 });
    expect(r.success).toBe(false);
    if (r.success) return;
    const issue = r.error.issues[0];
    // The person reads «30», «25» and that the discount must be below it — a
    // message that said «قيمة غير صالحة» would leave them guessing which of
    // two numbers to change.
    expect(issue.message).toContain('30');
    expect(issue.message).toContain('25');
    expect(issue.message).toContain('الخصم');
    // On the discount field, so a form can point at the box that is wrong
    // rather than at the offer as a whole.
    expect(issue.path).toEqual(['discount']);
  });

  /**
   * AND THE SENTENCE THE PERSON ACTUALLY READS.
   *
   * The offers screen prints the route’s `error` string, which is
   * `zodMessage()` of this issue — so a message that translator swallows or
   * rewrites is a save button that does nothing with no explanation beside
   * it. This pins the sentence end to end, short of the browser.
   */
  it('reaches the screen through the route translator, numbers intact', () => {
    const r = offerInputSchema.safeParse({ ...ok, discount: 30 });
    expect(r.success).toBe(false);
    if (r.success) return;
    const sentence = zodMessage(r.error);
    expect(sentence).toContain('30');
    expect(sentence).toContain('25');
    expect(sentence).toContain('الخصم');
  });

  /**
   * THE CREATE DOOR EXTENDS THIS SCHEMA RATHER THAN USING IT AS IT IS.
   *
   * `POST /api/offers` parses `offerInputSchema.extend({ productId })`. A
   * refinement that did not survive that extension would leave the rule
   * passing here and absent at the only door that creates offers.
   */
  it('survives the create route’s own .extend({ productId })', () => {
    const atTheDoor = offerInputSchema.extend({ productId: z.string().min(10).max(64) });
    const row = { ...ok, productId: 'p-axxxxxxxxxx' };
    expect(atTheDoor.safeParse({ ...row, discount: 30 }).success).toBe(false);
    expect(atTheDoor.safeParse({ ...row, discount: 3 }).success).toBe(true);
  });

  it('refuses a discount that exactly equals the price — 25 off 25 is not a price', () => {
    expect(offerInputSchema.safeParse({ ...ok, discount: 25 }).success).toBe(false);
  });

  it('refuses it when the numbers arrive as strings from a form', () => {
    expect(offerInputSchema.safeParse({ ...ok, sellingPrice: '25', discount: '30' }).success).toBe(false);
  });

  it('accepts a real reduction — 3 off 25 still stores, and stores as 3', () => {
    const parsed = offerInputSchema.parse({ ...ok, discount: 3 });
    expect(parsed.discount).toBe(3);
    expect(parsed.sellingPrice).toBe(25);
  });

  it('accepts a reduction one minor unit under the price', () => {
    expect(offerInputSchema.parse({ ...ok, discount: 24.999 }).discount).toBe(24.999);
  });

  /**
   * NO DISCOUNT AT ALL IS NOT A DISCOUNT TOO BIG. A free bundle
   * (`sellingPrice: 0`) is a pricing decision somebody may make, and only a
   * POSITIVE discount is measured — otherwise this rule would quietly refuse
   * that while claiming to be about typos.
   */
  it('leaves an offer with no reduction alone, at any price', () => {
    expect(offerInputSchema.parse({ ...ok, discount: 0 }).discount).toBe(0);
    expect(offerInputSchema.parse(ok).discount).toBe(0);
    expect(offerInputSchema.safeParse({ ...ok, sellingPrice: 0 }).success).toBe(true);
  });

  it('still refuses a positive discount on a free bundle', () => {
    expect(offerInputSchema.safeParse({ ...ok, sellingPrice: 0, discount: 5 }).success).toBe(false);
  });

  /**
   * WHY IT IS REFUSED AT ALL, in the four doors' own arithmetic.
   *
   * `computeCod` is the one money function and the clamp lives inside it, in
   * `allocateDiscount`. The two expressions below are what the three
   * clamping doors and the AI-intake write path would each make of this one
   * row — 0 and 99 — which is the reason the row is refused rather than
   * reinterpreted. Three decimals, like the JOD store this was measured on.
   */
  it('is refused because no door can be right about it', () => {
    const clamped = computeCod({
      lines: [{ quantity: 1, unitPrice: 25 }],
      discount: 30,
      minorUnit: 3,
    }).cod;
    // Three doors: the discount is clamped to the subtotal, so nothing is due.
    expect(clamped).toBe(0);
    // The fourth: `p.finalPrice || product.basePrice` on that same 0.
    expect(clamped || 99).toBe(99);
    // So the row is never stored in the first place.
    expect(offerInputSchema.safeParse({ ...ok, discount: 30 }).success).toBe(false);
  });

  it('leaves money at the door for every reduction it does accept', () => {
    // The guarantee is `discount < sellingPrice`, so a basket of one bundle
    // always has something left to collect — in a three-decimal currency.
    // (In a currency with NO minor unit a discount within half a unit of the
    // price still rounds the amount due to 0; the schema cannot see that, and
    // it is reported as a finding rather than asserted here.)
    for (const [price, discount] of [[25, 24.999], [25, 3], [10, 9.5], [9, 0]]) {
      const o = offerInputSchema.parse({ name: 'x', sellingPrice: price, discount });
      const { cod } = computeCod({
        lines: [{ quantity: 1, unitPrice: o.sellingPrice }],
        discount: o.discount,
        minorUnit: 3,
      });
      expect(cod, `${price} less ${discount}`).toBeGreaterThan(0);
    }
  });
});

/**
 * THE EDIT DOOR, measured against the row being edited.
 *
 * `{ discount: 30 }` on its own says nothing about the price it has to stay
 * under, so the stored row supplies what the request leaves out. A rule that
 * read only the fields that were sent would shut the create door and leave
 * this one wide open — the same row, in by another door.
 */
describe('editing an offer obeys the same rule', () => {
  const stored = { sellingPrice: 25, discount: 3 };

  it('refuses a discount of 30 sent alone against a stored price of 25', () => {
    const r = offerPatchSchema(stored).safeParse({ discount: 30 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('25');
      expect(r.error.issues[0].path).toEqual(['discount']);
    }
  });

  /**
   * DROPPING THE PRICE UNDER A STORED DISCOUNT — AND WHAT REALLY HAPPENS.
   *
   * `{ sellingPrice: 2 }` alone would be a violation if the stored
   * discount of 3 survived the edit. MEASURED: it does not. Zod keeps a
   * field's `.default()` through `.partial()`, so `discount` arrives as 0
   * and the route writes that 0 — the row that lands is 2 with no
   * reduction, and there is nothing left for the rule to refuse.
   *
   * The silent wipe is a defect of the EDIT DOOR, not of this rule, and it
   * predates it (the route parsed `offerInputSchema.partial()` before this
   * rule existed, with the same defaults). It is reported, not fixed here.
   * What this pins is the half that is about money: a stored row can never
   * end up with a discount at or above its price, by either direction of
   * edit.
   */
  it('cannot leave a row whose discount reaches its price', () => {
    const lowered = offerPatchSchema(stored).safeParse({ sellingPrice: 2 });
    expect(lowered.success).toBe(true);
    if (lowered.success) expect(lowered.data.discount).toBe(0);
    // And both numbers together — which is what the offers screen sends —
    // is refused when they disagree.
    expect(offerPatchSchema(stored).safeParse({ sellingPrice: 2, discount: 3 }).success).toBe(
      false
    );
  });

  it('accepts a reduction below the stored price', () => {
    const r = offerPatchSchema(stored).safeParse({ discount: 5 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.discount).toBe(5);
  });

  it('accepts both numbers changed together when they agree', () => {
    expect(offerPatchSchema(stored).safeParse({ sellingPrice: 40, discount: 30 }).success).toBe(true);
  });

  it('lets an unrelated edit through without resending the prices', () => {
    // Reordering, activating and choosing the default are the edits the
    // screen sends on their own; none may be blocked by a rule about money.
    expect(offerPatchSchema(stored).safeParse({ sortOrder: 2 }).success).toBe(true);
    expect(offerPatchSchema(stored).safeParse({ status: 'INACTIVE' }).success).toBe(true);
    expect(offerPatchSchema(stored).safeParse({ isDefault: true }).success).toBe(true);
  });

  it('demands nothing the editor did not send — but zod supplies the defaults', () => {
    const r = offerPatchSchema(stored).safeParse({});
    expect(r.success).toBe(true);
    if (!r.success) return;
    // MEASURED, AND REPORTED AS A FINDING: `.partial()` keeps every
    // `.default()`, so an empty edit still parses to a whole default row
    // and the route writes it — moving an offer up the list resets its
    // quantity, its status, its default flag and its discount. Pinned here
    // because it is the reason the rule reads the price from the stored row
    // rather than trusting what a patch leaves out.
    expect(r.data).toEqual({
      quantity: 1,
      freeQuantity: 0,
      discount: 0,
      deliveryIncluded: true,
      isDefault: false,
      sortOrder: 0,
      status: 'ACTIVE',
    });
    // `sellingPrice` has no default, so it is genuinely absent and the
    // route leaves the stored price alone — which is exactly why the rule
    // has to read that price from the row being edited.
    expect('sellingPrice' in r.data).toBe(false);
  });
});
