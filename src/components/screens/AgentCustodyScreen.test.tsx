// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * THE CUSTODY SCREEN MUST NOT SAY «حصّله» ABOUT MONEY NOBODY RECORDED.
 *
 * «عهدة المندوب: لما أدخل صفحة كل مندوب، العهدة ما بتظهر إشي.»
 *
 * The custody itself was never missing — this screen exists, it is in the
 * navigation, and the endpoint answers. What it printed was worse than
 * missing: the ORDER TOTAL under the word «حصّله» for every delivered order
 * whose collected amount nobody has recorded, which on this database is all
 * of them, because the door does not write it — the settlement does.
 *
 * So the test is about words, and it renders the screen because the words are
 * the defect.
 */

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: (...a: unknown[]) => apiJson(...a) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/finance/agents' }));

import { AgentCustodyScreen } from './AgentCustodyScreen';

const AGENT = { id: 'ag1', name: 'أبو علي', code: 'AGENT-ALI' };

/** Exactly the dev-database shape: one delivered order, no amount recorded. */
const UNRECORDED = {
  inHandCount: 0,
  inHandValue: 0,
  collected: 0,
  fees: 0,
  balance: 0,
  awaitingCount: 1,
  awaitingValue: 20,
  awaitingFees: 3,
  hasUnconfirmed: true,
};

const SETTLED_SHAPE = {
  inHandCount: 0,
  inHandValue: 0,
  collected: 50,
  fees: 5,
  balance: 45,
  awaitingCount: 0,
  awaitingValue: 0,
  awaitingFees: 0,
  hasUnconfirmed: false,
};

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  orderNumber: 'SY-2026-0162',
  customerName: 'زبون',
  regionName: 'دمشق',
  shippingStatus: 'DELIVERED',
  shippedAt: '2026-09-01T00:00:00.000Z',
  deliveredAt: '2026-09-05T00:00:00.000Z',
  orderValue: 20,
  collected: null,
  fee: 3,
  ...over,
});

function answer(totals: typeof UNRECORDED, owing: ReturnType<typeof order>[]) {
  apiJson.mockImplementation(async (url: string) => {
    if (url === '/api/finance/agents') {
      return { currencyCode: 'USD', minorUnit: 2, agents: [{ agent: AGENT, totals }] };
    }
    return { custody: { agent: AGENT, currencyCode: 'USD', inHand: [], owing, totals } };
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('the list of agents', () => {
  it('names the collected figure as the CONFIRMED one, not just «حصّل»', async () => {
    answer(SETTLED_SHAPE, []);
    render(<AgentCustodyScreen />);
    await waitFor(() => expect(screen.getByText('أبو علي')).toBeTruthy());
    expect(screen.getAllByText(/حصّل مؤكَّد/).length).toBeGreaterThan(0);
  });

  it('refuses to call an agent «متوازن» when nothing about him is confirmed', async () => {
    answer(UNRECORDED, []);
    render(<AgentCustodyScreen />);
    await waitFor(() => expect(screen.getByText('أبو علي')).toBeTruthy());

    expect(screen.queryByText(/متوازن/), 'قال «متوازن» عن مندوبٍ لا مبلغ مؤكَّد له').toBeNull();
    expect(screen.getByText(/لا مبلغ مؤكَّد بعد/)).toBeTruthy();
  });

  it('says how many delivered orders carry no recorded amount, and that they are excluded', async () => {
    answer(UNRECORDED, []);
    render(<AgentCustodyScreen />);
    await waitFor(() => expect(screen.getByText(/سُلّم بلا مبلغ مسجَّل/)).toBeTruthy());
    expect(screen.getByText(/غير محتسب/)).toBeTruthy();
  });

  it('never prints the order value as money he owes', async () => {
    answer(UNRECORDED, []);
    render(<AgentCustodyScreen />);
    await waitFor(() => expect(screen.getByText('أبو علي')).toBeTruthy());
    expect(screen.queryByText(/عليه/), 'قيمةُ الطلبات ظهرت ديناً عليه').toBeNull();
  });
});

describe('one agent’s page', () => {
  it('puts the unrecorded orders in their own section, with the reason in words', async () => {
    answer(UNRECORDED, [order()]);
    render(<AgentCustodyScreen />);
    await waitFor(() => expect(screen.getByText('أبو علي')).toBeTruthy());
    await userEvent.click(screen.getByText('أبو علي'));

    await waitFor(() => expect(screen.getByText('سُلّمت ولا مبلغ مؤكَّد')).toBeTruthy());
    // The reason, not a dash: the amount is written when the settlement is
    // approved, and the system does not guess it before then.
    expect(screen.getAllByText(/يُكتب حين تُعتمد التسوية/).length).toBeGreaterThan(0);
    // And the row's own figure is labelled as the ORDER's value.
    expect(screen.getByText(/قيمة الطلب/)).toBeTruthy();
  });

  it('sends whoever wants the money to the manual collection, not to the statement screen', async () => {
    // An agent files no statement; /finance/collection cannot be submitted
    // without one, so that door was a dead end for exactly this person.
    answer(UNRECORDED, [order()]);
    render(<AgentCustodyScreen />);
    await waitFor(() => expect(screen.getByText('أبو علي')).toBeTruthy());
    await userEvent.click(screen.getByText('أبو علي'));

    await waitFor(() => expect(screen.getByText(/سجّل تحصيلاً يدويّاً/)).toBeTruthy());
    const link = screen.getByText(/سجّل تحصيلاً يدويّاً/).closest('a');
    expect(link?.getAttribute('href')).toBe('/ops/tracking');
  });

  it('shows a confirmed amount plainly when one exists', async () => {
    answer(SETTLED_SHAPE, [order({ collected: 50, fee: 5, orderValue: 50 })]);
    render(<AgentCustodyScreen />);
    await waitFor(() => expect(screen.getByText('أبو علي')).toBeTruthy());
    await userEvent.click(screen.getByText('أبو علي'));

    await waitFor(() => expect(screen.getByText('حصّله ولم يسلّمه')).toBeTruthy());
    expect(screen.queryByText('سُلّمت ولا مبلغ مؤكَّد')).toBeNull();
    expect(screen.queryByText(/قيمة الطلب/)).toBeNull();
  });
});
