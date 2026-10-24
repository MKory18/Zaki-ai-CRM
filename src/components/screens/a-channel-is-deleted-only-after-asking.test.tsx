// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * A CHANNEL IS DELETED ONLY AFTER THE QUESTION (22/10).
 *
 * The bin icon beside a channel went straight to the door: a name somebody had typed, gone on one press. It is drawn only while nothing
 * came through the channel (so the door's «عليها N طلب» refusal is a race, not the case), which means what goes is the row and its
 * name — and the screen's own «إيقاف» is the way to keep it without using it. It asks first now, like every other delete.
 */

const { apiJson, confirmMock } = vi.hoisted(() => ({ apiJson: vi.fn(), confirmMock: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: (...a: unknown[]) => apiJson(...a) }));
vi.mock('@/components/ui/Confirm', () => ({ useConfirm: () => confirmMock }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ failed: vi.fn(), success: vi.fn() }) }));
vi.mock('@/components/ui/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/ui/Money', () => ({ Money: () => <span /> }));
vi.mock('@/components/ui/HealthChip', () => ({ HealthChip: () => null }));
// The screen links to the performance board (where the channel score moved) for whoever may open it.
vi.mock('@/hooks/useMayOpen', () => ({ useMayOpen: () => () => true }));

import { ChannelsScreen } from './ChannelsScreen';

const UNUSED = { id: 'ch-unused', name: 'صفحة الكريم', kind: 'TIKTOK', isActive: true, sortOrder: 0, orders: 0 };
const USED = { id: 'ch-used', name: 'صفحة القطرة', kind: 'FACEBOOK', isActive: true, sortOrder: 1, orders: 7 };

let sent: Array<{ url: string; method: string }>;

beforeEach(() => {
  sent = [];
  confirmMock.mockReset();
  apiJson.mockImplementation(async (url: string, init?: { method?: string }) => {
    const method = init?.method ?? 'GET';
    sent.push({ url, method });
    if (url === '/api/settings/channels' && method === 'GET') return { channels: [UNUSED, USED] };
    if (url.endsWith('/performance')) throw new Error('403');
    return { success: true };
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const deletes = () => sent.filter((s) => s.method === 'DELETE');
const bin = () => screen.getByLabelText('حذف — لا طلبات عليها');
const ready = async () => {
  render(<ChannelsScreen />);
  await screen.findByText('صفحة الكريم');
};

describe('the bin icon asks before it deletes', () => {
  it('— once, in a danger dialog that names the channel, and says the way to keep it', async () => {
    confirmMock.mockResolvedValue(false);
    await ready();
    await act(async () => {
      fireEvent.click(bin());
    });
    expect(confirmMock).toHaveBeenCalledTimes(1);
    const asked = confirmMock.mock.calls[0][0] as { title: string; body: string; tone: string };
    expect(asked.tone).toBe('danger');
    expect(asked.title).toContain('صفحة الكريم');
    expect(asked.body).toContain('إيقاف');
  });

  it('— and a «no» sends nothing at all', async () => {
    confirmMock.mockResolvedValue(false);
    await ready();
    await act(async () => {
      fireEvent.click(bin());
    });
    expect(deletes()).toEqual([]);
  });

  it('— and a «yes» sends the same DELETE it always sent, once, and reads the list again', async () => {
    confirmMock.mockResolvedValue(true);
    await ready();
    const readsBefore = sent.filter((s) => s.url === '/api/settings/channels' && s.method === 'GET').length;
    await act(async () => {
      fireEvent.click(bin());
    });
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0]).toEqual({ url: '/api/settings/channels/ch-unused', method: 'DELETE' });
    await waitFor(() =>
      expect(sent.filter((s) => s.url === '/api/settings/channels' && s.method === 'GET').length).toBeGreaterThan(readsBefore)
    );
  });

  it('— and a channel that has orders has no bin at all, as before', async () => {
    await ready();
    expect(screen.getAllByLabelText('حذف — لا طلبات عليها')).toHaveLength(1);
  });
});
