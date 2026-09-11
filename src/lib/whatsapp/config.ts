/**
 * WHATSAPP CONFIG — server-only env access. This module must NEVER be
 * imported by client code and must never return the raw token to callers
 * (only booleans/derived values). Fail closed: missing values are reported
 * as "not configured" — no secrets and no silent fallbacks.
 */

export function getAccessToken(): string | null {
  const t = process.env.WHATSAPP_ACCESS_TOKEN;
  return t && t.trim() ? t.trim() : null;
}

export function getWabaId(): string | null {
  const v = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  return v && v.trim() ? v.trim() : null;
}

export function getPhoneNumberId(): string | null {
  const v = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return v && v.trim() ? v.trim() : null;
}

export function getVerifyToken(): string | null {
  const v = process.env.WHATSAPP_VERIFY_TOKEN;
  return v && v.trim() ? v.trim() : null;
}

export function getAppSecret(): string | null {
  const v = process.env.WHATSAPP_APP_SECRET;
  return v && v.trim() ? v.trim() : null;
}

/** True when every value required for sending/receiving is present in env. */
export function envConfigured(): boolean {
  return Boolean(getAccessToken() && getWabaId() && getPhoneNumberId() && getAppSecret());
}

/** True when the webhook can be verified (verify token + app secret). */
export function webhookConfigured(): boolean {
  return Boolean(getVerifyToken() && getAppSecret());
}

export const GRAPH_BASE = 'https://graph.facebook.com';
export const GRAPH_VERSION = 'v21.0';
