import type { ShippingStatus } from '@/lib/shipping-workflow';

/**
 * The seam every courier integration plugs into.
 *
 * Today one courier is handled by a human typing a tracking number and
 * updating the status; LogesTechs would be a second implementation of THIS
 * interface and nothing else. Writing the boundary now is what stops the
 * first real integration from scattering courier-specific branches through
 * the shipment, tracking and settlement code.
 *
 * The rule that matters: a courier tells us what it observed, and we decide
 * what that means. No adapter writes an order status directly — it returns
 * events, the caller applies them through the normal transition machine.
 */

export interface CourierShipmentRequest {
  orderId: string;
  merchantRef: string;
  codAmount: number;
  currencyCode: string;
  customer: { fullName: string; phone: string; address: string; regionName: string | null };
  pieces: number;
  note?: string | null;
  /**
   * The courier's OWN id for the destination, when we hold it.
   *
   * Agreed once per region and stored on the delivery-fee row. An adapter
   * that has it addresses the parcel with it; one that does not falls back
   * to asking the courier to find the region by name, which costs a round
   * trip and can match the wrong place when several come back.
   */
  cityId?: number;
}

export interface CourierShipmentResult {
  trackingNumber: string;
  /** Some couriers return their own label; we print ours when they do not. */
  labelUrl?: string | null;
  raw?: unknown;
}

export interface CourierEvent {
  trackingNumber: string;
  /** What the courier called it, kept verbatim for the audit trail. */
  rawStatus: string;
  occurredAt: Date;
  /**
   * Our status, or null when the courier's code is not one we recognise.
   * Null means "a human decides" — never a guess.
   */
  status: ShippingStatus | null;
  /** Present when the courier reports a partial or adjusted collection. */
  collectedAmount?: number | null;
  note?: string | null;
  raw?: unknown;
}

export interface CourierAdapter {
  /** Matches DeliveryProvider.code. */
  readonly code: string;
  readonly name: string;
  /** False for the manual adapter: nothing to call, nothing to poll. */
  readonly automated: boolean;

  createShipment(req: CourierShipmentRequest): Promise<CourierShipmentResult>;
  fetchEvents(trackingNumbers: string[]): Promise<CourierEvent[]>;
  /** Courier status code → ours. Unknown codes MUST return null. */
  mapStatus(rawStatus: string): ShippingStatus | null;
}

/**
 * Statuses an automated courier feed may NEVER assert on its own.
 *
 * DELIVERED makes commission accrue and money expected. RETURNED reverses
 * it. PARTIALLY_DELIVERED needs the amount actually collected and which
 * lines came back, and only the person at the door knows that.
 *
 * A feed that guesses any of them — or an adapter that maps an unrecognised
 * code onto one — would move money on a string we do not understand. They
 * stay a human decision, taken on the screen, against the courier's own
 * statement.
 */
export const COURIER_CANNOT_ASSERT: ShippingStatus[] = [
  'DELIVERED',
  'PARTIALLY_DELIVERED',
  'RETURNED',
  'CANCELLED',
];

/** True when this event is safe to apply automatically. */
export function isAutoApplicable(event: CourierEvent): boolean {
  return event.status !== null && !COURIER_CANNOT_ASSERT.includes(event.status);
}
