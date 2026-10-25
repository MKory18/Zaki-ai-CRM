// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * «بدء الطلب» (InitiateCheckout) from the block form — the form every page built in the editor uses. It was sent from
 * an HTML page's form only, so the seller's switch for it changed nothing on a block page.
 */

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('@/components/tracking/GlobalTrackingProvider', () => ({
  useTracking: () => ({ trackEvent, registerPixels: vi.fn(), setPageContext: vi.fn() }),
}));

import OrderForm from './OrderForm';

afterEach(() => {
  cleanup();
  trackEvent.mockClear();
});

const offers = [
  { id: 'o1', name: 'عبوة واحدة', quantity: 1, freeQuantity: 0, price: 12, isDefault: true },
  { id: 'o2', name: 'عبوتان', quantity: 2, freeQuantity: 1, price: 20, isDefault: false },
];

const draw = () =>
  render(<OrderForm slug="s" productName="ماء الكمأ" basePrice={12} currency="USD" offers={offers} recommendations={[]} regions={['دمشق']} />);

const checkouts = () => trackEvent.mock.calls.filter((c) => c[0] === 'InitiateCheckout');

describe('the order form', () => {
  it('reports «بدء الطلب» the moment a visitor starts filling it, at the chosen offer’s price', () => {
    draw();
    fireEvent.focus(screen.getAllByRole('textbox')[0]);
    expect(checkouts()).toHaveLength(1);
    expect(checkouts()[0][1]).toEqual({ value: 12, currency: 'USD' });
  });

  it('NEGATIVE: once per visit — moving between fields does not report it again', () => {
    draw();
    const boxes = screen.getAllByRole('textbox');
    fireEvent.focus(boxes[0]);
    fireEvent.focus(boxes[1]);
    fireEvent.focus(boxes[0]);
    expect(checkouts()).toHaveLength(1);
  });

  it('NEGATIVE: and not before anybody touches it', () => {
    draw();
    expect(checkouts()).toHaveLength(0);
  });
});
