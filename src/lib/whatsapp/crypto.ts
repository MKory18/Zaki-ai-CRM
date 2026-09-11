/**
 * WHATSAPP CRYPTO — AES-256-GCM encryption at rest for stored access tokens.
 * Key comes exclusively from WHATSAPP_ENCRYPTION_KEY (env). Fail closed:
 * encryption/decryption without a key throws — nothing is ever stored or
 * sent in plaintext. Encrypted blobs are versioned ("v1:iv:tag:cipher").
 * Tokens are NEVER logged here.
 */
import crypto from 'crypto';

const VERSION = 'v1';

function requireKey(): Buffer {
  const raw = process.env.WHATSAPP_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error('WHATSAPP_ENCRYPTION_KEY_MISSING');
  }
  // Accept 64-char hex (32 bytes) or any longer passphrase → derive via sha256
  if (raw.length === 64 && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function whatsappEncrypt(plaintext: string): string {
  const key = requireKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function whatsappDecrypt(blob: string): string {
  const key = requireKey();
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('WHATSAPP_CIPHER_MALFORMED');
  }
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const data = Buffer.from(parts[3], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
