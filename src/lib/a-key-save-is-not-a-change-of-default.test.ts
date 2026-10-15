import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SAVING AN ACCOUNT IS SAVING AN ACCOUNT.
 *
 * The keys card sent `provider` and `model` with every key save — the
 * values the screen happened to be holding — so pasting an Anthropic key
 * stamped whatever the dropdown showed into the installation default.
 * With nothing stored that is OpenRouter and a free Llama, and from then
 * on «المزوّد» could not move it: the next key save put it back.
 *
 * The owner's report was «حطّيت المفتاح وما اشتغل». He was right, and the
 * dropdown was not broken — it was being overwritten by its own form.
 *
 * Absent now means «leave it alone», on the store itself: the screen
 * stopped sending them, and the store stopped needing them.
 * ═══════════════════════════════════════════════════════════════════════
 */

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const original = process.env.APP_ENCRYPTION_KEY;

const { readSystemSetting, updateSystemSetting } = vi.hoisted(() => ({
  readSystemSetting: vi.fn(),
  updateSystemSetting: vi.fn(),
}));

vi.mock('./system-settings', () => ({
  SYSTEM_AI: 'SYSTEM_AI',
  readSystemSetting: (...a: unknown[]) => readSystemSetting(...a),
  updateSystemSetting: (...a: unknown[]) => updateSystemSetting(...a),
  systemSettingMeta: vi.fn(async () => null),
}));
vi.mock('./db', () => ({ db: { company: { findUnique: vi.fn() } } }));
vi.mock('./audit', () => ({ logAudit: vi.fn() }));

/** What the store held before, and what the updater made of it. */
async function saveWith(input: Record<string, unknown>, before: Record<string, unknown>) {
  let after: Record<string, unknown> = {};
  updateSystemSetting.mockImplementation(async (_k: string, fn: (c: unknown) => unknown) => {
    after = fn(before) as Record<string, unknown>;
    return after;
  });
  readSystemSetting.mockResolvedValue(after);
  const { saveSystemAi } = await import('./ai-provider');
  await saveSystemAi(input as never, 'actor');
  return after;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_ENCRYPTION_KEY = KEY;
});

describe('saving a vendor account', () => {
  it('leaves the installation default exactly where it was', async () => {
    const after = await saveWith(
      { providerKeys: { ANTHROPIC: 'sk-ant-test-marker-value' } },
      { provider: 'ANTHROPIC', model: 'claude-sonnet-5-5' }
    );

    expect(after.provider, 'حفظُ مفتاحٍ غيّر المزوّد الافتراضي').toBe('ANTHROPIC');
    expect(after.model, 'حفظُ مفتاحٍ غيّر النموذج الافتراضي').toBe('claude-sonnet-5-5');
  });

  it('and the key still lands', async () => {
    const after = await saveWith(
      { providerKeys: { ANTHROPIC: 'sk-ant-test-marker-value' } },
      { provider: 'ANTHROPIC', model: 'claude-sonnet-5-5' }
    );
    expect(Object.keys((after.keys ?? {}) as object)).toContain('ANTHROPIC');
  });
});

describe('and «المزوّد» still moves it', () => {
  it('a provider sent explicitly is stored', async () => {
    const after = await saveWith(
      { provider: 'OPENAI', model: 'gpt-4o-mini' },
      { provider: 'ANTHROPIC', model: 'claude-sonnet-5-5' }
    );
    expect(after.provider).toBe('OPENAI');
    expect(after.model).toBe('gpt-4o-mini');
  });

  it('and an empty model falls back to that vendor’s own default, not the other one’s', async () => {
    // The old line read `providerInfo(input.provider).defaultModel`, which
    // was right; the risk in making these optional is reading a default off
    // a provider that was never sent.
    const after = await saveWith(
      { provider: 'OPENAI', model: '  ' },
      { provider: 'ANTHROPIC', model: 'claude-sonnet-5-5' }
    );
    expect(after.provider).toBe('OPENAI');
    expect(after.model).toBe('gpt-4o-mini');
  });

  it('and a model sent alone does not drag the provider with it', async () => {
    const after = await saveWith(
      { model: 'claude-haiku-5-5' },
      { provider: 'ANTHROPIC', model: 'claude-sonnet-5-5' }
    );
    expect(after.provider).toBe('ANTHROPIC');
    expect(after.model).toBe('claude-haiku-5-5');
  });
});

afterEach(() => {
  if (original === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = original;
});
