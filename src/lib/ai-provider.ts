import { db } from './db';
import { decryptSecret, encryptSecret, encryptionAvailable, secretHint } from './secrets';

/**
 * WHICH AI, AND WITH WHOSE KEY.
 *
 * The analysis used to read one environment variable and talk to one
 * vendor. That is a decision made once, at deploy time, by whoever had
 * shell access — and it is the wrong person: the company pays for the key,
 * and the company should be able to change vendor without a deploy.
 *
 * So the provider, the model and the key live in company settings, and the
 * three vendors share one call. They differ in exactly three ways — the
 * URL, the auth header, and where the answer sits in the response — and
 * nothing above this file needs to know which one is configured.
 *
 * THE KEY IS WRITE-ONLY. It is encrypted before it is stored, no endpoint
 * ever returns it, and only a hint (last four characters) is shown back so
 * somebody can tell which key is in there. If encryption is unavailable the
 * save is REFUSED rather than writing a key in the clear — a key in a
 * database anybody can read is worse than no AI at all.
 */

export type AiProvider = 'OPENROUTER' | 'OPENAI' | 'ANTHROPIC';

export interface ProviderInfo {
  id: AiProvider;
  label: string;
  /** What to put in the model box if they have no preference. */
  defaultModel: string;
  /** Examples, so the box is not a blank line with no clue what goes in it. */
  models: string[];
  keyHelp: string;
}

export const AI_PROVIDERS: ProviderInfo[] = [
  {
    id: 'OPENROUTER',
    label: 'OpenRouter',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'anthropic/claude-sonnet-4.5',
      'openai/gpt-4o-mini',
    ],
    keyHelp: 'مفتاح من openrouter.ai — يبدأ بـ sk-or-',
  },
  {
    id: 'OPENAI',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
    keyHelp: 'مفتاح من platform.openai.com — يبدأ بـ sk-',
  },
  {
    id: 'ANTHROPIC',
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
    keyHelp: 'مفتاح من console.anthropic.com — يبدأ بـ sk-ant-',
  },
];

export function providerInfo(id: string): ProviderInfo {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}

export interface AiSettings {
  provider: AiProvider;
  model: string;
  /** The house prompt prepended to every request. Empty means the default. */
  prompt: string;
  hasKey: boolean;
  keyHint: string | null;
}

interface StoredAi {
  provider?: string;
  model?: string;
  prompt?: string;
  apiKeyEncrypted?: string;
  keyHint?: string;
}

function readStored(settings: string | null): StoredAi {
  try {
    return (settings ? JSON.parse(settings) : {}).ai ?? {};
  } catch {
    return {};
  }
}

/** What the settings screen may see. Never the key itself. */
export async function aiSettings(companyId: string): Promise<AiSettings> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { settings: true } });
  const ai = readStored(company?.settings ?? null);
  const provider = (AI_PROVIDERS.find((p) => p.id === ai.provider)?.id ?? 'OPENROUTER') as AiProvider;
  return {
    provider,
    model: ai.model || providerInfo(provider).defaultModel,
    prompt: ai.prompt || '',
    // The environment key still counts as configured, so an existing deploy
    // keeps working without anybody re-entering anything.
    hasKey: !!ai.apiKeyEncrypted || !!process.env.OPENROUTER_API_KEY,
    keyHint: ai.keyHint ?? null,
  };
}

export async function saveAiSettings(
  companyId: string,
  input: { provider: AiProvider; model: string; prompt?: string; apiKey?: string | null }
): Promise<AiSettings> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { settings: true } });
  const all = (() => {
    try {
      return company?.settings ? JSON.parse(company.settings) : {};
    } catch {
      return {};
    }
  })();
  const current: StoredAi = all.ai ?? {};

  const next: StoredAi = {
    provider: input.provider,
    model: input.model.trim() || providerInfo(input.provider).defaultModel,
    prompt: (input.prompt ?? current.prompt ?? '').slice(0, 4000),
    apiKeyEncrypted: current.apiKeyEncrypted,
    keyHint: current.keyHint,
  };

  if (input.apiKey === null) {
    // Explicitly cleared.
    delete next.apiKeyEncrypted;
    delete next.keyHint;
  } else if (input.apiKey) {
    if (!encryptionAvailable()) {
      throw new Error('ENCRYPTION_KEY_MISSING');
    }
    next.apiKeyEncrypted = encryptSecret(input.apiKey.trim());
    next.keyHint = secretHint(input.apiKey.trim()) ?? undefined;
  }

  await db.company.update({
    where: { id: companyId },
    data: { settings: JSON.stringify({ ...all, ai: next }) },
  });
  return aiSettings(companyId);
}

/** The key, decrypted, for a call about to be made. Never leaves the server. */
async function resolveKey(companyId: string): Promise<string | null> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { settings: true } });
  const ai = readStored(company?.settings ?? null);
  if (ai.apiKeyEncrypted) {
    try {
      return decryptSecret(ai.apiKeyEncrypted);
    } catch {
      return null;
    }
  }
  return process.env.OPENROUTER_API_KEY ?? null;
}

export interface ChatRequest {
  companyId: string;
  system: string;
  user: string;
  /** Ask for a JSON object back. Only OpenRouter and OpenAI honour it. */
  json?: boolean;
  timeoutMs?: number;
}

export class AiNotConfigured extends Error {
  constructor() {
    super('AI_NOT_CONFIGURED');
  }
}

/**
 * One call, three vendors.
 *
 * Anthropic's API differs enough to be worth naming: the system prompt is a
 * top-level field rather than a message, the key rides in `x-api-key`, and
 * `max_tokens` is required. Everything else is the OpenAI shape, which
 * OpenRouter also speaks.
 */
export async function aiChat(req: ChatRequest): Promise<string> {
  const settings = await aiSettings(req.companyId);
  const key = await resolveKey(req.companyId);
  if (!key) throw new AiNotConfigured();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);

  try {
    const house = settings.prompt.trim();
    const system = house ? `${house}\n\n${req.system}` : req.system;

    if (settings.provider === 'ANTHROPIC') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: 2000,
          system,
          messages: [{ role: 'user', content: req.user }],
        }),
      });
      if (!res.ok) throw new Error(`AI_HTTP_${res.status}`);
      const data = await res.json();
      return data?.content?.[0]?.text ?? '';
    }

    const url =
      settings.provider === 'OPENAI'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions';

    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(settings.provider === 'OPENROUTER'
          ? { 'HTTP-Referer': 'https://salesflow.io', 'X-Title': 'SALESFLOW Business Intelligence' }
          : {}),
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: req.user },
        ],
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`AI_HTTP_${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}
