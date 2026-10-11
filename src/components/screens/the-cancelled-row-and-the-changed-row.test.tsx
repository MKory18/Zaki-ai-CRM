// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CANCELLED ROW AND THE CHANGED ROW, ON THE SCREEN ITSELF.
 *
 * «تمييزُ الصفوف: أحمر للملغى، برتقاليّ لمن فيه تعديل».
 *
 * The rule is guarded in two halves already: `Rows` draws two tones
 * (`ui/a-cancelled-row-is-not-a-changed-row`), and `rowToneFor` picks the
 * right one for each alert. Both passed while the screen handed `Rows`
 * nothing at all — FOUND BY MUTATION: replacing the whole prop with
 * `alert={() => null}` broke no test. A rule proved in two pieces with no
 * test over the join is a rule that can ship unwired.
 *
 * So this renders the real screen with two real parcels and reads the
 * ROWS — which is the only place the owner's sentence is actually true or
 * false.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson, apiFetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/ops/tracking',
}));
vi.mock('@/components/ui/Confirm', () => ({
  useAsk: () => async () => null,
  useConfirm: () => async () => false,
}));
vi.mock('@/components/screens/tracking/TransferDialog', () => ({ TransferDialog: () => null }));
vi.mock('@/components/screens/tracking/CollectDialog', () => ({ CollectDialog: () => null }));
vi.mock('@/components/screens/tracking/DeliverDialog', () => ({ DeliverDialog: () => null }));

import { TrackingScreen } from './TrackingScreen';

/** One parcel on its way, carrying whatever alert the test needs. */
function parcel(id: string, tracking: string, alert: unknown) {
  return {
    id,
    orderNumber: `ORD-${id}`,
    merchantRef: null,
    trackingNumber: tracking,
    shippingStatus: 'SHIPPED',
    collectionStatus: 'PENDING_COLLECTION',
    settlementStatus: 'PENDING_COLLECTION',
    daysInTransit: 1,
    lateThresholdDays: 3,
    late: false,
    totalAmount: 40,
    currency: 'JOD',
    deliveryFailureReason: null,
    customer: { fullName: 'سارة', phone: '0790000000', city: 'عمّان' },
    region: { name: 'عمّان' },
    deliveryProvider: { id: 'dp1', name: 'Basha Delivery', kind: 'COMPANY' },
    deliveryFee: 2.5,
    priceIncludesDelivery: false,
    collectedAmount: null,
    expectedCollection: 37.5,
    _count: { deliveryAttempts: 0, notes: 0 },
    alert,
  };
}

const AT = '2026-10-01T00:00:00.000Z';

async function show(parcels: unknown[]) {
  apiJson.mockResolvedValue({ orders: parcels, lateCount: 0, dialCode: '+962' });
  render(<TrackingScreen />);
  await waitFor(() => expect(screen.getAllByText('TRK-A').length).toBeGreaterThan(0));
}

/** The table row carrying this waybill number. */
const rowOf = (tracking: string) =>
  screen.getAllByText(tracking).map((el) => el.closest('tr')).find(Boolean) as HTMLElement;

/**
 * And its phone card — found by the REFERENCE, not the waybill.
 *
 * The waybill column is a labelled line on the card and the reference is
 * the card's heading; looking the card up by the waybill found nothing,
 * which is how this helper was written wrong the first time.
 */
const cardOf = (id: string) =>
  screen.getAllByText(`ORD-${id}`).map((el) => el.closest('li')).find(Boolean) as HTMLElement;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('the screen hands the row its colour', () => {
  it('a cancelled parcel and a changed parcel are two different rows', async () => {
    await show([
      parcel('a', 'TRK-A', { kind: 'CANCELLED', at: AT, acknowledged: false }),
      parcel('b', 'TRK-B', { kind: 'CHANGED', at: AT, acknowledged: false }),
      parcel('c', 'TRK-C', null),
    ]);

    const cancelled = rowOf('TRK-A').className;
    const changed = rowOf('TRK-B').className;
    const quiet = rowOf('TRK-C').className;

    expect(cancelled, 'صفُّ الملغى بلا لون — الشاشةُ لا تُمرِّرُ النبرة').not.toBe(quiet);
    expect(changed, 'صفُّ المعدَّل بلا لون').not.toBe(quiet);
    expect(changed, 'الملغى والمعدَّلُ بنفسِ اللونِ على الشاشة').not.toBe(cancelled);
  });

  it('and the red one is the cancelled one, not the changed one', async () => {
    await show([
      parcel('a', 'TRK-A', { kind: 'CANCELLED', at: AT, acknowledged: false }),
      parcel('b', 'TRK-B', { kind: 'CHANGED', at: AT, acknowledged: false }),
    ]);
    expect(rowOf('TRK-A').className).toMatch(/destructive/);
    expect(rowOf('TRK-B').className).toMatch(/warning/);
  });

  it('and the phone cards say the same two things', async () => {
    await show([
      parcel('a', 'TRK-A', { kind: 'CANCELLED', at: AT, acknowledged: false }),
      parcel('b', 'TRK-B', { kind: 'CHANGED', at: AT, acknowledged: false }),
      parcel('c', 'TRK-C', null),
    ]);
    const cancelled = cardOf('a').className;
    const changed = cardOf('b').className;
    expect(changed, 'البطاقاتُ لم تَفرِّقْ بينَ الحالتين').not.toBe(cancelled);
    expect(cancelled).not.toBe(cardOf('c').className);
  });

  it('and a parcel whose alert was dealt with stops tinting its row', async () => {
    await show([
      parcel('a', 'TRK-A', { kind: 'CANCELLED', at: AT, acknowledged: true }),
      parcel('c', 'TRK-C', null),
    ]);
    expect(rowOf('TRK-A').className, 'ما زالَ يَصرخُ بعدَ أن رآه أحد').toBe(rowOf('TRK-C').className);
    // And it still SAYS what happened — the chip stays, greyed.
    expect(screen.getAllByText(/رآه/).length, 'الشارةُ اختفت مع اللون').toBeGreaterThan(0);
  });
});
