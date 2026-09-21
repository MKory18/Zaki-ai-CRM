/**
 * SECRETS AT REST — one way to store a password the server must be able to
 * use again.
 *
 * A courier password cannot be hashed: we have to send it to them on every
 * call. So it is encrypted with a key that lives only in the environment,
 * which means a stolen database dump is not a stolen account — the key is
 * not in it.
 *
 * Fail closed, always. Without a key this throws rather than storing
 * plaintext, because a secret written in the clear is worse than a feature
 * that refused to save: one is a visible failure, the other is an invisible
 * one that nobody discovers until it matters.
 *
 * The format is versioned — `v1:iv:tag:cipher` — so a future key rotation
 * or algorithm change can read what came before instead of orphaning it.
 *
 * This was WhatsApp-specific and is now shared. The old key name is still
 * honoured so that deployments already holding encrypted tokens keep
 * decrypting them.
 */
import crypto from 'crypto';

const VERSION = 'v1';

function requireKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY || process.env.WHATSAPP_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error('ENCRYPTION_KEY_MISSING');
  }
  // 64 hex characters is a real 32-byte key. Anything else is a passphrase,
  // and hashing it gives 32 bytes without asking the operator to understand
  // the difference.
  if (raw.length === 64 && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/** Is a key configured at all? Lets a screen say so before a save fails. */
export function encryptionAvailable(): boolean {
  try {
    requireKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const key = requireKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(blob: string): string {
  const key = requireKey();
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('CIPHER_MALFORMED');
  }
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const data = Buffer.from(parts[3], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * A JSON bag of secrets, encrypted as one blob.
 *
 * Courier accounts are never a single string — an id, a login and a
 * password travel together and are useless apart. Encrypting them as one
 * value means a partially-saved account cannot exist.
 */
export function encryptJson(value: Record<string, unknown>): string {
  return encryptSecret(JSON.stringify(value));
}

/**
 * Read a secret bag back. A blob that will not decrypt — wrong key, truncated
 * column, a key rotated without re-encrypting — returns null rather than
 * throwing, so a courier with unreadable credentials falls back to manual
 * instead of taking the whole shipping screen down with it.
 */
export function decryptJson<T = Record<string, unknown>>(blob: string | null | undefined): T | null {
  if (!blob) return null;
  try {
    return JSON.parse(decryptSecret(blob)) as T;
  } catch {
    return null;
  }
}

/**
 * What a screen may see of a stored secret: that it exists, and enough of
 * its tail to recognise which one it is. Never the secret.
 */
export function secretHint(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.length <= 4) return '••••';
  return `••••${v.slice(-3)}`;
}
