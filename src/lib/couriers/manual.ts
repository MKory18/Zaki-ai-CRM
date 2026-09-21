import type { CourierAdapter, CourierEvent, CourierShipmentRequest, CourierShipmentResult } from './types';

/**
 * The courier we actually have: a person.
 *
 * Someone hands the parcels over, writes the courier's tracking number on
 * the shipment screen, and updates the status from what the courier tells
 * them. This adapter makes that an explicit implementation rather than an
 * absence, so the rest of the system has exactly one shape to code against.
 */
export const manualAdapter: CourierAdapter = {
  code: 'MANUAL',
  name: 'تسليم يدوي',
  automated: false,

  async createShipment(_req: CourierShipmentRequest): Promise<CourierShipmentResult> {
    throw new Error('MANUAL_COURIER: رقم التتبع يُدخل يدوياً من شاشة الشحنات');
  },

  async fetchEvents(_trackingNumbers: string[]): Promise<CourierEvent[]> {
    return []; // nothing to poll
  },

  mapStatus(): null {
    return null;
  },
};
