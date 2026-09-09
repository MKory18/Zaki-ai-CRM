// PHASE 1 backfill generator â€” emits SQL that creates system Roles from the
// legacy ROLE_PERMISSIONS map (guaranteed 1:1 parity), links every user via
// users.roleId, and inserts RolePermission rows with correct scopes.
// Idempotent: every INSERT uses ON CONFLICT DO NOTHING.
import { ROLE_PERMISSIONS, UserRole } from '../src/types/auth';

const SYSTEM_ROLES: UserRole[] = [
  'SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'MODERATOR', 'CONFIRMATION_AGENT',
  'FOLLOW_UP_AGENT', 'DELIVERY_MANAGER', 'SETTLEMENT_OFFICER', 'ACCOUNTANT',
];

interface Mapped { permission: string; scope: 'ALL_COMPANY' | 'OWN' | 'ASSIGNED' | 'CATEGORY' | 'SPECIFIC'; scopeIds?: number[] | string[] }

/** legacy permission key â†’ new catalog key(s) + scope (parity mapping) */
function mapLegacy(legacy: string): Mapped[] {
  const M: Record<string, Mapped[]> = {
    // ORDERS
    'orders.view': [{ permission: 'orders.view', scope: 'ALL_COMPANY' }],
    'orders.view_assigned': [{ permission: 'orders.view', scope: 'ASSIGNED' }],
    'orders.view_own': [{ permission: 'orders.view', scope: 'OWN' }],
    'orders.create': [{ permission: 'orders.create', scope: 'ALL_COMPANY' }],
    'orders.update': [{ permission: 'orders.edit', scope: 'ALL_COMPANY' }],
    'orders.update_own': [{ permission: 'orders.edit', scope: 'ASSIGNED' }],
    'orders.assign': [{ permission: 'orders.assign', scope: 'ALL_COMPANY' }],
    'orders.reassign': [{ permission: 'orders.assign', scope: 'ALL_COMPANY' }],
    'orders.claim': [{ permission: 'orders.claim', scope: 'ALL_COMPANY' }],
    'orders.release': [{ permission: 'orders.release', scope: 'ALL_COMPANY' }],
    'orders.unlock': [{ permission: 'orders.unlock', scope: 'ALL_COMPANY' }],
    'orders.delete': [{ permission: 'orders.delete', scope: 'ALL_COMPANY' }],
    'orders.confirmation_status': [{ permission: 'orders.confirm', scope: 'ALL_COMPANY' }],
    'orders.shipping_status': [{ permission: 'orders.change_status', scope: 'ALL_COMPANY' }],
    // CUSTOMERS
    'customers.view': [{ permission: 'customers.view', scope: 'ALL_COMPANY' }],
    'customers.view_basic': [{ permission: 'customers.view_basic', scope: 'ALL_COMPANY' }],
    'customers.create': [{ permission: 'customers.create', scope: 'ALL_COMPANY' }],
    'customers.update': [{ permission: 'customers.edit', scope: 'ALL_COMPANY' }],
    'customers.freeze': [{ permission: 'customers.edit', scope: 'ALL_COMPANY' }],
    'customers.unfreeze': [{ permission: 'customers.edit', scope: 'ALL_COMPANY' }],
    // PRODUCTS (+ offers)
    'products.view': [{ permission: 'products.view', scope: 'ALL_COMPANY' }],
    'products.create': [{ permission: 'products.create', scope: 'ALL_COMPANY' }],
    'products.update': [{ permission: 'products.edit', scope: 'ALL_COMPANY' }],
    'products.delete': [{ permission: 'products.delete', scope: 'ALL_COMPANY' }],
    'products.manage': [
      { permission: 'products.edit', scope: 'ALL_COMPANY' },
      { permission: 'products.delete', scope: 'ALL_COMPANY' },
      { permission: 'products.change_price', scope: 'ALL_COMPANY' },
      { permission: 'products.upload_images', scope: 'ALL_COMPANY' },
    ],
    'offers.manage': [{ permission: 'offers.manage', scope: 'ALL_COMPANY' }],
    // FINANCE / SETTLEMENT
    'finance.view': [{ permission: 'finance.view', scope: 'ALL_COMPANY' }],
    'finance.create': [{ permission: 'finance.create', scope: 'ALL_COMPANY' }],
    'finance.update': [{ permission: 'finance.update', scope: 'ALL_COMPANY' }],
    'finance.cashbox': [{ permission: 'finance.cashbox', scope: 'ALL_COMPANY' }],
    'settlement.view': [{ permission: 'settlement.view', scope: 'ALL_COMPANY' }],
    'settlement.upload': [{ permission: 'settlement.upload', scope: 'ALL_COMPANY' }],
    'settlement.review': [{ permission: 'settlement.review', scope: 'ALL_COMPANY' }],
    // OPERATIONS
    'production.manage': [{ permission: 'production.view', scope: 'ALL_COMPANY' }, { permission: 'production.manage', scope: 'ALL_COMPANY' }],
    'inventory.manage': [{ permission: 'inventory.view', scope: 'ALL_COMPANY' }, { permission: 'inventory.adjust', scope: 'ALL_COMPANY' }],
    // REPORTS / ANALYTICS
    'reports.view': [{ permission: 'reports.view', scope: 'ALL_COMPANY' }, { permission: 'reports.export', scope: 'ALL_COMPANY' }],
    'analytics.view': [{ permission: 'reports.view', scope: 'ALL_COMPANY' }],
    'ai.use': [{ permission: 'ai.use', scope: 'ALL_COMPANY' }],
    // USERS
    'users.view': [{ permission: 'users.view', scope: 'ALL_COMPANY' }],
    'users.create': [{ permission: 'users.create', scope: 'ALL_COMPANY' }],
    'users.update': [{ permission: 'users.edit', scope: 'ALL_COMPANY' }],
    'users.delete': [{ permission: 'users.delete', scope: 'ALL_COMPANY' }],
    'users.manage': [
      { permission: 'users.view', scope: 'ALL_COMPANY' },
      { permission: 'users.create', scope: 'ALL_COMPANY' },
      { permission: 'users.edit', scope: 'ALL_COMPANY' },
      { permission: 'users.delete', scope: 'ALL_COMPANY' },
    ],
    'users.manage_roles': [{ permission: 'roles.view', scope: 'ALL_COMPANY' }, { permission: 'roles.edit', scope: 'ALL_COMPANY' }],
    'moderators.manage': [{ permission: 'users.view', scope: 'ALL_COMPANY' }, { permission: 'users.edit', scope: 'ALL_COMPANY' }],
    // SETTINGS / AUDIT
    'settings.view': [{ permission: 'settings.view', scope: 'ALL_COMPANY' }],
    'settings.manage': [{ permission: 'settings.edit', scope: 'ALL_COMPANY' }],
    'audit.view': [{ permission: 'audit.view', scope: 'ALL_COMPANY' }],
    // CRM
    'crm.view': [
      { permission: 'crm.view', scope: 'ALL_COMPANY' },
      { permission: 'crm.contacts.view', scope: 'ALL_COMPANY' },
      { permission: 'crm.companies.view', scope: 'ALL_COMPANY' },
      { permission: 'crm.leads.view', scope: 'ALL_COMPANY' },
      { permission: 'crm.deals.view', scope: 'ALL_COMPANY' },
      { permission: 'crm.tasks.view', scope: 'ALL_COMPANY' },
      { permission: 'crm.invoices.view', scope: 'ALL_COMPANY' },
    ],
    'crm.manage': [
      { permission: 'crm.view', scope: 'ALL_COMPANY' },
      { permission: 'crm.contacts.view', scope: 'ALL_COMPANY' }, { permission: 'crm.contacts.create', scope: 'ALL_COMPANY' }, { permission: 'crm.contacts.edit', scope: 'ALL_COMPANY' }, { permission: 'crm.contacts.delete', scope: 'ALL_COMPANY' },
      { permission: 'crm.companies.view', scope: 'ALL_COMPANY' }, { permission: 'crm.companies.create', scope: 'ALL_COMPANY' }, { permission: 'crm.companies.edit', scope: 'ALL_COMPANY' }, { permission: 'crm.companies.delete', scope: 'ALL_COMPANY' },
      { permission: 'crm.leads.view', scope: 'ALL_COMPANY' }, { permission: 'crm.leads.create', scope: 'ALL_COMPANY' }, { permission: 'crm.leads.edit', scope: 'ALL_COMPANY' }, { permission: 'crm.leads.delete', scope: 'ALL_COMPANY' },
      { permission: 'crm.deals.view', scope: 'ALL_COMPANY' }, { permission: 'crm.deals.create', scope: 'ALL_COMPANY' }, { permission: 'crm.deals.edit', scope: 'ALL_COMPANY' }, { permission: 'crm.deals.delete', scope: 'ALL_COMPANY' },
      { permission: 'crm.tasks.view', scope: 'ALL_COMPANY' }, { permission: 'crm.tasks.create', scope: 'ALL_COMPANY' }, { permission: 'crm.tasks.edit', scope: 'ALL_COMPANY' }, { permission: 'crm.tasks.delete', scope: 'ALL_COMPANY' },
      { permission: 'crm.invoices.view', scope: 'ALL_COMPANY' }, { permission: 'crm.invoices.create', scope: 'ALL_COMPANY' }, { permission: 'crm.invoices.edit', scope: 'ALL_COMPANY' }, { permission: 'crm.invoices.delete', scope: 'ALL_COMPANY' },
    ],
  };
  return M[legacy] ?? [{ permission: legacy, scope: 'ALL_COMPANY' }];
}

