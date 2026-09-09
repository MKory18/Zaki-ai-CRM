// PHASE 2 verification: legacy parity â€” for every system role and every real
// user, the DB effective grants must equal the legacy-mapped permission set.
// Run: npx tsx scripts/verify-permission-parity.ts
import { db } from '../src/lib/db';
import { ROLE_PERMISSIONS, UserRole } from '../src/types/auth';
import { computeEffectiveGrants, legacyEffectiveKeys, catalogExtensionKeys } from '../src/lib/permissions-core';

async function main() {
  let failures = 0;

  // 1. Role-level parity
  const roles = await db.role.findMany({ where: { isSystem: true }, include: { permissions: true } });
  for (const role of roles) {
    const legacyKeys = catalogExtensionKeys(new Set(legacyEffectiveKeys(role.name as UserRole)));
    const dbKeys = new Set(role.permissions.map((p) => p.permission));
    const missing = [...legacyKeys].filter((k) => !dbKeys.has(k));
    const extra = [...dbKeys].filter((k) => !legacyKeys.has(k));
    if (missing.length || extra.length) {
      failures++;
      console.log(`FAIL role=${role.name} missing=[${missing}] extra=[${extra}]`);
    } else {
      console.log(`PASS role=${role.name} (${dbKeys.size} permissions)`);
    }
  }

  // 2. User-level parity (every real user: DB effective == legacy mapped + user overrides)
  const users = await db.user.findMany({ select: { id: true, email: true, role: true, roleId: true, status: true } });
  for (const u of users) {
    const { fullAccess, grants } = await computeEffectiveGrants({ id: u.id, role: u.role, roleId: u.roleId });
    if (fullAccess) {
      console.log(`PASS user=${u.email} (SUPER_ADMIN full access)`);
      continue;
    }
    const legacyKeys = catalogExtensionKeys(new Set(legacyEffectiveKeys(u.role as UserRole)));
    // User overrides (Phase 5) are legitimate per-user deltas: ALLOW adds keys,
    // DENY removes them. Apply them to the expected set before comparing.
    const overrides = await db.userPermission.findMany({ where: { userId: u.id } });
    const expected = new Set(legacyKeys);
    for (const o of overrides) {
      if (o.effect === 'DENY') expected.delete(o.permission);
      else expected.add(o.permission);
    }
    const dbKeys = new Set(Object.keys(grants));
    const missing = [...expected].filter((k) => !dbKeys.has(k));
    const extra = [...dbKeys].filter((k) => !expected.has(k));
    const overrideNote = overrides.length ? ` (+${overrides.length} overrides)` : '';
    if (missing.length || extra.length) {
      failures++;
      console.log(`FAIL user=${u.email} missing=[${missing}] extra=[${extra}]`);
    } else {
      console.log(`PASS user=${u.email} (${dbKeys.size} permissions)${overrideNote}`);
    }
  }

  // 3. Every user has roleId
  const noRole = users.filter((u) => !u.roleId);
  console.log(noRole.length === 0 ? 'PASS all users have roleId' : `FAIL users without roleId: ${noRole.map((u) => u.email)}`);
  if (noRole.length) failures++;

  console.log(failures === 0 ? '\nOVERALL: PASS' : `\nOVERALL: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => db.$disconnect());

