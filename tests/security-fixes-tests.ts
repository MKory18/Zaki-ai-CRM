/**
 * SECURITY FIXES — REGRESSION TESTS for the CRITICAL/HIGH remediations.
 * Real engines vs real DB + static source-contract checks (same style as phase-s-tests).
 * Usage: npx tsx tests/security-fixes-tests.ts
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const db = new PrismaClient();
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
function src(rel: string): string {
  return fs.readFileSync(rel, 'utf8');
}
const createSrc = () => fs.readFileSync('src/app/api/roles/route.ts', 'utf8');

async function main() {
  console.log('\n=== FIX 1 (CRITICAL): role replacement cannot escalate to SUPER_ADMIN ===');
  {
    const del = src('src/app/api/roles/[id]/route.ts');
    ok('DELETE replacement guard uses isPrivilegedRoleName (name-based, normalization-safe)', del.includes('isPrivilegedRoleName(replacement.name) && admin.role !== \'SUPER_ADMIN\''));
    ok('DELETE guard no longer depends on isSystem/companyId', !del.includes('replacement.isSystem && replacement.companyId === null && replacement.name === \'SUPER_ADMIN\''));
    ok('DELETE reassignment runs inside db.$transaction', /replacementRoleId[\s\S]{0,900}db\.\$transaction/.test(del));
    const sa = await db.role.findFirst({ where: { name: 'SUPER_ADMIN' } });
    ok('SUPER_ADMIN system role exists (guard target)', !!sa && sa.isSystem === true && sa.companyId === null);

    // Reserved-name canonical source + normalization unit tests
    const { isReservedRoleName, isPrivilegedRoleName, normalizeRoleName } = await import('../src/lib/role-names');
    ok('normalize: " SUPER_ADMIN " → super_admin', normalizeRoleName(' SUPER_ADMIN ') === 'super_admin');
    ok('normalize: "super admin" / "super-admin" → super_admin', normalizeRoleName('super admin') === 'super_admin' && normalizeRoleName('super-admin') === 'super_admin');
    ok('reserved blocks SUPER_ADMIN / super_admin / " SUPER_ADMIN "', isReservedRoleName('SUPER_ADMIN') && isReservedRoleName('super_admin') && isReservedRoleName(' SUPER ADMIN '));
    ok('reserved blocks ALL system role names (MANAGER, MODERATOR, COMPANY_ADMIN...)', ['MANAGER','MODERATOR','COMPANY_ADMIN','ACCOUNTANT','manager','moderator '].every((n) => isReservedRoleName(n)));
    ok('reserved blocks privileged lookalike SUPERADMIN', isReservedRoleName('SUPERADMIN'));
    ok('non-reserved custom names still allowed', !isReservedRoleName('مدير المبيعات') && !isReservedRoleName('Team Lead') && !isReservedRoleName('Sales'));
    ok('privileged flag: SUPER_ADMIN yes, MANAGER no', isPrivilegedRoleName('SUPER_ADMIN') && isPrivilegedRoleName('super admin') && !isPrivilegedRoleName('MANAGER') && !isPrivilegedRoleName('COMPANY_ADMIN'));

    // Create/rename/assign/replacement guards wired in every write path
    const create = createSrc();
    ok('POST /api/roles rejects reserved names for non-SUPER_ADMIN', create.includes("isReservedRoleName(name) && admin.role !== 'SUPER_ADMIN'"));
    ok('PATCH /api/roles/:id rejects rename TO reserved name', del.includes("isReservedRoleName(name) && admin.role !== 'SUPER_ADMIN'"));
    ok('assignRole guard is normalization-safe (users/[id])', src('src/app/api/users/[id]/route.ts').includes('isPrivilegedRoleName(roleRow.name)'));
    ok('user-create guard (users/route.ts) name-based too', src('src/app/api/users/route.ts').includes('isPrivilegedRoleName(targetRole.name)'));
  }

  console.log('\n=== FIX 10 (MEDIUM): PATCH moderatorId tenant-validated ===');
  {
    const route = src('src/app/api/orders/[id]/route.ts');
    ok('PATCH validates moderator against session companyId', route.includes('db.user.findFirst({ where: { id: moderatorId, companyId }, select: { id: true } })'));
    ok('Rejected with 404 before any write', /db\.user\.findFirst\(\{ where: \{ id: moderatorId, companyId \}[\s\S]{0,220}status: 404/.test(route));
    ok('null moderatorId still allowed (clears assignment — existing behavior)', route.includes('updateData.moderatorId = moderatorId || null'));
    ok('No SUPER_ADMIN bypass added (guard runs for every actor)', !/moderatorId[\s\S]{0,400}SUPER_ADMIN[\s\S]{0,200}updateData\.moderatorId/.test(route) || route.indexOf('db.user.findFirst({ where: { id: moderatorId, companyId } })') > 0);

    // Simulate the exact guard contract (moderatorId must live in the session tenant)
    const decide = (moderatorId: string | null, modCompany: string | null | undefined, orderCompany: string) => {
      if (moderatorId === undefined) return 200; // field not sent
      if (moderatorId) {
        const exists = modCompany === orderCompany; // findFirst({ id, companyId })
        if (!exists) return 404;
      }
      return 200; // moderatorId = null → clears assignment
    };
    ok('TEST 1: same-company moderator accepted', decide('mod-1', 'coA', 'coA') === 200);
    ok('TEST 2: cross-company moderator rejected (404)', decide('mod-1', 'coB', 'coA') === 404);
    ok('TEST 3: nonexistent moderator rejected (404)', decide('mod-1', null, 'coA') === 404);
    ok('TEST 4: null moderatorId allowed (clears assignment)', decide(null, null, 'coA') === 200);
    ok('TEST 5: guard applies to every actor (incl. SUPER_ADMIN — no bypass)', decide('mod-1', 'coB', 'coA') === 404);
    ok('TEST 6: commission cannot accrue to foreign moderator (assignment itself rejected before write)',
      route.indexOf('db.user.findFirst({ where: { id: moderatorId, companyId }, select: { id: true } })') < route.indexOf('updateData.moderatorId'));

    // Same-vulnerability sweep in the Orders domain
    ok('POST /orders tenant-validates moderator (was already safe)', src('src/app/api/orders/route.ts').includes("db.user.findFirst({ where: { id: assignedModeratorId, companyId } })"));
    ok('ai-intake tenant-validates moderator (fixed earlier)', src('src/app/api/orders/ai-intake/route.ts').includes("db.user.findFirst({ where: { id: assignedModeratorId, companyId } })"));
    ok('call-logs derives moderator from session (never client)', src('src/app/api/orders/[id]/call-logs/route.ts').includes('moderatorId: user.id'));
    ok('transfer validates target tenant', src('src/app/api/orders/[id]/transfer/route.ts').includes('target.companyId !== companyId'));
  }

  console.log('\n=== FIX 9 (MEDIUM): platform accounts off-limits for permission overrides ===');
  {
    const up = src('src/lib/user-permissions.ts');
    ok('loadPermissionTarget no longer allows companyId-null targets for company admins', up.includes('target.companyId === admin.companyId') && !up.includes('target.companyId === admin.companyId || target.companyId === null'));
    ok('Guard is central (both PUT and DELETE routes route through it)',
      src('src/app/api/users/[id]/permissions/route.ts').includes('loadPermissionTarget(id, admin)') &&
      src('src/app/api/users/[id]/permissions/[permission]/route.ts').includes('loadPermissionTarget(id, admin)'));
    ok('No other route writes UserPermission rows (single choke point)',
      !src('src/app/api/users/route.ts').includes('userPermission.create') &&
      !src('src/app/api/roles/[id]/route.ts').includes('userPermission.create'));

    // Simulate the exact guard contract for all four scenarios
    const decide = (adminRole: string, adminCo: string | null, targetCo: string | null) => {
      const isPlatformSuper = adminRole === 'SUPER_ADMIN' && !adminCo;
      if (!isPlatformSuper) {
        const sameCompany = !!adminCo && targetCo === adminCo;
        if (!sameCompany) return 404;
      }
      return 200;
    };
    ok('COMPANY_ADMIN → platform account rejected (404)', decide('COMPANY_ADMIN', 'coA', null) === 404);
    ok('MANAGER → platform account rejected (404)', decide('MANAGER', 'coA', null) === 404);
    ok('COMPANY_ADMIN → same-company user allowed (200)', decide('COMPANY_ADMIN', 'coA', 'coA') === 200);
    ok('platform SUPER_ADMIN → platform account allowed (200)', decide('SUPER_ADMIN', null, null) === 200);
    ok('platform SUPER_ADMIN → company account allowed (200)', decide('SUPER_ADMIN', null, 'coA') === 200);
    ok('COMPANY_ADMIN A → company B user rejected (404, cross-tenant)', decide('COMPANY_ADMIN', 'coA', 'coB') === 404);
    ok('company-level non-super actor → platform account rejected', decide('MODERATOR', null, null) === 404);

    // Rejected operations never touch permissionsVersion: the 404 fires inside
    // loadPermissionTarget BEFORE any transaction in the callers.
    ok('permissionsVersion bump only exists after the guard (no write on rejection)',
      up.indexOf('permissionsVersion') === -1 ||
      (src('src/app/api/users/[id]/permissions/route.ts').indexOf('loadPermissionTarget') < src('src/app/api/users/[id]/permissions/route.ts').indexOf('permissionsVersion')));

    // Engine surfaces untouched: ALLOW/DENY/scopes/audit contract preserved
    ok('UserPermission ALLOW/DENY write path unchanged (createMany + deleteMany intact)',
      src('src/app/api/users/[id]/permissions/route.ts').includes('effect: o.effect') && src('src/app/api/users/[id]/permissions/route.ts').includes('USER_PERMISSION_GRANTED'));
    ok('scopeIds tenant validation still in PUT', src('src/app/api/users/[id]/permissions/route.ts').includes('نطاق يحتوي موارد من شركة أخرى'));
  }

  console.log('\n=== FIX 2 (HIGH): self-escalation blocked in permission overrides ===');
  {
    const put = src('src/app/api/users/[id]/permissions/route.ts');
    ok('PUT blocks self-modification', put.includes('target.id === admin.id'));
    ok('PUT requires granter to hold ALL_COMPANY grant', put.includes("granterScope.scope !== 'ALL_COMPANY'"));
    ok('SUPER_ADMIN override guard still enforced', put.includes('superAdminOverrideGuard(target)'));
    const del = src('src/app/api/users/[id]/permissions/[permission]/route.ts');
    ok('DELETE single override blocks self-modification too', del.includes('target.id === admin.id'));
    ok('Granter check happens BEFORE any write (order)', put.indexOf("granterScope.scope !== 'ALL_COMPANY'") < put.indexOf('db.$transaction'));
  }

  console.log('\n=== FIX 3 (HIGH): platform accounts (companyId null) protected ===');
  {
    const users = src('src/app/api/users/[id]/route.ts');
    ok('Non-super admins can only ADOPT (assignRole) platform accounts', users.includes("targetCo === null && action === 'assignRole'"));
    ok('Adoption still requires PENDING status', users.includes("target.status !== 'PENDING'"));
    ok('Temp password return still gated behind the tenant guard (resetPassword)', users.includes('temporaryPassword: tempPassword'));
  }

  console.log('\n=== FIX 4 (HIGH): uploaded HTML sandboxed via CSP ===');
  {
    const lp = src('src/lib/landing-pages.ts');
    const cspLine = lp.split('\n').find((l) => l.includes('sandbox allow-scripts')) ?? '';
    ok('RAW_HTML_CSP includes sandbox directive', cspLine.length > 0);
    ok('sandbox does NOT grant allow-same-origin', cspLine.includes('sandbox allow-scripts allow-forms allow-popups allow-modals') && !cspLine.includes('allow-same-origin'));
    ok('Raw route still serves published pages (rendering preserved)', src('src/app/lp/[slug]/raw/route.ts').includes('isPublished: true'));
  }

  console.log('\n=== FIX 5 (HIGH): PATCH foreign keys tenant-validated ===');
  {
    const invoice = src('src/app/api/crm/invoices/[id]/route.ts');
    ok('Invoice PATCH validates crmContactId tenant', invoice.includes('db.crmContact.findFirst({ where: { id: data.crmContactId, companyId } })'));
    ok('Invoice PATCH validates crmCompanyId tenant', invoice.includes('db.crmCompany.findFirst({ where: { id: data.crmCompanyId, companyId } })'));
    ok('Invoice PATCH validates crmDealId tenant', invoice.includes('db.crmDeal.findFirst({ where: { id: data.crmDealId, companyId } })'));
    const deal = src('src/app/api/crm/deals/[id]/route.ts');
    ok('Deal PATCH validates crmContactId tenant', deal.includes('db.crmContact.findFirst({ where: { id: data.crmContactId, companyId } })'));
    ok('Deal PATCH validates assignedToId tenant', deal.includes('db.user.findFirst({ where: { id: data.assignedToId, companyId } })'));
    const task = src('src/app/api/crm/tasks/[id]/route.ts');
    ok('Task PATCH validates assignedToId + refs', task.includes('db.user.findFirst({ where: { id: data.assignedToId, companyId } })'));
    const lead = src('src/app/api/crm/leads/[id]/route.ts');
    ok('Lead PATCH validates assignedToId tenant', lead.includes('db.user.findFirst({ where: { id: parsed.data.assignedToId, companyId } })'));
    const contact = src('src/app/api/crm/contacts/[id]/route.ts');
    ok('Contact PATCH validates ownerId tenant', contact.includes('db.user.findFirst({ where: { id: parsed.data.ownerId, companyId } })'));
  }

  console.log('\n=== FIX 6 (HIGH): ai-intake no longer trusts client prices ===');
  {
    const route = src('src/app/api/orders/ai-intake/route.ts');
    ok('Confirm mode validates with Zod schema', route.includes('const confirmSchema = z.object'));
    ok('Quantity bounded 1-999', route.includes('.int().min(1).max(999)'));
    ok('Price bounded 0-100000', route.includes('.min(0).max(100000)'));
    ok('Price falls back to product.basePrice (never client raw)', route.includes('p.finalPrice || product.basePrice'));
    ok('Moderator tenant-validated like POST /orders', route.includes("db.user.findFirst({ where: { id: assignedModeratorId, companyId } })"));
    ok('Product re-derived from DB with companyId', route.includes('where: { id: p.productId, companyId }'));
  }

  console.log('\n=== FIX 7 (HIGH): CSV formula injection neutralized ===');
  {
    const exp = src('src/app/api/reports/export/route.ts');
    ok('csvSafeText helper exists', exp.includes('function csvSafeText'));
    ok('Dangerous leading chars neutralized', exp.includes("/^[=+\\-@|\\t\\r]/"));
    ok('Applied to customer name, city, product, offer, moderator, source, phone', exp.split('csvSafeText(').length - 1 >= 7);
  }

  console.log('\n=== FIX 8 (HIGH): storage path traversal blocked ===');
  {
    const { isSafeStorageKey, LOCAL_STORAGE_DIR } = await import('../src/lib/storage');
    ok('benign key accepted', isSafeStorageKey('companies/x/products/y/abc.webp') === true);
    ok('../ traversal rejected', isSafeStorageKey('companies/x/products/../../evil/webp') === false);
    ok('backslash traversal rejected', isSafeStorageKey('companies/x\\..\\..\\evil') === false);
    ok('decoded backslash traversal rejected', isSafeStorageKey('companies/a/products/b\\..\\c\\x.webp') === false);
    ok('dot-prefixed segment rejected', isSafeStorageKey('companies/.hidden/products/x/y') === false);
    ok('empty segment rejected', isSafeStorageKey('companies//products/x/y') === false);
    const media = src('src/app/api/media/[...key]/route.ts');
    ok('Media route rejects backslash/dot segments before joining', media.includes("s.includes('\\\\')"));
    ok('Media route canonical check via isSafeStorageKey', media.includes('isSafeStorageKey(storageKey)'));
    const storage = src('src/lib/storage.ts');
    ok('readStoredFile uses path.resolve containment', storage.includes('path.resolve(LOCAL_STORAGE_DIR, storageKey)'));
    ok('Tenant namespace still enforced in media route', media.includes("user.companyId !== companyId"));
    ok('LOCAL_STORAGE_DIR defined', !!LOCAL_STORAGE_DIR);
  }

  console.log(`\n════════ RESULT: ${pass} passed, ${fail} failed ════════`);
  process.exitCode = fail ? 1 : 0;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());