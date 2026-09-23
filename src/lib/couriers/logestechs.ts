import type { ShippingStatus } from '@/lib/shipping-workflow';
import type {
  CourierAdapter,
  CourierEvent,
  CourierShipmentRequest,
  CourierShipmentResult,
} from './types';

/**
 * LogesTechs.
 *
 * Built from their API documentation (v. 9-6-2026). Base URL
 * https://apisv2.logestechs.com/api, and authentication is the account's
 * email and password sent in each request body rather than a token, which
 * is why the credentials live in config and never in the database rows this
 * adapter touches.
 *
 * Endpoints used:
 *   POST /ship/request/by-email          create a shipment
 *   GET  /addresses/cities               cityId for an address
 *   GET  /guests/packages/status         one package's status
 *   POST /guests/{companyId}/packages/pdf   the AWB labels
 *   PUT  /guests/{companyId}/packages/cancel?barcode=
 *
 * Their `cod` is the amount INCLUDING delivery, and `invoiceNumber` is the
 * merchant's own order number — which is our merchantRef, and the key
 * matching reads back off their statement.
 */

export interface LogesTechsConfig {
  baseUrl?: string;
  email: string;
  password: string;
  /** Their numeric company id, used in the guest-scoped paths. */
  companyId: number;
  /** Ids their account was set up with; sent as-is. */
  serviceTypeId?: number;
  vehicleTypeId?: number;
  parcelTypeId?: number;
  /** Their documentation marks these required on every shipment. */
  sender: { name: string; phone: string; businessName?: string };
  /** Where parcels are collected from. */
  origin: { addressLine1: string; addressLine2?: string; cityId: number };
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE = 'https://apisv2.logestechs.com/api';

/**
 * Their status codes, copied from the documentation's own table.
 *
 * Mapped to ours ONLY where the meaning is unambiguous. Everything about a
 * driver being assigned, rejecting, or a parcel sitting on a shelf is their
 * internal handling — it does not change where the parcel is from our side,
 * so those return null and nothing is applied automatically.
 *
 * DELIVERED_TO_RECIPIENT and RETURNED_BY_RECIPIENT map to our terminal
 * states, but the seam refuses to apply those automatically anyway
 * (COURIER_CANNOT_ASSERT): a person confirms them against the statement,
 * because those two decide whether money is owed.
 */
export const LOGESTECHS_STATUS: Record<string, ShippingStatus | null> = {
  PENDING_CUSTOMER_CARE_APPROVAL: 'READY_FOR_PICKUP',
  APPROVED_BY_CUSTOMER_CARE_AND_WAITING_FOR_DISPATCHER: 'READY_FOR_PICKUP',
  ASSIGNED_TO_DRIVER_AND_PENDING_APPROVAL: 'READY_FOR_PICKUP',
  ACCEPTED_BY_DRIVER_AND_PENDING_PICKUP: 'READY_FOR_PICKUP',
  REJECTED_BY_DRIVER_AND_PENDING_MANGEMENT: null, // their internal reassignment
  SCANNED_BY_DRIVER_AND_IN_CAR: 'OUT_FOR_DELIVERY', // "Picked" — بالمركبة
  MOVED_TO_SHELF_AND_OUT_OF_HANDLER_CUSTODY: 'SHIPPED',
  OPENED_ISSUE_AND_WAITING_FOR_MANAGEMENT: null, // an exception; a human reads it
  POSTPONED_DELIVERY: 'FAILED_DELIVERY', // مؤجلة — an attempt that did not land
  DELIVERED_TO_RECIPIENT: 'DELIVERED',
  RETURNED_BY_RECIPIENT: 'RETURNED',
  DELIVERED_TO_SENDER: 'RETURNED', // back in our hands
  CANCELLED: 'CANCELLED',
  COMPLETED: null, // their bookkeeping close, not a delivery fact
  // Stage 9 landed the state, so their code maps now. It still never
  // applies itself: a partial needs the amount actually collected and which
  // lines came back, and only the person at the door knows that.
  PARTIALLY_DELIVERED: 'PARTIALLY_DELIVERED',
  SWAPPED: null,
  BROUGHT: null,
  TRANSFERRED_OUT: null, // handed to a partner — still in transit, not ours to call
  EXPORTED_TO_THIRD_PARTY: null,
};

/** Arabic names as their documentation writes them, for the audit trail. */
export const LOGESTECHS_STATUS_AR: Record<string, string> = {
  PENDING_CUSTOMER_CARE_APPROVAL: 'طلبات جديدة',
  APPROVED_BY_CUSTOMER_CARE_AND_WAITING_FOR_DISPATCHER: 'بانتظار تعيين سائق',
  CANCELLED: 'ملغاة',
  ASSIGNED_TO_DRIVER_AND_PENDING_APPROVAL: 'بانتظار موافقة سائق',
  REJECTED_BY_DRIVER_AND_PENDING_MANGEMENT: 'رفضها السائق',
  ACCEPTED_BY_DRIVER_AND_PENDING_PICKUP: 'بانتظار التحميل',
  SCANNED_BY_DRIVER_AND_IN_CAR: 'بالمركبة',
  DELIVERED_TO_RECIPIENT: 'تم التوصيل',
  POSTPONED_DELIVERY: 'مؤجلة',
  RETURNED_BY_RECIPIENT: 'تم ارجاعها',
  COMPLETED: 'مغلقة',
  TRANSFERRED_OUT: 'مصدرة لشريك',
  PARTIALLY_DELIVERED: 'تم توصيلها بشكل جزئي',
  SWAPPED: 'تم تبديلها',
  BROUGHT: 'تم احضارها',
  DELIVERED_TO_SENDER: 'مسلمة الى المرسل',
  EXPORTED_TO_THIRD_PARTY: 'مصدرة الى طرف ثالث',
};

/**
 * First word / the rest, for their example's two-field form.
 *
 * Arabic names do not split into "first" and "last" the way the field names
 * assume — «محمد عبد الله الكسواني» has no surname slot. Taking the first
 * word and leaving the remainder whole keeps the full name readable on the
 * label however they choose to join it back up, which is what the driver at
 * the door actually needs.
 */
export function splitName(full: string): { receiverFirstName: string; receiverLastName: string } {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { receiverFirstName: '', receiverLastName: '' };
  if (parts.length === 1) return { receiverFirstName: parts[0], receiverLastName: parts[0] };
  return { receiverFirstName: parts[0], receiverLastName: parts.slice(1).join(' ') };
}

export class LogesTechsAdapter implements CourierAdapter {
  readonly code = 'LOGESTECHS';
  readonly name = 'LogesTechs';
  readonly automated = true;

