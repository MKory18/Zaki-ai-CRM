/**
 * RESERVED ROLE NAMES — single canonical source for role-name reservation.
 *
 * The permission engine keys full access off the legacy role string
 * (permissions-core: `user.role === 'SUPER_ADMIN'` → fullAccess). Any Role row
 * — system or company — whose NAME normalizes to a privileged legacy string
 * can therefore be weaponized (role deletion replacement, role assignment)
 * to grant users that legacy string. These helpers normalize aggressively
 * (Unicode NFKC, trim, whitespace/hyphen collapse, lowercase) and are the
 * ONLY sanctioned name checks — never inline-compare role names in routes.
 */
import { ROLE_PERMISSIONS } from '../types/auth';

/** All built-in (system/legacy) role names, from the canonical role matrix. */
const SYSTEM_ROLE_NAMES: ReadonlySet<string> = new Set(
  Object.keys(ROLE_PERMISSIONS).map((r) => normalizeRoleName(r))
);

/**
 * Privileged legacy strings — assuming 'SUPER_ADMIN' as user.role grants
 * fullAccess in the engine (permissions-core). Reserved for the real
 * SUPER_ADMIN only, in every write path that lands a role string on users.
 */
const PRIVILEGED_ROLE_NAMES: ReadonlySet<string> = new Set(['super_admin', 'superadmin']);

/** Normalize a role name for comparison (NFKC + trim + collapse separators). */
export function normalizeRoleName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** True when the name shadows any system role (blocks create/rename shadowing). */
export function isReservedRoleName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return SYSTEM_ROLE_NAMES.has(normalizeRoleName(name)) || PRIVILEGED_ROLE_NAMES.has(normalizeRoleName(name));
}

/** True when the name impersonates a privileged legacy role (SUPER_ADMIN / COMPANY_ADMIN). */
export function isPrivilegedRoleName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return PRIVILEGED_ROLE_NAMES.has(normalizeRoleName(name));
}