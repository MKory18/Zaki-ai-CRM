import { sanitizeScopes, type AiScope } from './ai-assistants';
import { db } from './db';
import { sanitizePromptOverrides, resolvePrompt, recordVersions, HOUSE_JOB, type PromptHistory } from './ai-prompts';
import { decryptSecret, encryptSecret, encryptionAvailable, secretHint } from './secrets';
import { updateCompanySettings } from './company-settings';

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

/**
 * THE MODELS EACH VENDOR OFFERS, NEWEST FIRST.
 *
 * A list in code goes stale the week a vendor ships something — so this is
 * a SUGGESTION list, not a whitelist: the model box accepts anything typed
 * into it, and the names here only save somebody from remembering the
 * exact spelling of `claude-haiku-4-5-20251001`.
 *
 * Ordered newest first and annotated by what each is FOR, because the
 * choice that matters is not the vendor but the tier: a note classifier
 * running thousands of times a day and a business analysis run once an
 * hour should not be the same model, and picking the expensive one for
 * both is the commonest way an AI bill becomes a surprise.
 */
export const AI_PROVIDERS: ProviderInfo[] = [
  {
    id: 'ANTHROPIC',
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-5',
    models: [
      'claude-opus-5-5',
      'claude-sonnet-5',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5',
      'claude-haiku-4-5',
    ],
    keyHelp: 'مفتاح من console.anthropic.com — يبدأ بـ sk-ant-',
  },
  {
    id: 'OPENAI',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3-mini'],
    keyHelp: 'مفتاح من platform.openai.com — يبدأ بـ sk-',
  },
  {
    id: 'OPENROUTER',
    label: 'OpenRouter',
    /**
     * The free model stays the default, and that is not a preference.
     * OpenRouter is what a company with no key falls back to, so this is
     * the model the product runs on before anybody has paid anyone — and
     * making it a paid one would turn "AI is not configured yet" into a
     * bill.
     */
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    models: [
      'anthropic/claude-sonnet-4.5',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'meta-llama/llama-3.3-70b-instruct:free',
    ],
    keyHelp: 'مفتاح من openrouter.ai — يبدأ بـ sk-or-',
  },
];

/**
 * WHICH TIER A JOB DESERVES.
 *
 * Shown beside the model box so the tier is a decision rather than a
 * default nobody revisited.
 */
export const MODEL_TIERS: { match: RegExp; tier: string; note: string }[] = [
  { match: /opus|gpt-4o(?!-mini)|o3(?!-mini)/i, tier: 'الأعلى', note: 'للتحليل والقرارات — أغلى بكثير، لا يُستعمل لكلّ رسالة' },
  { match: /sonnet|o4-mini|o3-mini/i, tier: 'متوازن', note: 'الاستخراج والتأكيد والتلخيص' },
  { match: /haiku|mini|free/i, tier: 'اقتصادي', note: 'التصنيف عالي التكرار — آلاف الرسائل يومياً' },
];

export function tierOf(model: string): { tier: string; note: string } | null {
  return MODEL_TIERS.find((t) => t.match.test(model)) ?? null;
}

export function providerInfo(id: string): ProviderInfo {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}

export interface AiSettings {
  provider: AiProvider;
  model: string;
  /**
   * The house prompt prepended to every request — the one in force. It is
   * the 'house' entry of `prompts`, read here so no caller has to know.
   */
  prompt: string;
  /**
   * The company's own wording for each AI job, where they wrote one.
   *
   * Only overrides are stored. A job the seller never touched is absent,
   * and gets the current default — a default copied into the database is a
   * default that stops improving the day it is written.
   */
  prompts: Record<string, string>;
  /**
   * The fields the business-intelligence assistant is allowed to read.
   *
   * Empty by default, and it stays empty until the owner ticks a box: an
   * assistant that reads the company's money because nobody turned it off
   * is an assistant nobody decided on.
   */
  intelligenceScopes: AiScope[];
  /**
   * The wording each job had before, newest first.
   *
   * Kept beside the prompts rather than in an audit table: it is not a
   * record of who did what — it is the sentence somebody needs back, and
   * it has to be one click from the box they are staring at.
   */
  promptHistory: PromptHistory;
  hasKey: boolean;
  keyHint: string | null;
}

