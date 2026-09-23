import { describe, expect, it, vi } from 'vitest';
import { LogesTechsAdapter, LOGESTECHS_STATUS, splitName } from './logestechs';
import { isAutoApplicable } from './types';

/**
 * The LogesTechs adapter, against their documented contract. No network: a
 * fetch stub returns the exact response shapes from their documentation.
 */

const config = (fetchImpl: typeof fetch) => ({
  email: 'a@b.c',
  password: 'x',
  companyId: 136,
  serviceTypeId: 1,
  vehicleTypeId: 0,
  sender: { name: 'صحة بلس', phone: '0790000000', businessName: 'صحة بلس' },
  origin: { addressLine1: 'Main Street', cityId: 36237 },
  fetchImpl,
});

const ok = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe('status mapping — their codes, ours', () => {
  const adapter = new LogesTechsAdapter(config(ok({})));

  it('maps the codes whose meaning is unambiguous', () => {
    expect(adapter.mapStatus('SCANNED_BY_DRIVER_AND_IN_CAR')).toBe('OUT_FOR_DELIVERY');
    expect(adapter.mapStatus('DELIVERED_TO_RECIPIENT')).toBe('DELIVERED');
    expect(adapter.mapStatus('RETURNED_BY_RECIPIENT')).toBe('RETURNED');
    expect(adapter.mapStatus('CANCELLED')).toBe('CANCELLED');
    expect(adapter.mapStatus('POSTPONED_DELIVERY')).toBe('FAILED_DELIVERY');
  });

  it('returns null for anything it does not recognise, never a near match', () => {
    expect(adapter.mapStatus('SOME_NEW_CODE_THEY_ADD')).toBeNull();
    expect(adapter.mapStatus('')).toBeNull();
  });

  it('refuses to read their internal handling as a delivery fact', () => {
    for (const code of ['COMPLETED', 'TRANSFERRED_OUT', 'OPENED_ISSUE_AND_WAITING_FOR_MANAGEMENT']) {
      expect(LOGESTECHS_STATUS[code], code).toBeNull();
    }
  });

  it('never lets their feed decide that money is owed', () => {
    // DELIVERED and RETURNED map, but the seam still refuses to apply them.
    for (const code of ['DELIVERED_TO_RECIPIENT', 'RETURNED_BY_RECIPIENT', 'CANCELLED', 'PARTIALLY_DELIVERED']) {
      const event = {
        trackingNumber: 'B1',
        rawStatus: code,
        occurredAt: new Date(),
        status: adapter.mapStatus(code),
      };
      expect(isAutoApplicable(event), code).toBe(false);
    }
  });

  it('does apply the in-transit codes, which move no money', () => {
    const event = {
      trackingNumber: 'B1',
      rawStatus: 'SCANNED_BY_DRIVER_AND_IN_CAR',
      occurredAt: new Date(),
      status: adapter.mapStatus('SCANNED_BY_DRIVER_AND_IN_CAR'),
    };
    expect(isAutoApplicable(event)).toBe(true);
  });

  it('ignores case and stray spacing in their code', () => {
    expect(adapter.mapStatus(' delivered_to_recipient ')).toBe('DELIVERED');
  });
});

