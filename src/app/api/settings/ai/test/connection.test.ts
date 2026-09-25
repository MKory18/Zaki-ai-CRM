import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * DOES THE KEY ACTUALLY WORK?
 *
 * A key is pasted, saved, and nothing happens. Days later somebody asks a
 * real question and gets the grounded fallback — a plausible answer with no
 * model behind it. The provider never says "your key is wrong" anywhere a
 * seller looks; the assistant simply stops being an assistant.
 *
 * So this asks the provider one cheap question and repeats what came back,
 * turning its status codes into sentences somebody can act on. The key is
 * never in the answer.
 */

const { aiChat, aiSettings, requireCompanyTenant, requirePermission, AiNotConfigured } = vi.hoisted(() => ({
  aiChat: vi.fn(),
  aiSettings: vi.fn(),
  requireCompanyTenant: vi.fn(),
  requirePermission: vi.fn(),
  // Hoisted with the rest: the module factory below runs before any
  // top-level declaration in this file would exist.
  AiNotConfigured: class AiNotConfigured extends Error {},
}));

vi.mock('@/lib/ai-provider', () => ({
  aiChat: (...a: unknown[]) => aiChat(...a),
  aiSettings: (...a: unknown[]) => aiSettings(...a),
  AiNotConfigured,
}));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));

import { POST } from './route';

const run = async () => (await POST()).json();

beforeEach(() => {
  vi.resetAllMocks();
  requireCompanyTenant.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1' });
  requirePermission.mockResolvedValue(undefined);
  aiSettings.mockResolvedValue({ provider: 'ANTHROPIC', model: 'claude-opus-5', hasKey: true });
});

describe('when it works', () => {
  it('repeats what the provider said, so it is not a tick to be trusted blindly', async () => {
    aiChat.mockResolvedValue('  OK  ');
    const body = await run();
    expect(body).toMatchObject({ ok: true, provider: 'ANTHROPIC', model: 'claude-opus-5', reply: 'OK' });
  });

  it('asks without the company\'s own prompt — this tests the key, not the wording', async () => {
    aiChat.mockResolvedValue('OK');
    await run();
    const call = aiChat.mock.calls[0][0];
    expect(call.system).toBeTruthy();
    // A `job` would pull in the company's prompt, which could fail the test
    // for a reason that has nothing to do with the connection.
    expect(call.job).toBeUndefined();
  });
});

describe('when it does not', () => {
  const says = async (error: Error, expected: string) => {
    aiChat.mockRejectedValue(error);
    const body = await run();
    expect(body.ok).toBe(false);
    expect(body.error).toContain(expected);
  };

  it('a rejected key is named as a rejected key', async () => {
    await says(new Error('AI_HTTP_401'), 'رفض المفتاح');
    await says(new Error('AI_HTTP_403'), 'رفض المفتاح');
  });

  it('a model the provider does not have', async () => {
    await says(new Error('AI_HTTP_404'), 'النموذج غير موجود');
  });

  it('a rate limit or an empty balance', async () => {
    await says(new Error('AI_HTTP_429'), 'التمهّل');
  });

  it('no key saved yet', async () => {
    await says(new AiNotConfigured(), 'لم يُحفظ مفتاح');
  });

  it('a timeout', async () => {
    await says(new Error('The operation was aborted'), 'المهلة');
  });

  it('and it never puts the key in the answer', async () => {
    aiChat.mockRejectedValue(new Error('AI_HTTP_401: sk-ant-secret-value'));
    const body = JSON.stringify(await run());
    expect(body).not.toContain('sk-ant');
    expect(body).not.toContain('secret');
  });
});

describe('who may test', () => {
  it('needs the permission that edits settings — a test spends the company\'s credit', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission settings.edit'));
    const res = await POST();
    expect(res.status).toBe(403);
    expect(aiChat).not.toHaveBeenCalled();
  });
});
