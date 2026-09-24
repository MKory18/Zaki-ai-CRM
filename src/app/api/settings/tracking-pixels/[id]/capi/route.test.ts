import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE DATASET A PIXEL'S SERVER EVENTS GO TO.
 *
 * Optional, because for a web pixel it is the same number. When a seller
 * does name one, it is tried with the token before it is kept: a dataset
 * the token cannot open fails inside the worker days later, unseen.
 */

const { db, verifyPixelToken, logAudit } = vi.hoisted(() => ({
  db: { trackingPixel: { findFirst: vi.fn(), update: vi.fn() } },
  verifyPixelToken: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: async () => ({ user: { id: 'u1', name: 'سارة' }, companyId: 'c1' }) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));
vi.mock('@/lib/secrets', () => ({
  decryptSecret: () => 'STORED_TOKEN',
  encryptSecret: (t: string) => `enc(${t})`,
  encryptionAvailable: () => true,
  secretHint: (t: string) => t.slice(-4),
}));
vi.mock('@/lib/conversions/meta-capi', () => ({
  verifyPixelToken: (...a: unknown[]) => verifyPixelToken(...a),
  explainCapiError: () => 'الرمز لا يفتح هذا الـ Dataset',
}));

import { PUT } from './route';

const put = (body: unknown) =>
  PUT(new Request('http://localhost/x', { method: 'PUT', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'px1' }),
  });

let pixel: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  pixel = { id: 'px1', platform: 'META', name: 'Main', pixelId: '111111111111111', capiToken: 'enc', capiDatasetId: null };
  db.trackingPixel.findFirst.mockImplementation(async () => pixel);
  db.trackingPixel.update.mockResolvedValue({});
  verifyPixelToken.mockResolvedValue({ name: 'Main dataset' });
});

describe('naming a dataset on a connected pixel', () => {
  it('tries the stored token against it before saving', async () => {
    const res = await put({ datasetId: '999999999999999' });
    expect(res.status).toBe(200);
    expect(verifyPixelToken).toHaveBeenCalledWith('999999999999999', 'STORED_TOKEN');
    expect(db.trackingPixel.update).toHaveBeenCalledWith({ where: { id: 'px1' }, data: { capiDatasetId: '999999999999999' } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TRACKING_PIXEL_CAPI_DATASET' }));
  });

  it('keeps nothing when the token cannot open it', async () => {
    verifyPixelToken.mockRejectedValue(new Error('denied'));
    const res = await put({ datasetId: '999999999999999' });
    expect(res.status).toBe(400);
    expect(db.trackingPixel.update).not.toHaveBeenCalled();
  });

  it('an empty value goes back to the pixel itself', async () => {
    pixel.capiDatasetId = '999999999999999';
    await put({ datasetId: '' });
    expect(verifyPixelToken).toHaveBeenCalledWith('111111111111111', 'STORED_TOKEN');
    expect(db.trackingPixel.update).toHaveBeenCalledWith({ where: { id: 'px1' }, data: { capiDatasetId: null } });
  });
});

describe('connecting a token', () => {
  it('verifies it against the dataset the events will go to', async () => {
    pixel.capiToken = null;
    const res = await put({ token: 'EAAG' + 'x'.repeat(40), datasetId: '888888888888888' });
    expect(res.status).toBe(200);
    expect(verifyPixelToken.mock.calls[0][0]).toBe('888888888888888');
  });
});

describe('refused', () => {
  it('anything that is not digits', async () => {
    for (const bad of ['12ab', '<script>', '123']) {
      expect((await put({ datasetId: bad })).status).toBe(400);
    }
    expect(db.trackingPixel.update).not.toHaveBeenCalled();
  });

  it('a dataset on a pixel that is not Meta\'s', async () => {
    pixel.platform = 'TIKTOK';
    expect((await put({ datasetId: '999999999999999' })).status).toBe(400);
    expect(db.trackingPixel.update).not.toHaveBeenCalled();
  });
});
