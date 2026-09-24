import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/settings — the company's name, and never the rest of the settings.
 *
 * It used to return the whole settings document (the encrypted AI key and
 * its hint included) to anybody with settings.view, and to REPLACE it on
 * save — one click on the system screen wiped the AI key, its prompts and
 * the message templates.
 */

const { db, logAudit } = vi.hoisted(() => ({
  db: { company: { findUnique: vi.fn(), update: vi.fn() } },
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: async () => ({ user: { id: 'u1' }, companyId: 'c1' }) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));

import { GET, PATCH } from './route';

const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/api/settings', { method: 'PATCH', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  db.company.findUnique.mockImplementation(async ({ select }: { select?: Record<string, boolean> }) => {
    const row = { id: 'c1', name: 'شركتي', settings: JSON.stringify({ ai: { apiKeyEncrypted: 'CIPHER', keyHint: 'abcd' } }) };
    return select ? Object.fromEntries(Object.keys(select).map((k) => [k, (row as Record<string, unknown>)[k]])) : row;
  });
  db.company.update.mockImplementation(async ({ data }: { data: { name: string } }) => ({ id: 'c1', name: data.name }));
});

describe('GET', () => {
  it('returns the id and the name — no settings document, no key, no hint', async () => {
    const body = await (await GET()).json();
    expect(body).toEqual({ company: { id: 'c1', name: 'شركتي' } });
    expect(JSON.stringify(body)).not.toContain('CIPHER');
    expect(JSON.stringify(body)).not.toContain('abcd');
  });
});

describe('PATCH', () => {
  it('renames the company and writes nothing else', async () => {
    const res = await patch({ name: '  متجر جديد ' });
    expect(res.status).toBe(200);
    expect(db.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'متجر جديد' } })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ previousData: { name: 'شركتي' }, newData: { name: 'متجر جديد' } })
    );
  });

  it('refuses a settings document — it can no longer overwrite the AI key or the templates', async () => {
    const res = await patch({ name: 'x y', settings: { defaultShippingCost: 5 } });
    expect(res.status).toBe(400);
    expect(db.company.update).not.toHaveBeenCalled();
  });

  it('refuses the retired currency and country', async () => {
    expect((await patch({ name: 'شركتي', currency: 'USD' })).status).toBe(400);
    expect((await patch({ name: 'شركتي', country: 'Egypt' })).status).toBe(400);
    expect(db.company.update).not.toHaveBeenCalled();
  });

  it('refuses an empty name', async () => {
    expect((await patch({ name: ' ' })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
  });
});
