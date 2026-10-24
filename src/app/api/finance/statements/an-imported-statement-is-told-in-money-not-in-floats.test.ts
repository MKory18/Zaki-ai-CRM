import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importedSentence } from '@/lib/statement-import-message';

/**
 * «تم استيراد 292 سطراً بإجمالي 2869.040000000001».
 *
 * The seller imported a real courier file — 292 lines, 171 delivered — and was told the total with a float's
 * tail on it. The file was read correctly and the column was stored correctly (it already went through
 * `roundMinor`); what leaked was the RAW running sum, in the answer and in the audit row, and the screen
 * printed it bare. These hold the three places: the answer, the audit row, and the sentence.
 */

const { db, requireContext, requirePermission, logAudit, created } = vi.hoisted(() => {
  const created: { statement?: Record<string, unknown> } = {};
  return {
    created,
    db: {
      deliveryProvider: { findFirst: vi.fn() },
      courierStatement: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
    requireContext: vi.fn(),
    requirePermission: vi.fn(),
    logAudit: vi.fn(),
  };
});
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/api-error', () => ({ apiErrorResponse: (e: unknown) => new Response(String(e), { status: 500 }) }));

import { POST } from './route';

const PROVIDER = '11111111-1111-4111-8111-111111111111';

/** 292 lines of 0.1 each: the float sum is 29.200000000000042, the statement holds 29.20. */
const csv = (n: number, each: string) =>
  ['المرجع,الصافي', ...Array.from({ length: n }, (_, i) => `R${1000 + i},${each}`)].join('\n');

const post = (content: string) =>
  POST(
    new Request('http://x/api/finance/statements', {
      method: 'POST',
      body: JSON.stringify({ deliveryProviderId: PROVIDER, reference: 'ST-1', fileName: 's.csv', content }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1' }, companyId: 'co', storeId: 'st', country: { minorUnit: 2, currencyCode: 'USD' },
  });
  db.deliveryProvider.findFirst.mockResolvedValue({ id: PROVIDER, name: 'Basha' });
  db.courierStatement.findFirst.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      courierStatement: { create: async ({ data }: { data: Record<string, unknown> }) => ((created.statement = data), { id: 's1', ...data }) },
      statementLine: { createMany: async () => ({ count: 0 }) },
    })
  );
});

describe('the answer to an import', () => {
  it('carries the total rounded to the country’s minor unit — not the float sum of the lines', async () => {
    const body = await (await post(csv(292, '0.1'))).json();
    expect(body.rows).toBe(292);
    expect(body.total).toBe(29.2);
    expect(String(body.total)).not.toMatch(/\d{9,}/);
  });

  it('and names the currency and its minor unit, so the screen writes it like every other figure', async () => {
    const body = await (await post(csv(3, '1.5'))).json();
    expect(body).toMatchObject({ total: 4.5, currencyCode: 'USD', minorUnit: 2 });
  });

  it('stores the same figure it answers with', async () => {
    const body = await (await post(csv(292, '0.1'))).json();
    expect(created.statement?.totalAmount).toBe(body.total);
  });

  it('and the audit row says the same number — not the raw sum', async () => {
    await post(csv(292, '0.1'));
    expect(logAudit.mock.calls[0][0].newData.total).toBe(29.2);
  });

  it('rounds to THIS country’s minor unit — three decimals for a three-decimal currency', async () => {
    requireContext.mockResolvedValue({
      user: { id: 'u1' }, companyId: 'co', storeId: 'st', country: { minorUnit: 3, currencyCode: 'JOD' },
    });
    // 3 × 0.0004 = 0.0012: a thousandth at three decimals, nothing at two
    const body = await (await post(csv(3, '0.0004'))).json();
    expect(body).toMatchObject({ total: 0.001, currencyCode: 'JOD', minorUnit: 3 });
  });

  it('NEGATIVE: an unreadable file still answers the refusal and writes nothing', async () => {
    const res = await post('هذا ليس كشفاً');
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('the sentence the seller reads', () => {
  it('writes the total like any other money figure — grouped, two decimals, with the currency', () => {
    expect(importedSentence({ rows: 292, total: 2869.04, currencyCode: 'USD', minorUnit: 2 })).toBe(
      'تم استيراد 292 سطراً بإجمالي 2,869.04 USD'
    );
  });

  it('and even a raw float from an older server is cleaned rather than printed', () => {
    const sentence = importedSentence({ rows: 292, total: 2869.040000000001 });
    expect(sentence).toBe('تم استيراد 292 سطراً بإجمالي 2,869.04');
    expect(sentence).not.toContain('040000');
  });

  it('keeps three decimals where the currency has three', () => {
    expect(importedSentence({ rows: 2, total: 12.5, currencyCode: 'JOD', minorUnit: 3 })).toBe('تم استيراد 2 سطراً بإجمالي 12.500 JOD');
  });
});
