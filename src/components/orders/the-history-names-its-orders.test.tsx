// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * The customer's history lists their other orders by number. The number was text; it opens
 * the order it names now, for whoever may open the orders screen (`OrderLink`).
 */

const { may } = vi.hoisted(() => ({ may: { yes: true } }));
vi.mock('@/hooks/useMayOpen', () => ({ useMayOpen: () => () => may.yes }));
vi.mock('@/lib/api-client', () => ({
  apiJson: async () => ({
    customer: { fullName: 'زبون', rawPhone: '0790000000', totalOrders: 1, deliveredOrders: 1, cancelledOrders: 0 },
    risk: { tier: 'SAFE', returnRate: 0, orders: 1, returns: 0, requiresPrepaymentOrApproval: false },
    orders: [
      {
        id: 'o-1', orderNumber: 'ORD-26-0001', createdAt: '2026-10-01T10:00:00.000Z', state: 'DELIVERED',
        totalAmount: 40, currency: 'JOD', rejectionReason: null, returnReason: null,
        store: { name: 'متجر' }, items: [],
      },
    ],
  }),
}));

import { CustomerHistoryModal } from './CustomerHistory';

afterEach(() => {
  cleanup();
  may.yes = true;
});

describe('the customer history', () => {
  it('names each order with a link to it', async () => {
    render(<CustomerHistoryModal customerId="c1" onClose={() => {}} />);
    const link = await screen.findByRole('link', { name: 'ORD-26-0001' });
    expect(link.getAttribute('href')).toBe('/orders/o-1');
  });

  it('NEGATIVE: and for somebody who may not open the orders it is the number as text', async () => {
    may.yes = false;
    render(<CustomerHistoryModal customerId="c1" onClose={() => {}} />);
    expect(await screen.findByText('ORD-26-0001')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'ORD-26-0001' })).toBeNull();
  });
});
