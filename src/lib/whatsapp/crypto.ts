/**
 * WHATSAPP CRYPTO — now a thin alias over the shared secret store.
 *
 * The implementation moved to `@/lib/secrets` when courier accounts needed
 * the same thing: one AES-256-GCM routine, one key, one versioned format.
 * Two copies of an encryption helper is two places a key can be read wrong.
 *
 * The names stay so every existing call site keeps working, and the blob
 * format is unchanged (`v1:iv:tag:cipher`), so tokens already stored keep
 * decrypting. `WHATSAPP_ENCRYPTION_KEY` is still honoured as a key source.
 */
import { encryptSecret, decryptSecret } from '@/lib/secrets';

export function whatsappEncrypt(plaintext: string): string {
  return encryptSecret(plaintext);
}

export function whatsappDecrypt(blob: string): string {
  return decryptSecret(blob);
}
