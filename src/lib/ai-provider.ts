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
  /**
   * Which providers have a key, and the last four characters of each.
   * Never the key: no endpoint returns one, ever.
   */
  providerKeys: Record<string, string | null>;
  /** Per-assistant vendor and model, where one was chosen. */
  assistants: Record<string, { provider?: string; model?: string }>;
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
  /**
   * LEGACY single key: the one the default provider uses. Kept and still
   * read, so a company that configured a key before this existed does not
   * have to touch anything.
   */
  apiKeyEncrypted?: string;
  keyHint?: string;
  /**
   * A key PER PROVIDER, so several vendors can be configured at once.
   * Without this an assistant could be pointed at Anthropic while the only
   * key in the box belonged to OpenAI — a setting that saves and then
   * fails at the moment somebody needs an answer.
   */
  keys?: Record<string, { enc: string; hint: string }>;
  /**
   * Per-assistant routing. Absent = the company default, which is what
   * every assistant did before and what most should keep doing.
   */
  assistants?: Record<string, { provider?: string; model?: string }>;
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
    hasKey: !!ai.apiKeyEncrypted || !!ai.keys?.[provider] || !!process.env.OPENROUTER_API_KEY,
    keyHint: ai.keyHint ?? null,
    // A hint per vendor, so the screen can say WHICH ones are configured
    // rather than one «محفوظ» that could mean any of them.
    providerKeys: Object.fromEntries(
      AI_PROVIDERS.map((p) => [
        p.id,
        ai.keys?.[p.id]?.hint ?? (p.id === provider ? ai.keyHint ?? null : null),
      ])
    ),
    assistants: ai.assistants ?? {},
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
    /** A key per vendor: value = set it, null = clear it, absent = leave it. */
    providerKeys?: Record<string, string | null>;
    /** Per-assistant vendor and model. An empty object clears an override. */
    assistants?: Record<string, { provider?: string; model?: string }>;
  },
  /** Whoever pressed save, for the prompt versions. */
  actor?: { name: string | null; now?: Date }
): Promise<AiSettings> {
  // Refused before anything is touched: a key stored in the clear is worse
  // than no AI at all.
  const anyKey = input.apiKey || Object.values(input.providerKeys ?? {}).some((v) => !!v);
  if (anyKey && !encryptionAvailable()) throw new Error('ENCRYPTION_KEY_MISSING');

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
      keys: current.keys,
      /**
       * Only vendors and models this system knows.
       *
       * An unknown provider is dropped rather than stored: a typo would
       * otherwise route an assistant to a vendor that does not exist, and
       * the failure would appear as «الذكاء غير مضبوط» on a screen far
       * from the setting that caused it.
       */
      assistants:
        input.assistants === undefined
          ? current.assistants
          : Object.fromEntries(
              Object.entries(input.assistants)
                .map(([job, v]) => {
                  const provider = AI_PROVIDERS.find((p) => p.id === v.provider)?.id;
                  const model = v.model?.trim() || undefined;
                  return [job, { ...(provider ? { provider } : {}), ...(model ? { model } : {}) }] as const;
                })
                // An override that says nothing is not stored at all.
                .filter(([, v]) => Object.keys(v).length > 0)
            ),
    };

    // Per-vendor keys, each encrypted on the way in.
    if (input.providerKeys) {
      const keys = { ...(current.keys ?? {}) };
      for (const [id, value] of Object.entries(input.providerKeys)) {
        if (!AI_PROVIDERS.some((p) => p.id === id)) continue;
        if (value === null) delete keys[id];
        else if (value) keys[id] = { enc: encryptSecret(value.trim()), hint: secretHint(value.trim()) ?? '' };
      }
      next.keys = Object.keys(keys).length > 0 ? keys : undefined;
    }

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

/**
 * WHERE ONE CALL GOES: vendor, model and key, for THIS assistant.
 *
 * Resolved in one place because the three have to agree. Pointing an
 * assistant at Anthropic while handing it the OpenAI key is a setting that
 * saves cleanly and fails only when somebody asks a question — so the key
 * is chosen by the provider that was resolved, never by what happens to be
 * stored first.
 *
 * Order, narrowest first:
 *   the assistant's own provider and model
 *   the company's default provider and model
 *   the provider's own default model, when only a provider was chosen
 *
 * Never leaves the server.
 */
export interface AiRoute {
  provider: AiProvider;
  model: string;
  key: string | null;
}

async function routeFor(companyId: string, job?: string): Promise<AiRoute> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { settings: true } });
  const ai = readStored(company?.settings ?? null);

  const fallback = (AI_PROVIDERS.find((p) => p.id === ai.provider)?.id ?? 'OPENROUTER') as AiProvider;
  const override = job ? ai.assistants?.[job] : undefined;
  const chosen = AI_PROVIDERS.find((p) => p.id === override?.provider)?.id as AiProvider | undefined;
  const provider = chosen ?? fallback;

  // A model belongs to a vendor. When the assistant switched vendor and
  // named no model, the company's model is the WRONG default — it is the
  // other vendor's name — so the new vendor's own default is used.
  const model =
    override?.model?.trim() ||
    (chosen && chosen !== fallback
      ? providerInfo(provider).defaultModel
      : ai.model || providerInfo(provider).defaultModel);

  let key: string | null = null;
  const stored = ai.keys?.[provider]?.enc;
  if (stored) {
    try {
      key = decryptSecret(stored);
    } catch {
      key = null;
    }
  } else if (provider === fallback && ai.apiKeyEncrypted) {
    // The legacy single key belongs to whichever provider was the default
    // when it was entered — never handed to a vendor it was not issued by.
    try {
      key = decryptSecret(ai.apiKeyEncrypted);
    } catch {
      key = null;
    }
  }
  if (!key && provider === 'OPENROUTER') key = process.env.OPENROUTER_API_KEY ?? null;

  return { provider, model, key };
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
  // Vendor, model and key for THIS assistant — `req.job` is the assistant.
  const route = await routeFor(req.companyId, req.job);
  const key = route.key;
  if (!key) throw new AiNotConfigured();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);

  try {
    const house = settings.prompt.trim();
    const system = house ? `${house}\n\n${req.system}` : req.system;

    if (route.provider === 'ANTHROPIC') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: route.model,
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
      route.provider === 'OPENAI'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions';

    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(route.provider === 'OPENROUTER'
          ? { 'HTTP-Referer': 'https://salesflow.io', 'X-Title': 'SALESFLOW Business Intelligence' }
          : {}),
      },
      body: JSON.stringify({
        model: route.model,
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
