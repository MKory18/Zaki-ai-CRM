import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE VENDOR QUOTES THE REQUEST BACK, AND THREE CALLERS LOG THE ERROR.
 *
 * Carrying the vendor's words with the status is what lets «your credit
 * balance is too low» read as a sentence the owner can act on instead of
 * «المزوّد ردّ بخطأ 400». But some vendors quote the request: OpenAI's 401
 * reads «Incorrect API key provided: sk-proj-…», and a proxy in front of
 * a local model can echo the whole `Authorization` header.
 *
 * And this error is LOGGED — `ai.ts` twice and the order intake once all
 * `console.warn` it. So without scrubbing, a rotated key puts its own
 * prefix into the server log, in a repository that deliberately refuses
 * to show even the last four characters on the settings screen.
 *
 * And every fake key below carries `test-` ON PURPOSE: `scan:secrets`
 * reads that word as «this one is fake». Without it the scanner stops on
 * this very file — a leak test that trips the leak scanner.
 *
 * The body is kept for CLASSIFICATION only — «credit balance» and nothing
 * else is read out of it — so redacting it costs nothing.
 * ═══════════════════════════════════════════════════════════════════════
 */

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const original = process.env.APP_ENCRYPTION_KEY;

const { db, readSystemSetting } = vi.hoisted(() => ({
  db: { company: { findUnique: vi.fn() } },
  readSystemSetting: vi.fn(),
}));

vi.mock('./db', () => ({ db }));
vi.mock('./system-settings', () => ({
  readSystemSetting: (...a: unknown[]) => readSystemSetting(...a),
  writeSystemSetting: vi.fn(),
  updateSystemSetting: vi.fn(),
  systemSettingMeta: vi.fn(),
  SYSTEM_AI: 'SYSTEM_AI',
}));
vi.mock('./audit', () => ({ logAudit: vi.fn() }));

const fetchMock = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.APP_ENCRYPTION_KEY = KEY;
  vi.stubGlobal('fetch', fetchMock);
  const { encryptSecret } = await import('./secrets');
  db.company.findUnique.mockResolvedValue({ settings: JSON.stringify({ ai: { provider: 'OPENAI' } }) });
  readSystemSetting.mockResolvedValue({
    provider: 'OPENAI',
    keys: { OPENAI: { enc: encryptSecret('sk-proj-test-LEAKMARKER-0001') } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (original === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = original;
});

/** What `aiChat` threw when the vendor refused with this body. */
async function thrownFor(body: string): Promise<string> {
  fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => body, json: async () => ({}) });
  const { aiChat } = await import('./ai-provider');
  try {
    await aiChat({ companyId: 'c1', system: 's', user: 'u' });
    return '';
  } catch (e) {
    return (e as Error).message;
  }
}

describe('when a vendor quotes the request back', () => {
  it('an OpenAI key in the refusal never reaches the thrown message', async () => {
    const said = await thrownFor(
      '{"error":{"message":"Incorrect API key provided: sk-proj-test-LEAKMARKER-0001. You can find your API key at…"}}'
    );

    expect(said, 'المفتاح طلع بالرسالة اللي بتنكتب بالسجلّ').not.toContain('sk-proj-test-LEAKMARKER-0001');
    expect(said).not.toContain('LEAKMARKER');
    // And the status is still readable, because that is what it is for.
    expect(said).toContain('AI_HTTP_401');
  });

  it('and an Anthropic one, and an OpenRouter one', async () => {
    for (const key of ['sk-ant-api03-test-LEAKMARKER-0002', 'sk-or-v1-test-LEAKMARKER-0003']) {
      const said = await thrownFor(`{"error":"bad key ${key}"}`);
      expect(said, key).not.toContain('LEAKMARKER');
    }
  });

  it('and an Authorization header echoed by a proxy', async () => {
    // A local proxy (litellm and friends) can put the whole request back
    // in its error body. That is the worst case and the likeliest one on
    // a machine the owner runs himself.
    const said = await thrownFor('upstream rejected: Authorization: Bearer abcdef1234567890ABCDEF');
    expect(said).not.toContain('abcdef1234567890ABCDEF');
  });

  it('and what is left still classifies the failure', async () => {
    // The whole reason the body travels: «credit balance» must survive so
    // the owner reads a sentence he can act on.
    const said = await thrownFor('{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}');
    expect(said).toContain('credit balance');
  });
});
