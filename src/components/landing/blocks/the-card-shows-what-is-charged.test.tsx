// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OfferCards } from './OfferCards';
import { toOfferView } from '@/lib/offers';

/**
 * THE CARD PRINTS WHAT THE DOOR CHARGES.
 *
 * Measured on the running app, against the real database, before a line of
 * this was written. The landing page drew two cards:
 *
 *   «قطعتان بحسم ٣ — …»   25 JOD   ·  12.50 / قطعة
 *   «2 قطع»                25 JOD   ·  12.50 / قطعة
 *
 * and the cart quote priced the first at 22. Two cards a customer cannot
 * tell apart, three dinars apart at the door — and the cheap one is the one
 * whose own NAME says «بحسم ٣», a reduction the page had no field to show.
 * The same quote response carried BOTH figures (`subtotal: 25`, `cod: 22`),
 * so the system knew and the page printed the wrong one.
 *
 * The view is built here by the REAL `toOfferView`. A fixture typed by hand
 * would let the card and the rule drift apart, which is the whole defect
 * wearing a different coat.
 */

const JOD = 3;

const row = {
  id: 'o1',
  name: 'قطعتان بحسم ٣',
  quantity: 2,
  freeQuantity: 0,
  sellingPrice: 25,
  discount: 3,
  compareAtPrice: null as number | null,
  isDefault: true,
};

/** The plain bundle beside it: same pieces, same listed price, no reduction. */
const plain = { ...row, id: 'o2', name: '2 قطع', discount: 0 };

function draw(...rows: (typeof row)[]) {
  render(
    <OfferCards offers={rows.map((r) => toOfferView(r, JOD))} currency="JOD" />
  );
}

afterEach(cleanup);

describe('the offer card and the door agree', () => {
  it('prints the charged figure, and strikes through what it was', () => {
    draw(row);
    const card = screen.getByRole('button');
    // The charge first — a failure here must print the money, not a layout.
    expect(card.textContent).toContain('22');
    const struck = card.querySelector('s');
    expect(struck?.textContent).toBe('25');
  });

  it('and the per-piece figure follows it — 11, not 12.50', () => {
    /*
     * This is the half a customer actually compares bundles on, and it is
     * derived from the card's own price. For as long as that was the
     * pre-discount figure the page advertised a unit price no door charged.
     */
    draw(row);
    expect(screen.getByRole('button').textContent).toContain('11.00');
    expect(screen.getByRole('button').textContent).not.toContain('12.50');
  });

  it('so the two bundles stop looking identical', () => {
    draw(row, plain);
    const [discounted, full] = screen.getAllByRole('button');
    expect(discounted.textContent).toContain('22');
    expect(full.textContent).toContain('25');
    expect(full.querySelector('s')).toBeNull();
    // The thing a shopper was asked to choose between, measured: the two
    // cards no longer read the same.
    expect(discounted.textContent).not.toBe(full.textContent);
  });

  it('shows one struck-through figure, never two', () => {
    /*
     * A bundle may carry both a reduction and an evidenced past price. Two
     * strikes on one price is not a saving, it is a puzzle — the certainty
     * about today wins and the claim about the past falls behind it.
     */
    render(
      <OfferCards
        offers={[toOfferView({ ...row, compareAtPrice: 40 }, JOD, 40)]}
        currency="JOD"
      />
    );
    const card = screen.getByRole('button');
    expect(card.querySelectorAll('s')).toHaveLength(1);
    expect(card.querySelector('s')?.textContent).toBe('25');
  });

  it('and a bundle with no reduction strikes nothing of its own', () => {
    draw(plain);
    const card = screen.getByRole('button');
    expect(card.textContent).toContain('25');
    expect(card.querySelector('s')).toBeNull();
  });

  it('still shows an evidenced «was» when there is no reduction to show', () => {
    // The older rule is not displaced, only out-ranked. Without a discount
    // of its own, the evidenced past price is the one honest strike left.
    render(
      <OfferCards offers={[toOfferView({ ...plain, compareAtPrice: 40 }, JOD, 40)]} currency="JOD" />
    );
    expect(screen.getByRole('button').querySelector('s')?.textContent).toBe('40');
  });
});
