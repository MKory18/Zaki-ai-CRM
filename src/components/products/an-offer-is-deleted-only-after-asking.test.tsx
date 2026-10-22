// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';

/**
 * AN OFFER IS DELETED ONLY AFTER THE QUESTION (22/10).
 *
 * The small bin beside an offer went straight to the door — a price tier somebody had spent a minute on, gone by a slip of the thumb.
 * The door either deletes the offer or, when an order was placed on it, RETIRES it and says so; the question now says both, and a «no»
 * sends nothing.
 */

const { screenApi, confirmMock } = vi.hoisted(() => ({ screenApi: vi.fn(), confirmMock: vi.fn() }));
vi.mock('@/lib/screen-api', () => ({ screenApi }));
vi.mock('@/components/ui/Confirm', () => ({ useConfirm: () => confirmMock }));

import { ProductOffers } from './ProductOffers';

beforeEach(() => {
  // jsdom has no ResizeObserver, and the drag library measures its drop zones with one.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const offer = (id: string, name: string, quantity: number, sortOrder: number) => ({
  id,
  name,
  quantity,
  freeQuantity: 0,
  sellingPrice: 20 * quantity,
  compareAtPrice: null,
  endsAt: null,
  discount: 0,
  deliveryIncluded: true,
  postOrderOffer: false,
  isDefault: false,
  sortOrder,
  status: 'ACTIVE',
});

let sent: Array<{ path: string; method: string }>;
let answer: Record<string, unknown>;

beforeEach(() => {
  sent = [];
  answer = { success: true };
  confirmMock.mockReset();
  screenApi.mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    sent.push({ path, method });
    if (method === 'GET') return { offers: [offer('offer-1', 'قطعة واحدة', 1, 0), offer('offer-2', 'قطعتان', 2, 1)] };
    return answer;
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const deletes = () => sent.filter((s) => s.method === 'DELETE');
const ready = async () => {
  render(<ProductOffers productId="prod-1" basePrice={20} currency="JOD" canManage />);
  await screen.findAllByRole('listitem');
};
const binOf = (i: number) => within(screen.getAllByRole('listitem')[i]).getByLabelText('حذف');
const press = (i: number) =>
  act(async () => {
    fireEvent.click(binOf(i));
  });

describe('the bin asks before it deletes', () => {
  it('— once, in a danger dialog that names THAT offer and says what the door may do instead', async () => {
    confirmMock.mockResolvedValue(false);
    await ready();
    await press(1);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    const asked = confirmMock.mock.calls[0][0] as { title: string; body: string; tone: string };
    expect(asked.tone).toBe('danger');
    expect(asked.title).toContain('قطعتان');
    expect(asked.title).not.toContain('قطعة واحدة');
    expect(asked.body).toContain('يُوقَف بدل الحذف');
  });

  it('— and a «no» sends nothing at all', async () => {
    confirmMock.mockResolvedValue(false);
    await ready();
    await press(0);
    expect(deletes()).toEqual([]);
  });

  it('— and a «yes» sends the same DELETE it always sent, for that offer, once, and reads the list again', async () => {
    confirmMock.mockResolvedValue(true);
    await ready();
    const readsBefore = sent.filter((s) => s.method === 'GET').length;
    await press(1);
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0]).toEqual({ path: '/api/offers/offer-2', method: 'DELETE' });
    await waitFor(() => expect(sent.filter((s) => s.method === 'GET').length).toBeGreaterThan(readsBefore));
  });

  it('— and when the door RETIRES the offer instead, the screen still says so, as it did', async () => {
    confirmMock.mockResolvedValue(true);
    answer = { success: true, retired: true, message: 'العرض مرتبط بـ 3 طلب — تم إيقافه بدل حذفه.' };
    await ready();
    await press(0);
    expect(await screen.findByText('العرض مرتبط بـ 3 طلب — تم إيقافه بدل حذفه.')).toBeTruthy();
  });
});
