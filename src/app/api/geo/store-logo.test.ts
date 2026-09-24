import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'stream';

/**
 * A store's logo: set by upload, served publicly — and only the current one.
 * The store's folder keeps every logo ever replaced; a public route that
 * served any file in it would publish all of them.
 */

const { db, requireCompanyTenant, requirePermission, saveProductImage, readStoredFile } = vi.hoisted(() => ({
  db: { store: { findFirst: vi.fn(), update: vi.fn() } },
  requireCompanyTenant: vi.fn(),
  requirePermission: vi.fn(),
  saveProductImage: vi.fn(),
  readStoredFile: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage')>()),
  saveProductImage: (...a: unknown[]) => saveProductImage(...a),
  readStoredFile: (...a: unknown[]) => readStoredFile(...a),
}));

import { POST, DELETE } from '@/app/api/geo/stores/[id]/logo/route';
import { GET } from '@/app/api/public/store-logo/[storeId]/[file]/route';

const STORE = '55555555-5555-4555-8555-555555555555';
const FILE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp';
const OLD = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp';
const current = `/api/public/store-logo/${STORE}/${FILE}`;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function upload(file?: File) {
  const form = new FormData();
  if (file) form.append('file', file);
  return new Request('http://localhost/x', { method: 'POST', body: form });
}
const params = { params: Promise.resolve({ id: STORE }) };
const pub = (storeId: string, file: string) => GET(new Request('http://localhost/x'), { params: Promise.resolve({ storeId, file }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireCompanyTenant.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1' });
  requirePermission.mockResolvedValue(undefined);
  db.store.findFirst.mockResolvedValue({ id: STORE, companyId: 'c1', logo: current });
  db.store.update.mockResolvedValue({});
  saveProductImage.mockResolvedValue({ url: `/api/media/companies/c1/products/${STORE}/${FILE}`, fileName: FILE, storageKey: 'k', mimeType: 'image/webp', fileSize: 10 });
  readStoredFile.mockResolvedValue({ stream: Readable.from([Buffer.from('img')]), size: 3, mimeType: 'image/webp' });
});

describe('uploading', () => {
  it('stores the file in the store’s folder and writes the PUBLIC url', async () => {
    const res = await POST(upload(new File([PNG], 'logo.png', { type: 'image/png' })), params);
    expect(res.status).toBe(200);
    expect(saveProductImage).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1', productId: STORE }));
    // Not /api/media — that needs a session, and shoppers have none.
    expect(db.store.update).toHaveBeenCalledWith({ where: { id: STORE }, data: { logo: current } });
  });

  it('refuses a file that is not an image', async () => {
    const res = await POST(upload(new File([Buffer.from('%PDF')], 'x.pdf', { type: 'application/pdf' })), params);
    expect(res.status).toBe(400);
    expect(saveProductImage).not.toHaveBeenCalled();
  });

  it('refuses a request with no file', async () => {
    expect((await POST(upload(), params)).status).toBe(400);
  });

  it('cannot touch another company’s store', async () => {
    db.store.findFirst.mockResolvedValue(null);
    const res = await POST(upload(new File([PNG], 'logo.png', { type: 'image/png' })), params);
    expect(res.status).toBe(404);
    expect(db.store.findFirst.mock.calls[0][0].where).toEqual({ id: STORE, companyId: 'c1' });
  });

  it('needs the permission that edits stores', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission geo.manage'));
    const res = await POST(upload(new File([PNG], 'logo.png', { type: 'image/png' })), params);
    expect(res.status).toBe(403);
    expect(saveProductImage).not.toHaveBeenCalled();
  });

  it('removes it', async () => {
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), params);
    expect(res.status).toBe(200);
    expect(db.store.update).toHaveBeenCalledWith({ where: { id: STORE }, data: { logo: null } });
  });
});

describe('serving it publicly', () => {
  it('serves the current logo without a session', async () => {
    const res = await pub(STORE, FILE);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    expect(readStoredFile).toHaveBeenCalledWith(`companies/c1/products/${STORE}/${FILE}`);
  });

  it('does NOT serve a logo that has been replaced', async () => {
    const res = await pub(STORE, OLD);
    expect(res.status).toBe(404);
    expect(readStoredFile).not.toHaveBeenCalled();
  });

  it('does not serve anything for a store with no logo', async () => {
    db.store.findFirst.mockResolvedValue({ id: STORE, companyId: 'c1', logo: null });
    expect((await pub(STORE, FILE)).status).toBe(404);
  });

  it('refuses anything that is not a uuid file name — no paths, no traversal', async () => {
    for (const bad of ['../../etc/passwd', 'x.webp', `${FILE}/..`, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.svg']) {
      expect((await pub(STORE, bad)).status).toBe(404);
    }
    expect((await pub('not-a-uuid', FILE)).status).toBe(404);
    expect(db.store.findFirst).not.toHaveBeenCalled();
  });
});
