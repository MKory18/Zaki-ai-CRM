// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * A SYSTEM KEY IS STOPPED ONLY AFTER THE QUESTION (22/10).
 *
 * «أوقفه» sent the revoke at once. A revoked key is never re-enabled — the door sets `revokedAt` and nothing sets it back — so the system
 * that holds it is cut off on the spot and a NEW key has to be made and handed over. A system that has stopped calling in is a bad way
 * to learn that, so the button asks, names the key, and says what it costs.
 */

const { apiJson, apiFetch, confirmMock } = vi.hoisted(() => ({ apiJson: vi.fn(), apiFetch: vi.fn(), confirmMock: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: (...a: unknown[]) => apiJson(...a), apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock('@/components/ui/Confirm', () => ({ useConfirm: () => confirmMock }));

import { SystemTokensPanel } from './SystemTokensPanel';

const token = (id: string, name: string, state: 'ACTIVE' | 'EXPIRED' | 'REVOKED') => ({
  id,
  name,
  system: 'replies',
  prefix: `zk_${id}`,
  scopes: ['orders:read'],
  rateLimitPerMin: 60,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  state,
});

let sent: Array<{ url: string; method: string; body?: string }>;

beforeEach(() => {
  sent = [];
  confirmMock.mockReset();
  apiJson.mockResolvedValue({
    scopeCatalog: [],
    repliesScopes: [],
    defaultDays: 90,
    tokens: [
      token('a1', 'نظام الردود', 'ACTIVE'),
      token('b2', 'مفتاح قديم', 'REVOKED'),
      token('c3', 'مفتاح الاختبار', 'ACTIVE'),
    ],
  });
  apiFetch.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    sent.push({ url, method: init?.method ?? 'GET', body: init?.body });
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const revokes = () => sent.filter((s) => s.method === 'DELETE');
const ready = async () => {
  render(<SystemTokensPanel />);
  await screen.findByText('نظام الردود');
};
/** Of the two keys that are running, the nth one's button — the SECOND by default, so «the first row» is the wrong row. */
const press = (nth = 1) =>
  act(async () => {
    fireEvent.click(screen.getAllByText('أوقفه')[nth]);
  });

describe('«أوقفه» asks before it stops the key', () => {
  it('— once, in a danger dialog that names the key and says it is not undone', async () => {
    confirmMock.mockResolvedValue(false);
    await ready();
    await press();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    const asked = confirmMock.mock.calls[0][0] as { title: string; body: string; tone: string };
    expect(asked.tone).toBe('danger');
    expect(asked.title).toContain('مفتاح الاختبار');
    expect(asked.title, 'سألَ عن مفتاحٍ غيره').not.toContain('نظام الردود');
    expect(asked.body).toContain('لا يُلغى');
    expect(asked.body).toContain('مفتاحاً جديداً');
  });

  it('— and a «no» sends nothing at all', async () => {
    confirmMock.mockResolvedValue(false);
    await ready();
    await press();
    expect(revokes()).toEqual([]);
  });

  it('— and a «yes» sends the same revoke it always sent, for that key, once', async () => {
    confirmMock.mockResolvedValue(true);
    await ready();
    await press();
    await waitFor(() => expect(revokes()).toHaveLength(1));
    expect(revokes()[0].url).toBe('/api/settings/system-tokens');
    expect(JSON.parse(revokes()[0].body as string)).toEqual({ id: 'c3' });
  });

  it('— and the FIRST key’s button is its own: it asks about the first and stops the first', async () => {
    confirmMock.mockResolvedValue(true);
    await ready();
    await press(0);
    await waitFor(() => expect(revokes()).toHaveLength(1));
    expect((confirmMock.mock.calls[0][0] as { title: string }).title).toContain('نظام الردود');
    expect(JSON.parse(revokes()[0].body as string)).toEqual({ id: 'a1' });
  });

  it('— and a key that is already stopped has no button, so nothing asks about it', async () => {
    await ready();
    expect(screen.getAllByText('أوقفه')).toHaveLength(2);
  });
});
