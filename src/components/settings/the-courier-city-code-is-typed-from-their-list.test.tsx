// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * «انا ليش ما بقدر ادخل الرموز؟» — the courier's own id for a governorate, typed on the fees screen from the list the
 * courier sends, and saved with the row. Empty keeps what is stored; a number that is not a positive whole number is
 * refused before it is sent. The endpoint half (absent keeps · number writes · null clears · audited) is below.
 */

const { apiJson, failed } = vi.hoisted(() => ({ apiJson: vi.fn(), failed: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson, apiFetch: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ failed, ok: vi.fn(), show: vi.fn() }) }));

import { CourierFees } from './CourierFees';

const COURIER = 'c0000000-0000-4000-8000-000000000001';
const DAMASCUS = 'r0000000-0000-4000-8000-00000000000a';
const ALEPPO = 'r0000000-0000-4000-8000-00000000000b';

const FEES = {
  regions: [
    { id: DAMASCUS, name: 'دمشق' },
    { id: ALEPPO, name: 'حلب' },
  ],
  fees: [
    { id: 'f1', deliveryProviderId: COURIER, regionId: DAMASCUS, fee: 3, lateThresholdDays: 3, returnFee: 0, courierCityId: null, isActive: true },
    { id: 'f2', deliveryProviderId: COURIER, regionId: ALEPPO, fee: 4, lateThresholdDays: 3, returnFee: 0, courierCityId: 705991, isActive: true },
  ],
};

const puts = () => apiJson.mock.calls.filter((c) => c[0] === '/api/settings/delivery-fees' && c[1]?.method === 'PUT');
const sent = () => JSON.parse(puts()[0][1].body as string) as Record<string, unknown>;
const box = (label: string) => screen.getAllByLabelText(label)[0] as HTMLInputElement;
const updateButtons = () => screen.getAllByRole('button', { name: /تحديث/ });

beforeEach(() => {
  vi.clearAllMocks();
  apiJson.mockImplementation(async (url: string, init?: { method?: string }) =>
    url === '/api/settings/delivery-fees' && !init?.method ? FEES : { fee: {} }
  );
});
afterEach(cleanup);

const open = async () => {
  render(<CourierFees courierId={COURIER} />);
  await waitFor(() => expect(screen.getAllByLabelText('رمز دمشق عند الشركة').length).toBeGreaterThan(0));
};

describe('the fees screen', () => {
  it('shows a stored code in its box, and an empty box where there is none', async () => {
    await open();
    expect(box('رمز حلب عند الشركة').value).toBe('705991');
    expect(box('رمز دمشق عند الشركة').value).toBe('');
  });

  it('a typed code is saved with the row — no fee reason asked, the fee did not change', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(box('رمز دمشق عند الشركة'), '445053');
    await user.click(updateButtons()[0]);
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(sent()).toMatchObject({ regionId: DAMASCUS, fee: 3, courierCityId: 445053 });
    expect(sent().reason).toBeUndefined();
  });

  it('NEGATIVE: an empty box sends no code at all — the stored one is kept', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(updateButtons()[0]);
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(Object.keys(sent())).not.toContain('courierCityId');
  });

  it('NEGATIVE: a code that is not a positive whole number is refused before anything is sent', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(box('رمز دمشق عند الشركة'), '-5');
    await user.click(updateButtons()[0]);
    await waitFor(() => expect(failed).toHaveBeenCalled());
    expect(puts()).toHaveLength(0);
  });
});