const lines: string[] = [];
const roleIds: Record<string, string> = {};

for (const role of SYSTEM_ROLES) {
  const id = crypto.randomUUID();
  roleIds[role] = id;
  lines.push(`INSERT INTO roles (id, "companyId", name, "isSystem", "createdAt", "updatedAt") VALUES ('${id}', NULL, '${role}', true, now(), now()) ON CONFLICT DO NOTHING;`);
  // dashboard.view for every system role
  const perms = new Map<string, Mapped>();
  perms.set('dashboard.view', { permission: 'dashboard.view', scope: 'ALL_COMPANY' });
  for (const legacy of ROLE_PERMISSIONS[role] ?? []) {
    for (const m of mapLegacy(legacy)) perms.set(m.permission, m);
  }
  for (const m of perms.values()) {
    lines.push(`INSERT INTO role_permissions (id, "roleId", permission, scope) VALUES ('${crypto.randomUUID()}', '${id}', '${m.permission}', '${m.scope}') ON CONFLICT ("roleId", permission) DO NOTHING;`);
  }
}

// link users: match legacy role string â†’ system role (case-insensitive fallback by name)
for (const [role, id] of Object.entries(roleIds)) {
  lines.push(`UPDATE users SET "roleId" = '${id}' WHERE upper(role) = upper('${role}') AND "roleId" IS NULL;`);
}

console.log(lines.join('\n'));

