import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings tracking-pixels API â€” auth / RBAC / tenant isolation / validation.
 * Auth, RBAC engine, Prisma and audit are mocked; the route handlers run
 * for real so the security contract is exercised end-to-end.
 */

const { requireCompanyTenant, requirePermission, db, logAudit } = vi.hoisted(() => ({
  requireCompanyTenant: vi.fn(),
  requirePermission: vi.fn(),
  db: {
    trackingPixel: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a), redactSensitiveValues: (v: unknown) => v }));

import { GET, POST } from '@/app/api/settings/tracking-pixels/route';
import { PATCH, DELETE } from '@/app/api/settings/tracking-pixels/[id]/route';

const session = { user: { id: 'u1', name: 'Admin' }, companyId: 'company-1' };

beforeEach(() => {
  vi.clearAllMocks();
  requireCompanyTenant.mockResolvedValue(session);
  requirePermission.mockResolvedValue(session.user);
});

function jsonReq(body: unknown, method = 'POST'): Request {
  return new Request('http://localhost/api/settings/tracking-pixels', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/settings/tracking-pixels', () => {
  it('requires authentication', async () => {
    requireCompanyTenant.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('rejects users without settings.view (403)', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission settings.view'));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns company-scoped pixels only', async () => {
    db.trackingPixel.findMany.mockResolvedValue([
      { id: 'p1', platform: 'META', name: 'Main', pixelId: '123456789012345', enabled: true, scope: 'GLOBAL', createdAt: '2026-01-01' },
    ]);
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.pixels).toHaveLength(1);
    expect(db.trackingPixel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'company-1' } })
    );
  });
});