describe('createShipment', () => {
  const request = {
    orderId: 'o1',
    merchantRef: 'ORD-2026-0007',
    codAmount: 17.5,
    currencyCode: 'JOD',
    customer: { fullName: 'محمد', phone: '0790123456', address: 'شارع المدينة', regionName: 'عمّان' },
    pieces: 1,
    note: 'يرجى الاتصال قبل الوصول',
  };

  it('sends the merchant reference as their invoiceNumber, and the COD including delivery', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/addresses/cities')) {
        return new Response(JSON.stringify({ data: [{ id: 41125, arabicName: 'عمّان' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ barcode: 'KSA100422577363', barcodeImage: 'https://x/y.png' }), { status: 200 });
    }) as unknown as typeof fetch;

    const adapter = new LogesTechsAdapter(config(fetchImpl));
    const result = await adapter.createShipment(request);

    expect(result.trackingNumber).toBe('KSA100422577363');
    expect(result.labelUrl).toBe('https://x/y.png');

    const shipCall = calls.find((c) => c.url.includes('/ship/request/by-email'))!;
    const body = JSON.parse(String(shipCall.init.body));
    expect(body.pkg.invoiceNumber).toBe('ORD-2026-0007');
    expect(body.pkg.cod).toBe(17.5);
    expect(body.pkg.shipmentType).toBe('COD');
    // Their documentation marks these required.
    expect(body.pkg.senderName).toBe('صحة بلس');
    expect(body.pkg.senderPhone).toBe('0790000000');
    expect(body.pkg.receiverName).toBe('محمد');
    expect(body.pkg.receiverPhone).toBe('0790123456');
    expect(body.destinationAddress.cityId).toBe(41125);
    expect(body.originAddress.cityId).toBe(36237);
  });

  it('refuses rather than guessing when the city is not one of theirs', async () => {
    const fetchImpl = ok({ data: [] });
    const adapter = new LogesTechsAdapter(config(fetchImpl));
    await expect(adapter.createShipment(request)).rejects.toThrow(/CITY_UNKNOWN/);
  });

  it('refuses a response with no barcode — there would be nothing to track', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('/addresses/cities')
        ? new Response(JSON.stringify({ data: [{ id: 1 }] }), { status: 200 })
        : new Response(JSON.stringify({ id: 42 }), { status: 200 })
    ) as unknown as typeof fetch;

    const adapter = new LogesTechsAdapter(config(fetchImpl));
    await expect(adapter.createShipment(request)).rejects.toThrow(/NO_BARCODE/);
  });
});

describe('fetchEvents', () => {
  it('reads their status response', async () => {
    const adapter = new LogesTechsAdapter(
      config(ok({ status: 'DELIVERED_TO_RECIPIENT', cod: 20, cost: 3, notes: '' }))
    );
    const [event] = await adapter.fetchEvents(['KSA1']);
    expect(event).toMatchObject({ trackingNumber: 'KSA1', rawStatus: 'DELIVERED_TO_RECIPIENT', status: 'DELIVERED' });
  });

  it('does not treat their expected COD as proof of collection', async () => {
    const adapter = new LogesTechsAdapter(config(ok({ status: 'DELIVERED_TO_RECIPIENT', cod: 20 })));
    const [event] = await adapter.fetchEvents(['KSA1']);
    expect(event.collectedAmount).toBeNull();
  });

  it('turns a failed lookup into an event a human reads, not a silent gap', async () => {
    const fetchImpl = vi.fn(async () => new Response('upstream down', { status: 500 })) as unknown as typeof fetch;
    const adapter = new LogesTechsAdapter(config(fetchImpl));
    const [event] = await adapter.fetchEvents(['KSA1']);
    expect(event.status).toBeNull();
    expect(event.rawStatus).toBe('ERROR');
  });
});

describe('the receiver name their documentation disagrees with itself about', () => {
  it('splits an Arabic name without inventing a surname', () => {
    expect(splitName('محمد عبد الله الكسواني')).toEqual({
      receiverFirstName: 'محمد',
      receiverLastName: 'عبد الله الكسواني',
    });
  });

  it('repeats a single name rather than sending an empty required field', () => {
    expect(splitName('سارة')).toEqual({ receiverFirstName: 'سارة', receiverLastName: 'سارة' });
  });

  it('survives extra spacing and an empty name', () => {
    expect(splitName('  أبو   عمر  ')).toEqual({ receiverFirstName: 'أبو', receiverLastName: 'عمر' });
    expect(splitName('')).toEqual({ receiverFirstName: '', receiverLastName: '' });
  });
});
