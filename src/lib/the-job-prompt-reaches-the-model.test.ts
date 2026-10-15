import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THREE ASSISTANTS WERE SENDING THE WORD «undefined» AS THEIR ORDERS.
 *
 * `ChatRequest` says it in its own comment: «Pass a `job` instead to use
 * the company's own wording — which is what every caller in the system
 * does, so that editing a prompt in settings actually changes what the
 * model is told.»
 *
 * It did not. `aiChat` built the system prompt as
 *
 *     house ? `${house}\n\n${req.system}` : req.system
 *
 * and never looked the job up. Picking, the confirmation assistant and
 * the landing copywriter all pass a `job` and no `system`, so what left
 * this machine was the house prompt, two newlines, and the literal seven
 * letters «undefined». With no house prompt, that alone.
 *
 * They answered. Models answer almost anything — which is exactly why
 * nobody saw it: a worse answer looks like a worse model.
 *
 * Asked on the PAYLOAD, because that is the only place the difference
 * exists. A test that checked `resolvePrompt` was called would have
 * passed on the old code too — the import was already there.
 * ═══════════════════════════════════════════════════════════════════════
 */

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const original = process.env.APP_ENCRYPTION_KEY;

const { db, readSystemSetting } = vi.hoisted(() => ({
  db: { company: { findUnique: vi.fn() } },
  readSystemSetting: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('./db', () => ({ db }));
vi.mock('./system-settings', () => ({
  readSystemSetting: (...a: unknown[]) => readSystemSetting(...a),
  writeSystemSetting: vi.fn(),
  SYSTEM_AI: 'SYSTEM_AI',
}));
vi.mock('./audit', () => ({ logAudit: vi.fn() }));

const fetchMock = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.APP_ENCRYPTION_KEY = KEY;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'رد' } }] }),
    text: async () => '',
  });
  readSystemSetting.mockResolvedValue({ provider: 'OPENROUTER', keys: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (original === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = original;
});

/** The company's stored AI settings, as the column holds them. */
function companyHolds(settings: Record<string, unknown>) {
  db.company.findUnique.mockResolvedValue({ settings: JSON.stringify({ ai: settings }) });
}

/** The system prompt that actually left the machine. */
async function systemSent(): Promise<string> {
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  // OpenRouter and OpenAI carry it as the first message; Anthropic as a field.
  return body.system ?? body.messages?.find((m: { role: string }) => m.role === 'system')?.content ?? '';
}

describe('a caller that names a job', () => {
  it('sends that job’s wording, not the word «undefined»', async () => {
    companyHolds({
      provider: 'OPENROUTER',
      apiKeyEncrypted: undefined,
      prompts: { picking: 'رتّب قائمة التجهيز حسب الرفّ.' },
    });
    readSystemSetting.mockResolvedValue({
      provider: 'OPENROUTER',
      keys: { OPENROUTER: { enc: (await import('./secrets')).encryptSecret('sk-test-marker') } },
    });

    const { aiChat } = await import('./ai-provider');
    await aiChat({ companyId: 'c1', job: 'picking', user: 'x' });

    const sent = await systemSent();
    expect(sent, 'النصّ الحرفيّ «undefined» راح للنموذج').not.toContain('undefined');
    expect(sent).toContain('رتّب قائمة التجهيز حسب الرفّ.');
  });

  it('and the house prompt comes first, with one blank line between', async () => {
    companyHolds({
      provider: 'OPENROUTER',
      prompt: 'جاوب بالعربي.',
      prompts: { picking: 'رتّب حسب الرفّ.' },
    });
    readSystemSetting.mockResolvedValue({
      provider: 'OPENROUTER',
      keys: { OPENROUTER: { enc: (await import('./secrets')).encryptSecret('sk-test-marker') } },
    });

    const { aiChat } = await import('./ai-provider');
    await aiChat({ companyId: 'c1', job: 'picking', user: 'x' });

    expect(await systemSent()).toBe('جاوب بالعربي.\n\nرتّب حسب الرفّ.');
  });

  it('and an explicit system still wins — the door the intake uses', async () => {
    // `order_intake` builds its own prompt and appends a schema to it. A
    // job lookup that overrode that would drop the schema.
    companyHolds({ provider: 'OPENROUTER', prompts: { picking: 'من الإعدادات' } });
    readSystemSetting.mockResolvedValue({
      provider: 'OPENROUTER',
      keys: { OPENROUTER: { enc: (await import('./secrets')).encryptSecret('sk-test-marker') } },
    });

    const { aiChat } = await import('./ai-provider');
    await aiChat({ companyId: 'c1', job: 'picking', system: 'مكتوب بالنداء', user: 'x' });

    expect(await systemSent()).toBe('مكتوب بالنداء');
  });
});

describe('and nothing empty is ever sent', () => {
  it('no house prompt and no job wording gives no «\\n\\n» on its own', async () => {
    companyHolds({ provider: 'OPENROUTER', prompts: {} });
    readSystemSetting.mockResolvedValue({
      provider: 'OPENROUTER',
      keys: { OPENROUTER: { enc: (await import('./secrets')).encryptSecret('sk-test-marker') } },
    });

    const { aiChat } = await import('./ai-provider');
    await aiChat({ companyId: 'c1', job: 'nothing_configured', user: 'x' });

    const sent = await systemSent();
    expect(sent).not.toContain('undefined');
    expect(sent.trim(), 'بعث فواصل أسطر لحالها').toBe(sent);
  });
});
