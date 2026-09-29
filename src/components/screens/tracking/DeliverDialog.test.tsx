// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * THE DOOR SAYS THE ORDER IS NOT FINISHED.
 *
 *   «بصير الطلب بيتمم مرتين — مرة بيتمم للمستلم ومرة للطلب الراجع. واذا اتمم
 *    واحد فهو اتمم جزءي، ما بنغلق غير كامل»
 *
 * A follow-up agent unticks one unit, presses «تسليم جزئي» and the dialog
 * closes. That is the only moment they can be told a second settlement now
 * exists, and the dialog said nothing about it — so the refused units and the
 * money both waited for somebody who did not know they were waiting.
 *
 * Stated only when it applies. A notice shown on every full delivery is a
 * notice people learn to skip, and then it is not there on the day it matters.
 */

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: (...a: unknown[]) => apiJson(...a) }));

import { DeliverDialog } from './DeliverDialog';

/** One line of three units — 41 lines in this database look like this. */
const ITEMS = [
  { id: 'i1', productName: 'ماء الكمأ', quantity: 3, freeQuantity: 0, unitPrice: 10, discountShare: 0 },
];

const open = async () => {
  apiJson.mockResolvedValue({ order: { items: ITEMS } });
  render(
    <DeliverDialog
      order={{ id: 'o1', orderNumber: 'SY-2026-0148', merchantRef: null, currency: 'SYP', deliveryFee: 5, priceIncludesDelivery: false }}
      onClose={() => {}}
      onDone={() => {}}
    />
  );
  // The lines arrive pre-ticked at the full quantity: everything taken is the
  // common case and unticking is the exception.
  await waitFor(() => screen.getByDisplayValue('3'));
};

const setTaken = async (value: string) => {
  const input = screen.getByRole('spinbutton');
  await userEvent.clear(input);
  await userEvent.type(input, value);
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('nothing in the dialog draws white', () => {
  it('every field is the system field, with its background and focus ring', async () => {
    // «إذا كانت بيضا فتكون أزرق». Nothing in this product declares
    // `color-scheme`, so a control that names no background is painted white
    // by the browser in every theme — and the per-line quantity box was one.
    await open();
    const fields = [...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input')];
    expect(fields.length).toBeGreaterThan(1);
    for (const f of fields) {
      expect(f.className).toContain('bg-[var(--sys-card)]');
      expect(f.className).toContain('focus:ring-[var(--sys-primary)]/25');
    }
  });

  it('stands the refuse button and the quantity box at one height', async () => {
    // `min-h-11 md:min-h-0` with `py-1` collapsed the button to its text on a
    // desk, a few pixels short of the box beside it, and the box itself was
    // `md:h-8` — off the scale in the other direction.
    await open();
    expect(screen.getByRole('button', { name: 'رفضه' }).className).toContain('h-11');
    expect(screen.getByRole('button', { name: 'رفضه' }).className).toContain('md:h-10');
    const qty = screen.getByRole('spinbutton');
    expect(qty.className).toContain('h-11');
    expect(qty.className).toContain('md:h-10');
    expect(qty.className).not.toContain('md:h-8');
  });
});

describe('the door names the second settlement it is creating', () => {
  it('says nothing on a whole delivery — there is no second half', async () => {
    await open();
    expect(screen.queryByText(/يُتَمَّم مرتين/)).toBeNull();
    expect(screen.getByRole('button', { name: /تسليم كامل/ })).toBeTruthy();
  });

  it('names both halves once some units are refused', async () => {
    await open();
    await setTaken('2');
    expect(screen.getByText(/يُتَمَّم مرتين/)).toBeTruthy();
    expect(screen.getByText(/تحصيل مال ما استلمه العميل/)).toBeTruthy();
    expect(screen.getByText(/شاشة المرتجعات/)).toBeTruthy();
  });

  it('says nothing on a whole refusal — that is one half, and it is the goods', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'رفضه' }));
    expect(screen.queryByText(/يُتَمَّم مرتين/)).toBeNull();
    expect(screen.getByRole('button', { name: /تسجيل كمرتجع/ })).toBeTruthy();
  });
});
