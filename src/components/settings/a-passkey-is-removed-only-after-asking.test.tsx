// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * A PASSKEY IS REMOVED ONLY AFTER THE QUESTION (22/10).
 *
 * The bin beside a passkey removed it on one press — one of the ways this person signs in. It asks first now, names the key, and says
 * that to use it again it has to be registered again.
 */

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock('@/components/ui/Confirm', () => ({ useConfirm: () => confirmMock }));
vi.mock('@/lib/passkey-browser', () => ({ createPasskey: vi.fn(), passkeySupported: async () => true }));

import { PasskeySection } from './PasskeySection';

const KEYS = [
  { id: 'k1', label: 'مفتاح الهاتف', createdAt: '2026-09-01T00:00:00.000Z', lastUsedAt: null },
  { id: 'k2', label: 'مفتاح الحاسوب', createdAt: '2026-09-02T00:00:00.000Z', lastUsedAt: '2026-10-01T00:00:00.000Z' },
];

let sent: Array<{ url: string; method: string }>;

beforeEach(() => {
  sent = [];
  confirmMock.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string }) => {
      sent.push({ url, method: init?.method ?? 'GET' });
      return { ok: true, status: 200, json: async () => ({ keys: KEYS }) };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const deletes = () => sent.filter((s) => s.method === 'DELETE');
const ready = async () => {
  render(<PasskeySection />);
  await screen.findByText('مفتاح الحاسوب');
};
const press = (label: string) =>
  act(async () => {
    fireEvent.click(screen.getByLabelText(`احذف ${label}`));
  });

describe('the bin asks before it removes', () => {
  it('— once, in a danger dialog that names THAT key', async () => {
    confirmMock.mockResolvedValue(false);
    await ready();
    await press('مفتاح الحاسوب');
    expect(confirmMock).toHaveBeenCalledTimes(1);
    const asked = confirmMock.mock.calls[0][0] as { title: string; body: string; tone: string };
    expect(asked.tone).toBe('danger');
    expect(asked.title).toContain('مفتاح الحاسوب');
    expect(asked.title).not.toContain('مفتاح الهاتف');
    expect(asked.body).toContain('من جديد');
  });

  it('— and a «no» sends nothing at all', async () => {
    confirmMock.mockResolvedValue(false);
    await ready();
    await press('مفتاح الهاتف');
    expect(deletes()).toEqual([]);
  });

  it('— and a «yes» sends the same DELETE it always sent, for THAT key, once — the second row’s key is the second row’s', async () => {
    confirmMock.mockResolvedValue(true);
    await ready();
    await press('مفتاح الحاسوب');
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0].url).toBe('/api/auth/passkey?id=k2');
  });

  it('— and the first row’s bin is its own', async () => {
    confirmMock.mockResolvedValue(true);
    await ready();
    await press('مفتاح الهاتف');
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0].url).toBe('/api/auth/passkey?id=k1');
  });
});
