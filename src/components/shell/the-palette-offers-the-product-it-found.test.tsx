// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * Typing a product's name offers the product — one press from its page, under its own heading.
 * The list comes from the server, which sends it only to whoever holds `products.view`; the box
 * has nothing to hide and nothing to filter, and draws no product when none arrives.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ currentUser: { id: 'u1', role: 'SUPER_ADMIN', permissions: [] } }) }));

import { CommandPalette } from './CommandPalette';

let products: { id: string; name: string; sku: string }[];

beforeEach(() => {
  products = [{ id: 'p-1', name: 'كريم الشعر', sku: 'CR-01' }];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => (init?.method === 'POST' ? { facts: [], people: [], products } : { facts: [], may: {} }),
    }))
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

async function typeAndSettle(text: string) {
  render(<CommandPalette groups={[]} canSearchRecords={false} canSwitchStore={false} open onClose={() => {}} />);
  await act(async () => {
    fireEvent.change(screen.getByLabelText('ابحث أو انتقل أو نفّذ'), { target: { value: text } });
  });
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  await act(async () => undefined);
}

describe('the product row', () => {
  it('names the product and its code, under «المنتجات»', async () => {
    await typeAndSettle('كريم');
    expect(screen.getByText('المنتجات')).toBeTruthy();
    expect(screen.getByText('كريم الشعر')).toBeTruthy();
    expect(screen.getByText('CR-01')).toBeTruthy();
  });

  it('opens the product’s own page', async () => {
    await typeAndSettle('كريم');
    await act(async () => {
      fireEvent.click(screen.getByText('كريم الشعر'));
    });
    expect(push).toHaveBeenCalledWith('/products/p-1');
  });

  it('NEGATIVE: when the server sends none there is no heading and no row', async () => {
    products = [];
    await typeAndSettle('كريم');
    expect(screen.queryByText('المنتجات')).toBeNull();
    expect(screen.queryByText('كريم الشعر')).toBeNull();
  });

  it('and the word travels in the body, never in the address', async () => {
    await typeAndSettle('كريم');
    const posts = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(posts.length).toBeGreaterThan(0);
    for (const [url, init] of posts) {
      expect(String(url)).toBe('/api/palette');
      expect(JSON.parse(String((init as RequestInit).body))).toEqual({ q: 'كريم' });
    }
  });
});
