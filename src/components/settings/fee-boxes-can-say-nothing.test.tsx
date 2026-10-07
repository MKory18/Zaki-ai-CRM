// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * AN EMPTY BOX IS NOT A ZERO — THE BROWSER HALF.
 *
 * `CourierFees.tsx` posted every fee row as
 *
 *     lateThresholdDays: Number(d.lateThresholdDays) || 0,
 *     returnFee: Number(d.returnFee) || 0,
 *
 * `Number('')` is `0`, so **the form could not tell «nothing typed» from
 * «zero typed» and posted 0 either way.** A courier whose return fee nobody
 * knows was recorded as charging nothing, and an empty late-threshold box
 * on an EXISTING row posted 0 over a real 3 — «this parcel is never late»,
 * written by a blank box.
 *
 * It was worse than a bad read, because the two boxes OPENED pre-filled:
 * `String(current?.lateThresholdDays ?? 3)` and `String(current?.returnFee
 * ?? 0)` put the schema's own defaults into the browser and the save wrote
 * them as though a person had typed them. Measured in the audit log on
 * 2026-10-07: **28 `DELIVERY_FEE_CREATED` entries reading exactly
 * `lateThresholdDays: 3, returnFee: 0`** — two runs of the bulk dialog with
 * its boxes untouched — and 13 of the 25 live rows still hold
 * `returnFee 0.00`.
 *
 * These tests read THE BODY ON THE WIRE, not the presence of a name:
 *
 *   · an empty box ⇒ the key is ABSENT from the JSON (so the endpoint, and
 *     through it the column default, decides);
 *   · a typed `0` ⇒ `0` is sent;
 *   · a stored `0` ⇒ the box shows `0`, not a blank and not a default.
 *
 * Put `|| 0` back and the first reads `0` where it expects the key to be
 * gone. Put `?? 3` back and the fourth reads `"3"` in an empty box.
 */

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson, apiFetch: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ failed: vi.fn(), ok: vi.fn(), show: vi.fn() }),
}));

import { CourierFees } from './CourierFees';

const COURIER = 'c0000000-0000-4000-8000-000000000001';
const REGION_PRICED = 'r0000000-0000-4000-8000-00000000000a';
const REGION_EMPTY = 'r0000000-0000-4000-8000-00000000000b';

/**
 * ONE PRICED REGION AND ONE UNPRICED ONE.
 *
 * The priced row carries a late threshold of **3** and a return fee of
 * **0** — the exact pair 13 live rows hold, and the pair the deleted
 * prefills invented.
 */
const STORED_THRESHOLD = 3;
const STORED_RETURN_FEE = 0;

const FEES = {
  regions: [
    { id: REGION_PRICED, name: 'عمّان' },
    { id: REGION_EMPTY, name: 'إربد' },
  ],
  fees: [
    {
      id: 'f1',
      deliveryProviderId: COURIER,
      regionId: REGION_PRICED,
      fee: 2.5,
      lateThresholdDays: STORED_THRESHOLD,
      returnFee: STORED_RETURN_FEE,
      courierCityId: null,
      isActive: true,
    },
  ],
};

/** The JSON body of the single PUT this component sent. */
function sentBody() {
  const put = apiJson.mock.calls.find(
    (c) => c[0] === '/api/settings/delivery-fees' && c[1]?.method === 'PUT'
  );
  if (!put) throw new Error('no PUT was sent');
  return JSON.parse(put[1].body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  apiJson.mockImplementation(async (url: string, init?: { method?: string }) => {
    if (url === '/api/settings/delivery-fees' && !init?.method) return FEES;
    return { fee: {} };
  });
});

afterEach(cleanup);

async function openFees() {
  render(<CourierFees courierId={COURIER} />);
  await waitFor(() => expect(screen.getAllByLabelText('أجرة عمّان').length).toBeGreaterThan(0));
}

/*
 * `Rows` renders the SAME row twice — a table for a desk and cards for a
 * phone — so every control exists twice in the DOM and the `getBy*`
 * singulars all throw. The first copy is the table's, and either copy is
 * driven by the same state.
 */
const first = <T extends HTMLElement>(els: T[]): T => els[0];
const box = (label: string) => first(screen.getAllByLabelText(label)) as HTMLInputElement;
const press = (name: RegExp) => first(screen.getAllByRole('button', { name }));

