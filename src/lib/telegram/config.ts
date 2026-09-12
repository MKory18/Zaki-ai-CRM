/**
 * TELEGRAM CONFIG — server-only env access (mirrors whatsapp/config.ts).
 * Never imported by client code; never returns the raw token to callers
 * (only booleans / derived non-secret values). Fail closed.
 */

export function getBotToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  return t && t.trim() ? t.trim() : null;
}

export function getWebhookSecret(): string | null {
  const s = process.env.TELEGRAM_WEBHOOK_SECRET;
  return s && s.trim() ? s.trim() : null;
}

export function getEncryptionKey(): string | null {
  const k = process.env.TELEGRAM_ENCRYPTION_KEY;
  return k && k.trim() ? k.trim() : null;
}

export function getApiBaseUrl(): string {
  const base = process.env.TELEGRAM_API_BASE_URL;
  return base && base.trim() ? base.trim().replace(/\/+$/, '') : 'https://api.telegram.org';
}

/** Public app URL used to build the webhook URL (never hardcoded). */
export function getAppUrl(): string | null {
  const u =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return u && u.trim() ? u.trim().replace(/\/+$/, '') : null;
}

/** True when the bot token is present (sending + webhook registration possible). */
export function botConfigured(): boolean {
  return Boolean(getBotToken());
}

/** True when the webhook secret is present (webhook verification possible). */
export function webhookSecretConfigured(): boolean {
  return Boolean(getWebhookSecret());
}

export const WEBHOOK_PATH = '/api/webhooks/telegram';