describe('POST /api/settings/tracking-pixels', () => {
  it('creates a Meta pixel and writes an audit log with a masked ID', async () => {
    db.trackingPixel.findFirst.mockResolvedValue(null);
    db.trackingPixel.create.mockResolvedValue({ id: 'p1', companyId: 'company-1', platform: 'META', name: 'Zaki Main', pixelId: '123456789012345', enabled: true, scope: 'GLOBAL' });
    const res = await POST(jsonReq({ platform: 'META', name: 'Zaki Main', pixelId: '123456789012345', scope: 'GLOBAL', enabled: true }));
    expect(res.status).toBe(200);
    expect(db.trackingPixel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company-1', platform: 'META', pixelId: '123456789012345' }),
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TRACKING_PIXEL_CREATED' })
    );
    const auditArg = logAudit.mock.calls[0][0];
    expect(JSON.stringify(auditArg.newData.pixelId)).not.toContain('123456789012345'); // masked
  });

  it('creates multiple Meta pixels (multi-pixel support)', async () => {
    db.trackingPixel.findFirst.mockResolvedValue(null);
    db.trackingPixel.create.mockResolvedValue({ id: 'px' });
    for (const id of ['111111111111111', '222222222222222', '333333333333333']) {
      const res = await POST(jsonReq({ platform: 'META', name: `P ${id}`, pixelId: id, scope: 'GLOBAL', enabled: true }));
      expect(res.status).toBe(200);
    }
    expect(db.trackingPixel.create).toHaveBeenCalledTimes(3);
  });

  it('creates TikTok and Snapchat pixels', async () => {
    db.trackingPixel.findFirst.mockResolvedValue(null);
    db.trackingPixel.create.mockResolvedValue({ id: 'px' });
    expect(
      (await POST(jsonReq({ platform: 'TIKTOK', name: 'TikTok Main', pixelId: 'TIKTOK123456', scope: 'GLOBAL', enabled: true }))).status
    ).toBe(200);
    expect(
      (await POST(jsonReq({ platform: 'SNAPCHAT', name: 'Snap Main', pixelId: '110ec58a-a0f2-4ac4-8393-c866d813b8d1', scope: 'GLOBAL', enabled: true }))).status
    ).toBe(200);
  });

  it('returns 400 for invalid Meta / TikTok / Snapchat IDs (nothing stored, no injection)', async () => {
    const cases = [
      { platform: 'META', pixelId: '<script>alert(1)</script>' },
      { platform: 'META', pixelId: '12345' },
      { platform: 'TIKTOK', pixelId: 'javascript:alert(1)' },
      { platform: 'TIKTOK', pixelId: 'AB1' },
      { platform: 'SNAPCHAT', pixelId: 'not-a-uuid' },
      { platform: 'SNAPCHAT', pixelId: '110ec58a-a0f2-4ac4-8393-c866d813b8d' },
    ];
    for (const c of cases) {
      const res = await POST(jsonReq({ name: 'Test', scope: 'GLOBAL', enabled: true, ...c }));
      expect(res.status).toBe(400);
    }
    expect(db.trackingPixel.create).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('rejects invalid/unknown platform (platform spoofing) with 400', async () => {
    const res = await POST(jsonReq({ platform: 'EVIL;fbq', name: 'Test', pixelId: '123456789012345', scope: 'GLOBAL', enabled: true }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid scope (scope spoofing) with 400', async () => {
    const res = await POST(jsonReq({ platform: 'META', name: 'Test', pixelId: '123456789012345', scope: 'EVERYTHING', enabled: true }));
    expect(res.status).toBe(400);
  });

  it('ignores companyId spoofing â€” tenant is always from the session', async () => {
    db.trackingPixel.findFirst.mockResolvedValue(null);
    db.trackingPixel.create.mockResolvedValue({ id: 'px' });
    await POST(jsonReq({ platform: 'META', name: 'Test', pixelId: '123456789012345', scope: 'GLOBAL', enabled: true, companyId: 'other-company' }));
    expect(db.trackingPixel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company-1' }),
    });
  });

  it('returns 409 for a duplicate pixel on the same platform', async () => {
    db.trackingPixel.findFirst.mockResolvedValue({ id: 'existing' });
    const res = await POST(jsonReq({ platform: 'META', name: 'Dup', pixelId: '123456789012345', scope: 'GLOBAL', enabled: true }));
    expect(res.status).toBe(409);
  });

  it('rejects users without settings.edit (403)', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission settings.edit'));
    const res = await POST(jsonReq({ platform: 'META', name: 'Test', pixelId: '123456789012345' }));
    expect(res.status).toBe(403);
    expect(db.trackingPixel.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/settings/tracking-pixels/[id]', () => {
  const url = (id: string) => `http://localhost/api/settings/tracking-pixels/${id}`;
  const req = (body: unknown) =>
    new Request(url('p1'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('enables/disables a pixel (tenant-scoped)', async () => {
    db.trackingPixel.findFirst.mockResolvedValue({ id: 'p1', companyId: 'company-1', platform: 'META', name: 'A', pixelId: '123456789012345', scope: 'GLOBAL', enabled: true });
    db.trackingPixel.update.mockResolvedValue({ id: 'p1', enabled: false });
    const res = await PATCH(req({ enabled: false }), { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
    expect(db.trackingPixel.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { enabled: false } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TRACKING_PIXEL_DISABLED' }));
  });

  it('cross-tenant access is rejected with 404', async () => {
    db.trackingPixel.findFirst.mockResolvedValue(null); // other company's pixel
    const res = await PATCH(req({ enabled: false }), { params: Promise.resolve({ id: 'other-company-pixel' }) });
    expect(res.status).toBe(404);
    expect(db.trackingPixel.update).not.toHaveBeenCalled();
  });

  it('rejects platform change (platform spoofing) with 400', async () => {
    db.trackingPixel.findFirst.mockResolvedValue({ id: 'p1', companyId: 'company-1', platform: 'META', name: 'A', pixelId: '123456789012345', scope: 'GLOBAL', enabled: true });
    const res = await PATCH(req({ platform: 'TIKTOK' }), { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
  });

  it('rejects invalid replacement pixel ID with 400', async () => {
    db.trackingPixel.findFirst.mockResolvedValue({ id: 'p1', companyId: 'company-1', platform: 'META', name: 'A', pixelId: '123456789012345', scope: 'GLOBAL', enabled: true });
    const res = await PATCH(req({ pixelId: '<script>x</script>' }), { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
    expect(db.trackingPixel.update).not.toHaveBeenCalled();
  });

  it('updates name/scope/pixelId with server-side re-validation', async () => {
    db.trackingPixel.findFirst
      .mockResolvedValueOnce({ id: 'p1', companyId: 'company-1', platform: 'META', name: 'A', pixelId: '123456789012345', scope: 'GLOBAL', enabled: true })
      .mockResolvedValueOnce(null); // no duplicate-ID clash
    db.trackingPixel.update.mockResolvedValue({ id: 'p1', name: 'BB', scope: 'LANDING_PAGES', pixelId: '222222222222222' });
    const res = await PATCH(req({ name: 'BB', scope: 'LANDING_PAGES', pixelId: '222222222222222' }), { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
    expect(db.trackingPixel.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ name: 'BB', scope: 'LANDING_PAGES', pixelId: '222222222222222' }),
    });
  });
});

describe('DELETE /api/settings/tracking-pixels/[id]', () => {
  const req = () => new Request('http://localhost/api/settings/tracking-pixels/p1', { method: 'DELETE' });

  it('deletes a company-scoped pixel and audits it', async () => {
    db.trackingPixel.findFirst.mockResolvedValue({ id: 'p1', companyId: 'company-1', platform: 'META', name: 'A', pixelId: '123456789012345', scope: 'GLOBAL', enabled: true });
    const res = await DELETE(req(), { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
    expect(db.trackingPixel.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TRACKING_PIXEL_DELETED' }));
  });

  it('cross-tenant delete is rejected with 404', async () => {
    db.trackingPixel.findFirst.mockResolvedValue(null);
    const res = await DELETE(req(), { params: Promise.resolve({ id: 'foreign-pixel' }) });
    expect(res.status).toBe(404);
    expect(db.trackingPixel.delete).not.toHaveBeenCalled();
  });
});
