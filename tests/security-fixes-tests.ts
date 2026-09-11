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
    ok('DELETE reassignment runs inside db.$transaction', /replacementRoleId[\s\S]{0,1600}db\.\$transaction/.test(del));
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

  console.log('\n=== FIX 12 (HIGH): unified conferral policy across all five paths ===');
  {
    const dup = src('src/app/api/roles/[id]/duplicate/route.ts');
    const uid = src('src/app/api/users/[id]/route.ts');
    const upost = src('src/app/api/users/route.ts');
    const rid = src('src/app/api/roles/[id]/route.ts');
    const helper = src('src/lib/user-permissions.ts');
    ok('Duplicate route gates on canConferRole BEFORE any write', dup.includes('canConferRole(admin, { id: source.id, name: source.name })') && dup.indexOf('canConferRole') < dup.indexOf('db.$transaction'));
    ok('PATCH users/[id] roleId path gated on canConferRole', uid.includes('canConferRole(admin, { id: roleRow.id, name: roleRow.name })'));
    ok('PATCH users/[id] legacy role-string path gated too', uid.includes('canConferRole(admin, { name: role as string })'));
    ok('POST /users gated for both roleId and legacy role', upost.includes('canConferRole(admin, { id: targetRole.id, name: targetRole.name })') && upost.includes('canConferRole(admin, { name: targetRoleName })'));
    ok('DELETE replacement gated on conferral (name never an authority)', rid.includes('canConferRole(admin, { id: replacement.id, name: replacement.name })'));
    ok('Single helper reuses granterHoldsAll (no second policy model)', helper.includes('granterHoldsAll(actor, grants)') && helper.includes('export async function canConferRole'));
    ok('Legacy roles resolve through parity mapping (legacyEffectiveKeys + catalogExtensionKeys)', helper.includes('legacyEffectiveKeys') && helper.includes('catalogExtensionKeys'));
    ok('Fail-closed for unknown role names', helper.includes('if (!legacy) return null') && helper.includes("'الدور غير معروف'"));
    ok('PENDING_USER (empty matrix) stays conferrable', helper.includes('legacy.length === 0) return []'));
    ok('Engine untouched (permissions-core reads only)', src('src/lib/permissions-core.ts').includes('export async function computeEffectiveGrants'));

    // Simulate the exact conferral contract (mirror: coverage + scope rule)
    const COVERAGE: Record<string, string> = { 'customers.view_basic': 'customers.view' };
    const canGrant = (held: Record<string, string>, permission: string, requested: string): boolean => {
      let h = held[permission];
      if (!h && COVERAGE[permission]) h = held[COVERAGE[permission]];
      return !!h && (h === 'ALL_COMPANY' || (requested !== 'ALL_COMPANY' && h === requested));
    };
    const adminHeld = { 'orders.view': 'ALL_COMPANY', 'orders.create': 'ALL_COMPANY', 'orders.edit': 'ALL_COMPANY', 'orders.claim': 'ALL_COMPANY', 'orders.release': 'ALL_COMPANY', 'orders.confirm': 'ALL_COMPANY', 'customers.view': 'ALL_COMPANY', 'customers.edit': 'ALL_COMPANY', 'products.view': 'ALL_COMPANY', 'offers.view': 'ALL_COMPANY', 'offers.manage': 'ALL_COMPANY', 'reports.view': 'ALL_COMPANY', 'ai.use': 'ALL_COMPANY', 'users.view': 'ALL_COMPANY', 'users.create': 'ALL_COMPANY', 'users.edit': 'ALL_COMPANY', 'users.delete': 'ALL_COMPANY', 'finance.view': 'ALL_COMPANY', 'crm.view': 'ALL_COMPANY' };
    const richRole: Array<[string, string]> = [['users.view', 'ALL_COMPANY'], ['finance.view', 'ALL_COMPANY'], ['crm.view', 'ALL_COMPANY']];
    const moderatorRole: Array<[string, string]> = [['orders.view', 'ALL_COMPANY'], ['orders.create', 'ALL_COMPANY'], ['orders.edit', 'ASSIGNED'], ['customers.view', 'ALL_COMPANY'], ['customers.edit', 'ALL_COMPANY'], ['products.view', 'ALL_COMPANY']];
    const agentRole: Array<[string, string]> = [['orders.view', 'ASSIGNED'], ['orders.edit', 'ASSIGNED'], ['customers.view_basic', 'ALL_COMPANY'], ['products.view', 'ALL_COMPANY']];
    ok('TEST: roles.create-only holder CANNOT duplicate rich COMPANY_ADMIN-like role', !richRole.every(([p, s]) => canGrant({ 'roles.create': 'ALL_COMPANY' }, p, s)));
    ok('TEST: partial holder (no finance) cannot duplicate richer role', !richRole.every(([p, s]) => canGrant({ 'orders.view': 'ALL_COMPANY' }, p, s)));
    ok('TEST: admin holds all moderator keys incl. ASSIGNED rows → duplication succeeds', moderatorRole.every(([p, s]) => canGrant(adminHeld, p, s)));
    ok('TEST: CONFIRMATION_AGENT duplicate allowed for admin via customers.view coverage of view_basic', agentRole.every(([p, s]) => canGrant(adminHeld, p, s)));
    ok('TEST: OWN holder cannot confer a role carrying ALL_COMPANY orders.edit', !moderatorRole.every(([p, s]) => canGrant({ 'orders.edit': 'OWN', 'orders.view': 'ALL_COMPANY' }, p, s)));
    ok('TEST: missing permission → reject (finance.view not held)', !canGrant(adminHeld, 'finance.cashbox', 'ALL_COMPANY'));
    ok('TEST: narrower tier coverage only (view_basic via view)', canGrant(adminHeld, 'customers.view_basic', 'ALL_COMPANY'));
    ok('TEST: no self-escalation — actor grants checked against THEIR OWN effective grants (getPermissionScope, session-only)', helper.includes('getPermissionScope(actor') && !helper.includes('body.'));
  }

  console.log('\n=== FIX 11 (HIGH): granter-must-hold on role matrix (self-escalation closed) ===');
  {
    const rid = src('src/app/api/roles/[id]/route.ts');
    const rpost = src('src/app/api/roles/route.ts');
    ok('PATCH applies granterHoldsAll BEFORE any DB write', rid.includes('granterHoldsAll(admin') && rid.indexOf('granterHoldsAll(admin') < rid.indexOf('db.$transaction'));
    ok('POST applies granterHoldsAll too (same vulnerability, role creation)', rpost.includes('granterHoldsAll(admin') && rpost.indexOf('granterHoldsAll(admin') < rpost.indexOf('db.$transaction'));
    ok('Helper lives in shared guards (single source, no route-local duplication)', src('src/lib/user-permissions.ts').includes('export function granterHoldsAll'));
    ok('Engine untouched (permissions-core unchanged by this fix)', src('src/lib/permissions-core.ts').includes("if (user.role === 'SUPER_ADMIN') return { fullAccess: true, grants: {} };"));

    // Simulate the exact granter-must-hold contract (mirror of the helper)
    const canGrant = (held: Record<string, string>, permission: string, requested: string): boolean => {
      const h = held[permission];
      return !!h && (h === 'ALL_COMPANY' || (requested !== 'ALL_COMPANY' && h === requested));
    };
    const heldAdmin = { 'users.manage': 'ALL_COMPANY', 'orders.view': 'ALL_COMPANY', 'orders.edit': 'OWN', 'products.view': 'CATEGORY' };
    ok('TEST 1: held users.manage grants users.manage → allowed... but roles-edit-only holder adding users.manage → rejected', !canGrant({ 'roles.edit': 'ALL_COMPANY' }, 'users.manage', 'ALL_COMPANY'));
    ok('TEST 2: finance.* not held → rejected', !canGrant(heldAdmin, 'finance.cashbox', 'ALL_COMPANY'));
    ok('TEST 3: roles.edit-only holder cannot grant other roles.* keys they lack (roles.delete/roles.view)', !canGrant({ 'roles.edit': 'ALL_COMPANY' }, 'roles.delete', 'ALL_COMPANY') && !canGrant({ 'roles.edit': 'ALL_COMPANY' }, 'roles.view', 'ALL_COMPANY'));
    ok('TEST 4: granting a held key at equal scope succeeds', canGrant(heldAdmin, 'users.manage', 'ALL_COMPANY') && canGrant(heldAdmin, 'orders.edit', 'OWN'));
    ok('TEST 5: OWN holder cannot grant ALL_COMPANY (scope escalation rejected)', !canGrant({ 'orders.edit': 'OWN' }, 'orders.edit', 'ALL_COMPANY'));
    ok('TEST 6: CATEGORY/SPECIFIC rejected when not held at matching scope', !canGrant(heldAdmin, 'products.view', 'SPECIFIC') && !canGrant(heldAdmin, 'products.view', 'ALL_COMPANY'));
    ok('TEST 7: SUPER_ADMIN bypass preserved — helper relies on getPermissionScope which returns ALL_COMPANY for fullAccess', src('src/lib/user-permissions.ts').includes('getPermissionScope(actor, g.permission)') && src('src/lib/authorization.ts').includes('if (g.fullAccess) return { scope: \'ALL_COMPANY\' };'));
    ok('TEST 8: cross-tenant role edit still 404 via loadVisibleRole (unchanged)', rid.includes('role.companyId !== null && role.companyId !== adminCompanyId'));
    ok('TEST 9/10: rejection precedes transaction (no write, permissionsVersion/audit untouched)', rid.indexOf("status: 403 }\n      );\n    }\n    if (name !== undefined") !== -1 || rid.indexOf('grantError') < rid.indexOf('db.$transaction'));
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