import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: { company: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('./db', () => ({ db }));

import { aiChat, AiNotConfigured, aiSettings, saveAiSettings, AI_PROVIDERS } from './ai-provider';

/**
 * Three vendors, one key, and the key must never come back out.
 *
 * The AI vendor used to be chosen at deploy time by whoever had shell
 * access — the wrong person, since the company pays for the key. Moving it
 * into settings means the key now lives in a row somebody could read, so
 * every case below is about that.
 */

const KEY = 'a'.repeat(64);
const original = process.env.APP_ENCRYPTION_KEY;
const originalRouter = process.env.OPENROUTER_API_KEY;

/** What the company row holds after a save. */
const stored = () => JSON.parse(db.company.update.mock.calls.at(-1)![0].data.settings).ai;
const withSettings = (ai: unknown) =>
  db.company.findUnique.mockResolvedValue({ settings: JSON.stringify({ other: 'kept', ai }) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_ENCRYPTION_KEY = KEY;
  delete process.env.OPENROUTER_API_KEY;
  db.company.findUnique.mockResolvedValue({ settings: null });
  db.company.update.mockResolvedValue({});
});

afterEach(() => {
  if (original === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = original;
  if (originalRouter === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalRouter;
  vi.unstubAllGlobals();
});

describe('the key', () => {
  it('is encrypted before it is stored — never the plain text', async () => {
    await saveAiSettings('c1', { provider: 'OPENAI', model: 'gpt-4o-mini', apiKey: 'sk-secret-value' });
    const raw = db.company.update.mock.calls.at(-1)![0].data.settings;
    expect(raw).not.toContain('sk-secret-value');
    expect(stored().apiKeyEncrypted).toMatch(/^v1:/);
  });

  it('never comes back from the settings reader', async () => {
    await saveAiSettings('c1', { provider: 'OPENAI', model: 'gpt-4o-mini', apiKey: 'sk-secret-value' });
    withSettings(stored());
    const read = await aiSettings('c1');
    expect(JSON.stringify(read)).not.toContain('sk-secret-value');
    expect(read.hasKey).toBe(true);
    expect(read.keyHint).toContain('•');
  });

  it('refuses to save rather than store a key in the clear', async () => {
    // A key in a database anybody can read is worse than no AI at all.
    delete process.env.APP_ENCRYPTION_KEY;
    await expect(
      saveAiSettings('c1', { provider: 'OPENAI', model: 'gpt-4o-mini', apiKey: 'sk-x' })
    ).rejects.toThrow('ENCRYPTION_KEY_MISSING');
    expect(db.company.update).not.toHaveBeenCalled();
  });

  it('keeps the stored key when a save does not mention one', async () => {
    // Changing the model must not silently wipe the key.
    await saveAiSettings('c1', { provider: 'OPENAI', model: 'gpt-4o-mini', apiKey: 'sk-keep-me' });
    const first = stored();
    withSettings(first);
    await saveAiSettings('c1', { provider: 'OPENAI', model: 'gpt-4o' });
    expect(stored().apiKeyEncrypted).toBe(first.apiKeyEncrypted);
  });

  it('clears it only when asked explicitly', async () => {
    await saveAiSettings('c1', { provider: 'OPENAI', model: 'gpt-4o-mini', apiKey: 'sk-gone' });
    withSettings(stored());
    await saveAiSettings('c1', { provider: 'OPENAI', model: 'gpt-4o-mini', apiKey: null });
    expect(stored().apiKeyEncrypted).toBeUndefined();
    expect(stored().keyHint).toBeUndefined();
  });

  it('does not throw away the rest of the company settings', async () => {
    withSettings({});
    await saveAiSettings('c1', { provider: 'OPENAI', model: 'gpt-4o-mini' });
    const all = JSON.parse(db.company.update.mock.calls.at(-1)![0].data.settings);
    expect(all.other).toBe('kept');
  });
});

describe('choosing a vendor', () => {
  it('falls back to a sane default when nothing is set', async () => {
    const s = await aiSettings('c1');
    expect(s.provider).toBe('OPENROUTER');
    expect(s.model).toBe(AI_PROVIDERS[0].defaultModel);
    expect(s.hasKey).toBe(false);
  });

  it('ignores a provider name that is not one of ours', async () => {
    withSettings({ provider: 'SOMETHING_ELSE', model: 'x' });
    expect((await aiSettings('c1')).provider).toBe('OPENROUTER');
  });

  it('still counts an environment key as configured', async () => {
    // An existing deploy keeps working without anybody re-entering anything.
    process.env.OPENROUTER_API_KEY = 'sk-or-env';
    expect((await aiSettings('c1')).hasKey).toBe(true);
  });
});

describe('making the call', () => {
  const fetchOk = (body: unknown) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));

  const configure = async (provider: 'OPENROUTER' | 'OPENAI' | 'ANTHROPIC', model: string) => {
    await saveAiSettings('c1', { provider, model, apiKey: 'sk-test-key' });
    withSettings(stored());
  };

  it('refuses to guess when no key is configured', async () => {
    await expect(aiChat({ companyId: 'c1', system: 's', user: 'u' })).rejects.toBeInstanceOf(AiNotConfigured);
  });

  it('sends Anthropic its own shape — system at the top, key in x-api-key', async () => {
    await configure('ANTHROPIC', 'claude-sonnet-4-5');
    fetchOk({ content: [{ text: 'رد' }] });
    expect(await aiChat({ companyId: 'c1', system: 'كن دقيقاً', user: 'حلّل' })).toBe('رد');
    const [url, init] = (globalThis.fetch as never as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toContain('api.anthropic.com');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test-key');
    const body = JSON.parse(init.body as string);
    expect(body.system).toContain('كن دقيقاً');
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('sends OpenAI the chat-completions shape', async () => {
    await configure('OPENAI', 'gpt-4o-mini');
    fetchOk({ choices: [{ message: { content: 'رد' } }] });
    expect(await aiChat({ companyId: 'c1', system: 's', user: 'u' })).toBe('رد');
    const [url, init] = (globalThis.fetch as never as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toContain('api.openai.com');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test-key');
  });

  it('puts the house prompt in front of the task prompt', async () => {
    // The house prompt is how the company says "always answer in Arabic,
    // our margins are thin" once instead of on every screen.
    await saveAiSettings('c1', {
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test-key',
      prompts: { house: 'أجب بالعربية دائماً' },
    });
    withSettings(stored());
    fetchOk({ choices: [{ message: { content: 'ok' } }] });
    await aiChat({ companyId: 'c1', system: 'حلّل الأرقام', user: 'u' });
    const body = JSON.parse(
      (globalThis.fetch as never as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body as string
    );
    expect(body.messages[0].content.indexOf('أجب بالعربية')).toBeLessThan(
      body.messages[0].content.indexOf('حلّل الأرقام')
    );
  });

  it('still applies a house prompt saved the old way, until the next save', async () => {
    // Written by the card that sat on the system settings screen, which is
    // gone. Its value must keep working, and must be what /settings/ai shows.
    withSettings({ provider: 'OPENAI', model: 'gpt-4o-mini', prompt: 'اختصر', apiKeyEncrypted: undefined });
    process.env.OPENROUTER_API_KEY = 'sk-env';
    const shown = await aiSettings('c1');
    expect(shown.prompt).toBe('اختصر');
    expect(shown.prompts.house).toBe('اختصر');
    fetchOk({ choices: [{ message: { content: 'ok' } }] });
    await aiChat({ companyId: 'c1', system: 'حلّل', user: 'u' });
    const body = JSON.parse(
      (globalThis.fetch as never as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body as string
    );
    expect(body.messages[0].content.startsWith('اختصر')).toBe(true);
  });

  it('a house prompt cleared on /settings/ai stays cleared — the old key does not bring it back', async () => {
    withSettings({ provider: 'OPENAI', model: 'gpt-4o-mini', prompt: 'اختصر' });
    await saveAiSettings('c1', { provider: 'OPENAI', model: 'gpt-4o-mini', prompts: {} });
    expect(stored().prompt).toBeUndefined();
    withSettings(stored());
    expect((await aiSettings('c1')).prompt).toBe('');
  });

  it('a save that does not touch the prompts keeps the old house prompt', async () => {
    withSettings({ provider: 'OPENAI', model: 'gpt-4o-mini', prompt: 'اختصر' });
    await saveAiSettings('c1', { provider: 'OPENAI', model: 'gpt-4o' });
    expect(stored().prompt).toBe('اختصر');
  });

  it('surfaces a vendor error instead of returning an empty answer', async () => {
    await configure('OPENAI', 'gpt-4o-mini');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    await expect(aiChat({ companyId: 'c1', system: 's', user: 'u' })).rejects.toThrow('AI_HTTP_401');
  });
});
