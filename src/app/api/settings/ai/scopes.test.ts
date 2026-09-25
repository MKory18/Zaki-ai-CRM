import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT THE OWNER LETS THE BUSINESS-INTELLIGENCE ASSISTANT READ.
 *
 * It starts at nothing and every field is a decision. Two things matter
 * here: a name this system does not know is dropped rather than guessed
 * at — a typo must never widen what an assistant reads — and changing one
 * box must not carry the provider, the model and the prompts along with it.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: { company: { findUnique: vi.fn(), update: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn() },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { PATCH } from './route';

/** What the company row holds before the call. */
let stored: Record<string, unknown>;

const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }));

/** The last `ai` object written back. */
const written = () => {
  const call = db.company.update.mock.calls.at(-1);
  return call ? JSON.parse(call[0].data.settings).ai : null;
};

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  stored = {
    provider: 'ANTHROPIC',
    model: 'claude-opus-5',
    prompts: { house: 'تكلّم بلهجتنا' },
    apiKeyEncrypted: 'sealed',
    keyHint: '…9xQ',
    intelligenceScopes: [],
  };
  db.company.findUnique.mockImplementation(async () => ({ settings: JSON.stringify({ ai: stored }) }));
  // The mock keeps what it is given: the save re-reads what it wrote, and a
  // mock that forgets would make a correct save look like a failed one.
  db.company.update.mockImplementation(async ({ data }: { data: { settings: string } }) => {
    stored = JSON.parse(data.settings).ai;
    return {};
  });
  db.$queryRaw.mockImplementation(async () => [{ settings: JSON.stringify({ ai: stored }) }]);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});

describe('ticking a box', () => {
  it('saves exactly the scopes that were ticked', async () => {
    expect((await patch({ intelligenceScopes: ['orders', 'finance'] })).status).toBe(200);
    expect(written().intelligenceScopes).toEqual(['orders', 'finance']);
  });

  it('keeps the provider, the model, the prompts and the key untouched', async () => {
    await patch({ intelligenceScopes: ['orders'] });
    const ai = written();
    expect(ai.provider).toBe('ANTHROPIC');
    expect(ai.model).toBe('claude-opus-5');
    expect(ai.prompts.house).toBe('تكلّم بلهجتنا');
    // The key survives a change to something else entirely.
    expect(ai.apiKeyEncrypted).toBe('sealed');
  });

  it('drops a name this system does not know — a typo never widens a scope', async () => {
    await patch({ intelligenceScopes: ['orders', 'everything', 'FINANCE', 'customers'] });
    expect(written().intelligenceScopes).toEqual(['orders']);
  });

  it('empties them again', async () => {
    stored.intelligenceScopes = ['orders', 'finance'];
    await patch({ intelligenceScopes: [] });
    expect(written().intelligenceScopes).toEqual([]);
  });

  it('is written to the audit — widening what an assistant reads is a decision', async () => {
    stored.intelligenceScopes = [];
    await patch({ intelligenceScopes: ['finance'] });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AI_SCOPES_UPDATED',
        previousData: { intelligenceScopes: [] },
        newData: { intelligenceScopes: ['finance'] },
      })
    );
  });
});

describe('what it refuses', () => {
  it('a body that is not a list of scopes', async () => {
    for (const bad of [{}, { intelligenceScopes: 'finance' }, { intelligenceScopes: [1, 2] }]) {
      expect((await patch(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(db.company.update).not.toHaveBeenCalled();
  });

  it('anyone without the permission that manages settings', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission settings.manage'));
    expect((await patch({ intelligenceScopes: ['finance'] })).status).toBe(403);
    expect(db.company.update).not.toHaveBeenCalled();
  });
});
