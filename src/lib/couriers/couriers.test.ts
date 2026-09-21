import { describe, expect, it } from 'vitest';
import type { ShippingStatus } from '@/lib/shipping-workflow';
import {
  adapterFor,
  isAutomated,
  isAutoApplicable,
  manualAdapter,
  registerAdapter,
  COURIER_CANNOT_ASSERT,
  type CourierAdapter,
  type CourierEvent,
} from './index';

/**
 * The courier seam. These tests exist to make one rule impossible to lose
 * when a real integration lands: a courier feed never decides DELIVERED.
 */

const event = (over: Partial<CourierEvent> = {}): CourierEvent => ({
  trackingNumber: 'TR-1',
  rawStatus: 'in_transit',
  occurredAt: new Date('2026-09-20T10:00:00Z'),
  status: 'SHIPPED',
  ...over,
});

describe('adapter selection', () => {
  it('falls back to manual for a provider with no integration', () => {
    expect(adapterFor({ code: 'ARAMEX', apiEnabled: false })).toBe(manualAdapter);
    expect(adapterFor(null)).toBe(manualAdapter);
    expect(isAutomated({ code: 'ARAMEX', apiEnabled: false })).toBe(false);
  });

  it('stays manual for an unknown code even when the API flag is on', () => {
    expect(adapterFor({ code: 'NOT_BUILT_YET', apiEnabled: true })).toBe(manualAdapter);
  });

  it('uses a registered adapter only when that provider has the API enabled', () => {
    const fake: CourierAdapter = {
      code: 'FAKE', name: 'Fake', automated: true,
      createShipment: async () => ({ trackingNumber: 'X' }),
      fetchEvents: async () => [],
      mapStatus: () => null,
    };
    registerAdapter(fake);

    expect(adapterFor({ code: 'FAKE', apiEnabled: true })).toBe(fake);
    expect(adapterFor({ code: 'fake', apiEnabled: true })).toBe(fake); // case-insensitive
    expect(adapterFor({ code: 'FAKE', apiEnabled: false })).toBe(manualAdapter);
  });
});

describe('a courier is not a platform', () => {
  it('runs a courier on the adapter its adapterCode names, not its own code', () => {
    const platform: CourierAdapter = {
      code: 'PLATFORM', name: 'Platform', automated: true,
      createShipment: async () => ({ trackingNumber: 'X' }),
      fetchEvents: async () => [],
      mapStatus: () => null,
    };
    registerAdapter(platform);

    // Basha ships THROUGH the platform: its own code stays BASHA.
    expect(adapterFor({ code: 'BASHA', adapterCode: 'PLATFORM', apiEnabled: true })).toBe(platform);
  });

  it('falls back to its own code when no adapter is named', () => {
    expect(adapterFor({ code: 'PLATFORM', apiEnabled: true }).code).toBe('PLATFORM');
  });

  it('stays manual when the named adapter has no credentials configured', () => {
    // LOGESTECHS builds from the environment; with none set there is
    // nothing to call, so it must not pretend to be automated.
    expect(adapterFor({ code: 'BASHA', adapterCode: 'LOGESTECHS', apiEnabled: true, apiConfig: { companyId: 744 } }))
      .toBe(manualAdapter);
  });
});

describe('the manual adapter is the honest description of today', () => {
  it('has nothing to poll and refuses to invent a tracking number', async () => {
    expect(await manualAdapter.fetchEvents(['TR-1'])).toEqual([]);
    await expect(
      manualAdapter.createShipment({
        orderId: 'o1', merchantRef: 'ORD-1', codAmount: 10, currencyCode: 'JOD',
        customer: { fullName: 'x', phone: '07', address: 'y', regionName: null },
        pieces: 1,
      })
    ).rejects.toThrow(/MANUAL_COURIER/);
  });
});

describe('a courier feed never decides that money is owed', () => {
  it('refuses to auto-apply DELIVERED, RETURNED or CANCELLED', () => {
    for (const status of COURIER_CANNOT_ASSERT) {
      expect(isAutoApplicable(event({ status })), status).toBe(false);
    }
  });

  it('refuses to auto-apply a status it could not recognise', () => {
    expect(isAutoApplicable(event({ status: null, rawStatus: 'weird_code_47' }))).toBe(false);
  });

  it('applies the in-transit statuses, which move no money', () => {
    for (const status of ['SHIPPED', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY'] as ShippingStatus[]) {
      expect(isAutoApplicable(event({ status })), status).toBe(true);
    }
  });

  it('guards exactly the statuses that start or reverse a payout', () => {
    // If this list ever shrinks, a courier string starts moving money.
    expect(COURIER_CANNOT_ASSERT).toEqual([
      'DELIVERED',
      'PARTIALLY_DELIVERED',
      'RETURNED',
      'CANCELLED',
    ]);
  });
});