  private readonly base: string;
  private readonly http: typeof fetch;

  constructor(readonly config: LogesTechsConfig) {
    this.base = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    this.http = config.fetchImpl ?? fetch;
  }

  private get auth() {
    return { email: this.config.email, password: this.config.password };
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await this.http(`${this.base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`LogesTechs ${res.status}: ${text.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Their cityId for a written city name, or null when it is not theirs. */
  async findCityId(name: string): Promise<number | null> {
    const data = await this.call<{ data?: { id: number; name?: string; arabicName?: string; englishName?: string }[] }>(
      `/addresses/cities?search=${encodeURIComponent(name)}`,
      { method: 'GET' }
    );
    const wanted = name.trim().toLocaleLowerCase('ar');
    const rows = data.data ?? [];
    const hit =
      rows.find((c) => [c.arabicName, c.englishName, c.name].some((n) => n?.trim().toLocaleLowerCase('ar') === wanted)) ??
      rows[0];
    return hit?.id ?? null;
  }

  async createShipment(req: CourierShipmentRequest & { cityId?: number }): Promise<CourierShipmentResult> {
    const cityId = req.cityId ?? (req.customer.regionName ? await this.findCityId(req.customer.regionName) : null);
    if (!cityId) {
      throw new Error('LOGESTECHS_CITY_UNKNOWN: لم يُعرف رمز المدينة لدى الشركة');
    }

    const body = {
      ...this.auth,
      pkgUnitType: 'METRIC',
      pkg: {
        ...this.auth,
        // Their cod INCLUDES the delivery cost, which is exactly our COD.
        cod: req.codAmount,
        notes: req.note ?? '',
        // Their "customer order number" — our merchant reference, and the
        // key their statement comes back with.
        invoiceNumber: req.merchantRef,
        senderName: this.config.sender.name,
        senderPhone: this.config.sender.phone,
        ...(this.config.sender.businessName ? { businessSenderName: this.config.sender.businessName } : {}),
        // Their documentation contradicts itself here: the request-body
        // TABLE marks `receiverName` required, while the request EXAMPLE on
        // the next page sends `receiverFirstName` and `receiverLastName`.
        // We send all three. Whichever their server reads, it finds; the
        // other two are ignored, as unknown fields are throughout this API.
        // Guessing one would fail every shipment on the first real use.
        receiverName: req.customer.fullName,
        ...splitName(req.customer.fullName),
        receiverPhone: req.customer.phone,
        quantity: req.pieces,
        shipmentType: 'COD',
        cityId,
        ...(this.config.parcelTypeId !== undefined ? { parcelTypeId: this.config.parcelTypeId } : {}),
        ...(this.config.serviceTypeId !== undefined ? { serviceTypeId: this.config.serviceTypeId } : {}),
        ...(this.config.vehicleTypeId !== undefined ? { vehicleTypeId: this.config.vehicleTypeId } : {}),
      },
      destinationAddress: {
        addressLine1: req.customer.address,
        cityId,
      },
      originAddress: {
        addressLine1: this.config.origin.addressLine1,
        addressLine2: this.config.origin.addressLine2 ?? '',
        cityId: this.config.origin.cityId,
      },
    };

    const created = await this.call<{ barcode?: string; barcodeImage?: string; id?: number; cost?: number }>(
      '/ship/request/by-email',
      { method: 'POST', body: JSON.stringify(body) }
    );

    if (!created.barcode) throw new Error('LOGESTECHS_NO_BARCODE: لم تُرجع الشركة باركود الشحنة');

    return { trackingNumber: created.barcode, labelUrl: created.barcodeImage ?? null, raw: created };
  }

  async fetchEvents(trackingNumbers: string[]): Promise<CourierEvent[]> {
    const events: CourierEvent[] = [];

    // Their status endpoint takes one barcode at a time.
    for (const barcode of trackingNumbers) {
      try {
        const res = await this.call<{ status?: string; cod?: number; cost?: number; notes?: string }>(
          `/guests/packages/status?barcode=${encodeURIComponent(barcode)}`,
          { method: 'GET' }
        );
        const rawStatus = res.status ?? '';
        events.push({
          trackingNumber: barcode,
          rawStatus,
          occurredAt: new Date(),
          status: this.mapStatus(rawStatus),
          // Their cod is what they expect to collect, not proof of collection.
          collectedAmount: null,
          note: res.notes || LOGESTECHS_STATUS_AR[rawStatus] || null,
          raw: res,
        });
      } catch (e) {
        events.push({
          trackingNumber: barcode,
          rawStatus: 'ERROR',
          occurredAt: new Date(),
          status: null,
          note: e instanceof Error ? e.message : 'تعذّر الاستعلام',
        });
      }
    }

    return events;
  }

  /** Their AWB PDFs for a set of barcodes; returns the URL they hand back. */
  async labelUrl(barcodes: string[]): Promise<string | null> {
    const res = await this.call<{ url?: string }>(`/guests/${this.config.companyId}/packages/pdf`, {
      method: 'POST',
      body: JSON.stringify({ barcodes }),
    });
    return res.url ?? null;
  }

  async cancelShipment(barcode: string): Promise<void> {
    await this.call(`/guests/${this.config.companyId}/packages/cancel?barcode=${encodeURIComponent(barcode)}`, {
      method: 'PUT',
      body: JSON.stringify(this.auth),
    });
  }

  mapStatus(rawStatus: string): ShippingStatus | null {
    // Unknown code → null, never a near match. A wrong mapping moves money.
    return LOGESTECHS_STATUS[rawStatus?.trim().toUpperCase()] ?? null;
  }
}

/** Reads the adapter's config from the environment, or null when unset. */
export function logesTechsFromEnv(env: NodeJS.ProcessEnv = process.env): LogesTechsAdapter | null {
  const email = env.LOGESTECHS_EMAIL;
  const password = env.LOGESTECHS_PASSWORD;
  const companyId = Number(env.LOGESTECHS_COMPANY_ID);
  const originCityId = Number(env.LOGESTECHS_ORIGIN_CITY_ID);

  // Their required sender fields are part of the configuration too: without
  // them every create would be rejected at their end, so the adapter simply
  // does not register and the provider stays manual.
  if (
    !email || !password ||
    !Number.isFinite(companyId) || !Number.isFinite(originCityId) ||
    !env.LOGESTECHS_SENDER_NAME || !env.LOGESTECHS_SENDER_PHONE
  ) {
    return null;
  }

  return new LogesTechsAdapter({
    baseUrl: env.LOGESTECHS_BASE_URL,
    email,
    password,
    companyId,
    serviceTypeId: env.LOGESTECHS_SERVICE_TYPE_ID ? Number(env.LOGESTECHS_SERVICE_TYPE_ID) : undefined,
    vehicleTypeId: env.LOGESTECHS_VEHICLE_TYPE_ID ? Number(env.LOGESTECHS_VEHICLE_TYPE_ID) : undefined,
    parcelTypeId: env.LOGESTECHS_PARCEL_TYPE_ID ? Number(env.LOGESTECHS_PARCEL_TYPE_ID) : undefined,
    sender: {
      name: env.LOGESTECHS_SENDER_NAME ?? '',
      phone: env.LOGESTECHS_SENDER_PHONE ?? '',
      businessName: env.LOGESTECHS_SENDER_BUSINESS,
    },
    origin: {
      addressLine1: env.LOGESTECHS_ORIGIN_ADDRESS ?? '',
      addressLine2: env.LOGESTECHS_ORIGIN_ADDRESS2,
      cityId: originCityId,
    },
  });
}

/**
 * A courier's own LogesTechs account, as stored (encrypted) on its row.
 *
 * The sender and origin are part of the account, not of the platform: two
 * couriers on LogesTechs ship from two warehouses under two logins, and
 * their required sender fields differ. Keeping them together means an
 * account is either complete or absent — never half-configured in a way
 * that fails at their end on the first parcel.
 */
export interface LogesTechsCredentials {
  email: string;
  password: string;
  companyId: number;
  originCityId: number;
  senderName: string;
  senderPhone: string;
  senderBusiness?: string;
  originAddress?: string;
  originAddress2?: string;
  baseUrl?: string;
  serviceTypeId?: number;
  vehicleTypeId?: number;
  parcelTypeId?: number;
}

/** The adapter for a stored account, or null when the account is incomplete. */
export function logesTechsFromCredentials(c: LogesTechsCredentials): LogesTechsAdapter | null {
  if (
    !c?.email || !c?.password ||
    !Number.isFinite(Number(c.companyId)) ||
    !Number.isFinite(Number(c.originCityId)) ||
    !c.senderName || !c.senderPhone
  ) {
    return null;
  }

  return new LogesTechsAdapter({
    baseUrl: c.baseUrl,
    email: c.email,
    password: c.password,
    companyId: Number(c.companyId),
    serviceTypeId: Number.isFinite(Number(c.serviceTypeId)) ? Number(c.serviceTypeId) : undefined,
    vehicleTypeId: Number.isFinite(Number(c.vehicleTypeId)) ? Number(c.vehicleTypeId) : undefined,
    parcelTypeId: Number.isFinite(Number(c.parcelTypeId)) ? Number(c.parcelTypeId) : undefined,
    sender: {
      name: c.senderName,
      phone: c.senderPhone,
      businessName: c.senderBusiness,
    },
    origin: {
      addressLine1: c.originAddress ?? '',
      addressLine2: c.originAddress2,
      cityId: Number(c.originCityId),
    },
  });
}