interface StoredAi {
  provider?: string;
  model?: string;
  /**
   * LEGACY house prompt. It was written by a card on the system settings
   * screen while /settings/ai wrote `prompts.house`, and only this one was
   * read — so the screen built for it edited a prompt nothing used. Now
   * `prompts.house` is the only one: this is read as its fallback until
   * the next save through /settings/ai, which drops it.
   */
  prompt?: string;
  prompts?: Record<string, string>;
  /** See AiSettings.intelligenceScopes. */
  intelligenceScopes?: string[];
  /** See AiSettings.promptHistory. */
  promptHistory?: PromptHistory;
  apiKeyEncrypted?: string;
  keyHint?: string;
}

/** The overrides as the editor should show them: the legacy house prompt folded in. */
function overridesOf(ai: StoredAi): Record<string, string> {
  const prompts = sanitizePromptOverrides(ai.prompts);
  if (!prompts[HOUSE_JOB] && ai.prompt?.trim()) prompts[HOUSE_JOB] = ai.prompt.trim().slice(0, 4000);
  return prompts;
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
  const prompts = overridesOf(ai);
  return {
    provider,
    model: ai.model || providerInfo(provider).defaultModel,
    prompt: resolvePrompt(HOUSE_JOB, prompts),
    prompts,
    // The environment key still counts as configured, so an existing deploy
    // keeps working without anybody re-entering anything.
    // Nothing until the owner ticks a box: an assistant reading the money
    // because nobody turned it off is an assistant nobody decided on.
    intelligenceScopes: sanitizeScopes(ai.intelligenceScopes),
    promptHistory: ai.promptHistory ?? {},
    hasKey: !!ai.apiKeyEncrypted || !!process.env.OPENROUTER_API_KEY,
    keyHint: ai.keyHint ?? null,
  };
}

export async function saveAiSettings(
  companyId: string,
  input: {
    provider: AiProvider;
    model: string;
    prompts?: Record<string, string>;
    intelligenceScopes?: string[];
    apiKey?: string | null;
  },
  /** Whoever pressed save, for the prompt versions. */
  actor?: { name: string | null; now?: Date }
): Promise<AiSettings> {
  // Refused before anything is touched: a key stored in the clear is worse
  // than no AI at all.
  if (input.apiKey && !encryptionAvailable()) throw new Error('ENCRYPTION_KEY_MISSING');

  // Only the `ai` key, under a row lock: a template save running at the
  // same moment used to write back the key this save had just removed.
  await updateCompanySettings<StoredAi>(companyId, 'ai', (stored) => {
    const current: StoredAi = stored ?? {};
    const nextPrompts =
      input.prompts !== undefined ? sanitizePromptOverrides(input.prompts) : current.prompts;

    const next: StoredAi = {
      provider: input.provider,
      model: input.model.trim() || providerInfo(input.provider).defaultModel,
      // Sanitised on the way in: unknown jobs are dropped, and an override
      // equal to the default is not stored at all.
      prompts: nextPrompts,
      // The replaced wording, kept before it is overwritten. Inside the
      // same row lock as the write itself: read it outside and a second
      // save between the two loses a version.
      promptHistory:
        input.prompts === undefined
          ? current.promptHistory
          : recordVersions(
              current.promptHistory,
              overridesOf(current),
              nextPrompts ?? {},
              { at: (actor?.now ?? new Date()).toISOString(), by: actor?.name ?? null }
            ),
      // Only names this system knows — an unknown one is dropped, never
      // guessed at, so a typo can never widen what an assistant reads.
      intelligenceScopes:
        input.intelligenceScopes !== undefined
          ? sanitizeScopes(input.intelligenceScopes)
          : current.intelligenceScopes,
      // The editor was shown the legacy house prompt as `prompts.house`, so
      // what it sends back is the whole truth — keeping the legacy key would
      // bring a prompt the seller just cleared back to life.
      ...(input.prompts === undefined && current.prompt ? { prompt: current.prompt } : {}),
      apiKeyEncrypted: current.apiKeyEncrypted,
      keyHint: current.keyHint,
    };

    if (input.apiKey === null) {
      // Explicitly cleared.
      delete next.apiKeyEncrypted;
      delete next.keyHint;
    } else if (input.apiKey) {
      next.apiKeyEncrypted = encryptSecret(input.apiKey.trim());
      next.keyHint = secretHint(input.apiKey.trim()) ?? undefined;
    }
    return next;
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
  /**
   * The words for this call. Pass a `job` instead to use the company's own
   * wording for one of the named jobs — which is what every caller in the
   * system does, so that editing a prompt in settings actually changes
   * what the model is told.
   */
  system?: string;
  /** A key from AI_JOBS. Its prompt is resolved per company. */
  job?: string;
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
