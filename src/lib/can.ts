// Client-safe permission check for UI gating (UX only — the server remains
// the source of truth). SessionUser.permissions carries the effective keys.
import type { SessionUser } from '@/types/auth';

export function userCan(user: SessionUser | undefined | null, permission: string): boolean {
  return !!user && (user.role === 'SUPER_ADMIN' || user.permissions.includes(permission));
}
