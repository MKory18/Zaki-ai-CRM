// Client-safe permission check for UI gating (UX only — the server remains
// the source of truth). SessionUser.permissions carries the effective keys.
import type { SessionUser } from '@/types/auth';
import { LEGACY_ALIAS } from './permission-aliases';

/**
 * The same answer the server's `can()` gives: SUPER_ADMIN holds everything, and a key is held when it — or the
 * canonical key it is an alias of — is among the user's effective keys. No other role is all-powerful here,
 * because none is on the server: a screen that let COMPANY_ADMIN through by name showed buttons that then failed.
 */
export function userCan(user: SessionUser | undefined | null, permission: string): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  const held = user.permissions ?? [];
  return held.includes(permission) || held.includes(LEGACY_ALIAS[permission] ?? permission);
}
