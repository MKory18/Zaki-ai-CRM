// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { landingSectionSchema, newSection } from '@/lib/landing-sections';
import { BLOCK_CSS } from '@/components/landing/blocks/styles';
import OrderForm from './OrderForm';
import { repoFile, stripComments } from '@/lib/guard-source';

/**
 * «بظل نموذج الطلب السريع يكون فيه أكثر من شكل إله، وكذلك اختيار العرض… بدي زيو صفحة يوكان».
 *
 * The YouCan form: «اختر الكمية 👇», one radio per bundle («عبوة عدد 2 = 35 دولار»), name and phone side by side,
 * the address under them, one wide button. It is a choice on the form block — and the form as it always was stays
 * the default, untouched, for every page already saved.
 */

afterEach(cleanup);

const offers = [
  { id: 'o1', name: 'عبوة واحدة', quantity: 1, freeQuantity: 0, price: 20, isDefault: true },
  { id: 'o2', name: 'عبوتان', quantity: 2, freeQuantity: 0, price: 35, isDefault: false },
  { id: 'o3', name: 'قطعتان', quantity: 2, freeQuantity: 1, price: 50, isDefault: false },
];

const form = (props: Partial<React.ComponentProps<typeof OrderForm>> = {}) =>
  render(
    <OrderForm
      slug="s" productName="كريم" basePrice={20} currency="USD" offers={offers} recommendations={[]} regions={['دمشق']}
      {...props}
    />
  );

describe('the offer list, as radios', () => {
  it('draws «اختر الكمية» and one radio per bundle, with the price after an equals sign', () => {
    form({ offerStyle: 'radio' });
    expect(screen.getByText(/اختر الكمية/)).toBeTruthy();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(screen.getByText(/عبوتان\s*=/)).toBeTruthy();
    expect(screen.getByText(/35\s*USD/)).toBeTruthy();
    expect(screen.getByText(/\+ 1 هدية مجانية/)).toBeTruthy();
  });

  it('starts on the default bundle, and choosing another moves the selection', () => {
    form({ offerStyle: 'radio' });
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.checked)).toEqual([true, false, false]);
    fireEvent.click(radios[1]);
    expect((screen.getAllByRole('radio') as HTMLInputElement[]).map((r) => r.checked)).toEqual([false, true, false]);
  });

  it('draws the cards instead — and no radios — by default, exactly as before', () => {
    form();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('اختر العرض')).toBeTruthy();
    expect(screen.getAllByText(/اختر هذا العرض|العرض المختار/).length).toBeGreaterThan(0);
  });

  it('NEGATIVE: a page whose own offers block is the picker gets no second list, whatever the style', () => {
    form({ offerStyle: 'radio', showOfferPicker: false });
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});

describe('the compact form', () => {
  const ofForm = () => document.querySelector('form') as HTMLFormElement;
  const half = () => [...document.querySelectorAll('.lp-half')].map((e) => e.querySelector('input')?.name);

  it('puts name and phone side by side — and only those two', () => {
    form({ formStyle: 'compact' });
    expect(ofForm().className).toContain('lp-form-compact');
    expect(half()).toEqual(['full_name', 'phone']);
  });

  it('keeps every field the order needs: name, phone, address, city', () => {
    form({ formStyle: 'compact' });
    for (const name of ['full_name', 'phone', 'address']) expect(ofForm().querySelector(`[name="${name}"]`), name).toBeTruthy();
    expect(ofForm().querySelector('#zf-city')).toBeTruthy();
  });

  it('is the old stacked form by default: no compact class, no half-width fields', () => {
    form();
    expect(ofForm().className).toContain('space-y-4');
    expect(ofForm().className).not.toContain('lp-form-compact');
    expect(half()).toEqual([]);
  });
});

describe('the form block', () => {
  it('reads a page saved before the choice existed as the form it always was', () => {
    const old = { id: 'f1', type: 'form', title: 'أكمل الطلب', subtitle: '' };
    expect(landingSectionSchema.parse(old)).toMatchObject({ formStyle: 'card', offerStyle: 'cards' });
  });

  it('accepts the two new looks, and refuses anything else', () => {
    expect(landingSectionSchema.safeParse({ ...newSection('form'), formStyle: 'compact', offerStyle: 'radio' }).success).toBe(true);
    expect(landingSectionSchema.safeParse({ ...newSection('form'), formStyle: 'wide' }).success).toBe(false);
    expect(landingSectionSchema.safeParse({ ...newSection('form'), offerStyle: 'grid' }).success).toBe(false);
  });

  it('a new form block is the old look unless asked', () => {
    expect(newSection('form')).toMatchObject({ formStyle: 'card', offerStyle: 'cards' });
  });
});

describe('the sheet', () => {
  it('lays the compact form out as two columns with the rest full width', () => {
    expect(BLOCK_CSS).toMatch(/\.lp-form-compact \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(BLOCK_CSS).toMatch(/\.lp-form-compact > \* \{ grid-column: 1 \/ -1; \}/);
    expect(BLOCK_CSS).toMatch(/\.lp-form-compact > \.lp-half \{ grid-column: auto; \}/);
  });

  it('and draws the radio rows with the shop’s accent', () => {
    expect(BLOCK_CSS).toMatch(/\.lp-radio input \{[^}]*accent-color: var\(--store-accent/);
  });
});

describe('the page', () => {
  const view = () => stripComments(repoFile('src/components/landing/LandingPageView.tsx'));

  it('hands the form block’s two choices to the form — a choice nobody passes on is a button that does nothing', () => {
    expect(view()).toContain('formStyle={formChoices?.formStyle}');
    expect(view()).toContain('offerStyle={formChoices?.offerStyle}');
  });

  it('and reads them off the first ENABLED form block only', () => {
    expect(view()).toContain("sections.find((s) => s.type === 'form' && s.enabled)");
  });
});

void vi;