/** The row's three boxes, by their accessible labels. */
const boxes = (region: string) => ({
  fee: box(`أجرة ${region}`),
  late: box(`حد التأخير في ${region}`),
  ret: box(`أجرة إرجاع ${region}`),
});

describe('a fee box that is left empty says «nothing», not «zero»', () => {
  it('leaves BOTH keys out of the body for a region with no fee row', async () => {
    const user = userEvent.setup();
    await openFees();

    // The unpriced region: only the fee is typed, which is the one field
    // that has no «nothing» to say — an unpriced region blocks shipments.
    await user.type(boxes('إربد').fee, '4');
    await user.click(press(/إضافة/));

    const body = await waitFor(sentBody);
    expect(body.fee).toBe(4);
    // THE ASSERTION THAT `|| 0` BREAKS: absent, not 0.
    expect(Object.keys(body)).not.toContain('lateThresholdDays');
    expect(Object.keys(body)).not.toContain('returnFee');
    expect(body.lateThresholdDays).toBeUndefined();
    expect(body.returnFee).toBeUndefined();
  });

  it('and the two boxes open EMPTY on an unpriced region — no schema default in the browser', async () => {
    await openFees();
    const b = boxes('إربد');
    expect(b.fee.value).toBe('');
    // `?? 3` and `?? 0` used to put these here and then save them.
    expect(b.late.value).toBe('');
    expect(b.ret.value).toBe('');
  });

  it('and does not overwrite a stored 3 when the box is cleared', async () => {
    const user = userEvent.setup();
    await openFees();

    const b = boxes('عمّان');
    expect(b.late.value).toBe(String(STORED_THRESHOLD));
    await user.clear(b.late);
    expect(b.late.value).toBe('');
    await user.click(press(/تحديث/));

    const body = await waitFor(sentBody);
    // The fee did not change, so no reason dialog opens and the PUT goes.
    expect(body.fee).toBe(2.5);
    // `|| 0` sent 0 here, and the endpoint wrote it over the stored 3.
    expect(body).not.toHaveProperty('lateThresholdDays');
    expect(body.lateThresholdDays).not.toBe(0);
  });
});

describe('a fee box with a typed zero says «zero»', () => {
  it('sends 0 for a late threshold somebody typed as 0', async () => {
    const user = userEvent.setup();
    await openFees();

    await user.type(boxes('إربد').fee, '4');
    await user.type(boxes('إربد').late, '0');
    await user.click(press(/إضافة/));

    const body = await waitFor(sentBody);
    expect(body.lateThresholdDays).toBe(0);
    // And it is really there, not merely falsy-equal to a missing key.
    expect(Object.keys(body)).toContain('lateThresholdDays');
  });

  it('sends 0 for a return fee somebody typed as 0', async () => {
    const user = userEvent.setup();
    await openFees();

    await user.type(boxes('إربد').fee, '4');
    await user.type(boxes('إربد').ret, '0');
    await user.click(press(/إضافة/));

    const body = await waitFor(sentBody);
    expect(body.returnFee).toBe(0);
    expect(Object.keys(body)).toContain('returnFee');
  });

  it('and a STORED zero shows as 0 in the box, so the next save keeps it', async () => {
    const user = userEvent.setup();
    await openFees();

    // 13 of 25 live rows hold returnFee 0. Opening that row must not read
    // its zero as «unset» and quietly offer to send nothing instead.
    expect(boxes('عمّان').ret.value).toBe(String(STORED_RETURN_FEE));
    await user.click(press(/تحديث/));

    const body = await waitFor(sentBody);
    expect(body.returnFee).toBe(0);
  });
});

describe('the bulk dialog that writes fourteen regions at once', () => {
  it('opens with both boxes empty and omits them from every row it creates', async () => {
    const user = userEvent.setup();
    await openFees();

    await user.click(press(/عبّئ الفارغة/));

    // The dialog's boxes are labelled by the `<label>` that wraps them.
    const dialogDays = box('حد التأخير (أيام)');
    const dialogReturn = box('أجرة الإرجاع');
    expect(dialogDays.value).toBe('');
    expect(dialogReturn.value).toBe('');

    await user.type(box('الأجرة'), '4');
    await user.click(press(/^عبّئ 1$/));

    const body = await waitFor(sentBody);
    expect(body.fee).toBe(4);
    expect(body).not.toHaveProperty('lateThresholdDays');
    expect(body).not.toHaveProperty('returnFee');
  });
});
