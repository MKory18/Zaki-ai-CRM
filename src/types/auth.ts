// ─── SALESFLOW RBAC — Roles, Permissions & Role Matrix ───
// Extended architecture: preserves legacy roles, adds specialized
// operational roles. All enforcement is server-side (src/lib/rbac.ts).

export type UserRole =
  // Legacy roles (preserved for backward compatibility)
  | 'SUPER_ADMIN'
  | 'COMPANY_ADMIN'
  | 'MANAGER'
  | 'MODERATOR'
  | 'ACCOUNTANT'
  | 'DELIVERY_MANAGER'
  | 'PENDING_USER'
  // Specialized operational roles
  | 'CONFIRMATION_AGENT'
  | 'FOLLOW_UP_AGENT'
  | 'SETTLEMENT_OFFICER';

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

/**
 * Permission catalog — hierarchical: group.entity.action
 * Enforced server-side via src/lib/rbac.ts. Frontend checks are UX only.
 */
export type Permission =
  // Users & roles
  | 'users.view'
  | 'users.create'
  | 'users.update'
  | 'users.delete'
  | 'users.manage_roles'
  // Orders
  | 'orders.view'
  | 'orders.view_assigned'      // visibility limited to orders assigned to self
  | 'orders.view_own'           // visibility limited to orders created by self
  | 'orders.create'
  | 'orders.update'
  | 'orders.update_own'         // may update only orders assigned/claimed by self
  | 'orders.assign'
  | 'orders.reassign'
  | 'orders.claim'
  | 'orders.release'
  | 'orders.unlock'             // SUPER_ADMIN override
  | 'orders.delete'
  // Confirmation workflow statuses
  | 'orders.confirmation_status'
  // Shipping workflow statuses
  | 'orders.shipping_status'
  // Customers
  | 'customers.view'
  | 'customers.view_basic'      // read-only, limited fields (agents)
  | 'customers.create'
  | 'customers.update'
  | 'customers.freeze'
  | 'customers.unfreeze'
  // Products & offers
  | 'products.view'
  | 'products.create'
  | 'products.update'
  | 'products.delete'
  | 'products.manage'      // legacy alias = create+update+delete
  | 'moderators.manage'    // legacy alias = users.manage (moderator mgmt)
  | 'offers.manage'
  // Finance — strictly separated
  | 'finance.view'
  | 'finance.create'
  | 'finance.update'
  | 'finance.cashbox'
  // Settlement — strictly separated from finance
  | 'settlement.view'
  | 'settlement.upload'
  | 'settlement.review'
  // Operations
  | 'production.manage'
  | 'inventory.manage'
  | 'reports.view'
  | 'analytics.view'
  | 'ai.use'
  // Administration
  | 'users.manage'
  | 'moderators.manage'
  // CRM module
  | 'crm.view'
  | 'crm.manage'
  | 'settings.view'
  | 'settings.manage'
  | 'audit.view';

export const ALL_PERMISSIONS: Permission[] = [
  'users.view', 'users.create', 'users.update', 'users.manage_roles', 'users.manage', 'moderators.manage',
  'orders.view', 'orders.view_assigned', 'orders.create', 'orders.update', 'orders.update_own',
  'orders.assign', 'orders.reassign', 'orders.claim', 'orders.release', 'orders.unlock', 'orders.delete',
  'orders.confirmation_status', 'orders.shipping_status',
  'customers.view', 'customers.view_basic', 'customers.create', 'customers.update', 'customers.freeze', 'customers.unfreeze',
  'products.view', 'products.create', 'products.update', 'products.delete', 'products.manage',
  'finance.view', 'finance.create', 'finance.update', 'finance.cashbox',
  'settlement.view', 'settlement.upload', 'settlement.review',
  'inventory.manage', 'production.manage', 'offers.manage',
  'reports.view', 'analytics.view', 'ai.use',
  'crm.view', 'crm.manage',
  'settings.view', 'settings.manage', 'audit.view',
];

// Re-export grouped aliases for readability
export type PermissionGroup =
  | 'USERS' | 'ORDERS' | 'CUSTOMERS' | 'PRODUCTS' | 'FINANCE'
  | 'SETTLEMENT' | 'INVENTORY' | 'PRODUCTION' | 'ANALYTICS' | 'SETTINGS' | 'AUDIT' | 'CRM';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  // ─── Full system administration ───
  SUPER_ADMIN: [
    'users.view', 'users.create', 'users.update', 'users.manage_roles', 'users.manage',
    'orders.view', 'orders.create', 'orders.update', 'orders.assign', 'orders.reassign',
    'orders.claim', 'orders.release', 'orders.unlock', 'orders.delete',
    'orders.confirmation_status', 'orders.shipping_status',
    'customers.view', 'customers.create', 'customers.update', 'customers.freeze', 'customers.unfreeze',
    'products.view', 'products.create', 'products.update', 'products.delete',
    'finance.view', 'finance.create', 'finance.update', 'finance.cashbox',
    'settlement.view', 'settlement.upload', 'settlement.review',
    'inventory.manage', 'production.manage', 'offers.manage',
    'reports.view', 'analytics.view', 'ai.use',
    'crm.view', 'crm.manage',
    'settings.view', 'settings.manage', 'audit.view',
  ],

  // ─── Legacy company admin (full company scope, no platform-level user mgmt) ───
  COMPANY_ADMIN: [
    'users.view', 'users.create', 'users.update', 'users.manage_roles', 'users.manage',
    'orders.view', 'orders.create', 'orders.update', 'orders.assign', 'orders.reassign',
    'orders.claim', 'orders.release', 'orders.unlock',
    'orders.confirmation_status', 'orders.shipping_status',
    'customers.view', 'customers.create', 'customers.update', 'customers.freeze', 'customers.unfreeze',
    'products.view', 'products.create', 'products.update', 'products.delete',
    'finance.view', 'finance.create', 'finance.update', 'finance.cashbox',
    'settlement.view', 'settlement.upload', 'settlement.review',
    'inventory.manage', 'production.manage', 'offers.manage',
    'reports.view', 'analytics.view', 'ai.use',
    'crm.view', 'crm.manage',
    'settings.view', 'settings.manage', 'audit.view',
  ],

  // ─── Legacy manager — broad operational oversight, no finance writes ───
  MANAGER: [
    'users.view',
    'orders.view', 'orders.create', 'orders.update', 'orders.assign', 'orders.reassign',
    'orders.claim', 'orders.release', 'orders.unlock',
    'orders.confirmation_status', 'orders.shipping_status',
    'customers.view', 'customers.create', 'customers.update',
    'products.view', 'products.create', 'products.update',
    'offers.manage', 'inventory.manage', 'production.manage',
    'reports.view', 'analytics.view', 'ai.use',
    'crm.view', 'crm.manage',
    'settings.view',
  ],

  // ─── Order intake only — NO finance, NO settings, NO user roles ───
  MODERATOR: [
    'orders.view', 'orders.create', 'orders.update_own', 'orders.claim', 'orders.release',
    'orders.confirmation_status',
    'customers.view', 'customers.create', 'customers.update',
    'products.view', 'offers.manage',
    'reports.view', 'ai.use',
    'crm.view', 'crm.manage',
  ],

  // ─── Confirmation only on OWN assigned orders — NO finance ───
  CONFIRMATION_AGENT: [
    'orders.view_assigned', 'orders.update_own', 'orders.claim', 'orders.release',
    'orders.confirmation_status',
    'customers.view_basic',
    'products.view',
    'ai.use',
  ],

  // ─── Follow-up on assigned cases — cannot reverse confirmation decisions ───
  FOLLOW_UP_AGENT: [
    'orders.view_assigned', 'orders.update_own', 'orders.claim', 'orders.release',
    'customers.view_basic',
    'products.view',
  ],

  // ─── Shipping/delivery workflow (legacy role kept, now focused) ───
  DELIVERY_MANAGER: [
    'orders.view', 'orders.shipping_status',
    'customers.view', 'customers.update',
    'products.view',
    'inventory.manage',
    'reports.view', 'analytics.view',
  ],

  // ─── Shipping settlements & reconciliation — NO cashbox, NO order status ───
  SETTLEMENT_OFFICER: [
    'settlement.view', 'settlement.upload', 'settlement.review',
    'orders.view',
    'reports.view',
  ],

  // ─── Money only — cannot touch operational order statuses ───
  ACCOUNTANT: [
    'finance.view', 'finance.create', 'finance.update', 'finance.cashbox',
    'orders.view',
    'reports.view', 'analytics.view',
  ],

  PENDING_USER: [],
};

/** Roles an administrator may assign. PENDING_USER included for reversion. */
export const ASSIGNABLE_ROLES: UserRole[] = [
  'PENDING_USER',
  'MODERATOR',
  'CONFIRMATION_AGENT',
  'FOLLOW_UP_AGENT',
  'SETTLEMENT_OFFICER',
  'ACCOUNTANT',
  'DELIVERY_MANAGER',
  'MANAGER',
  'COMPANY_ADMIN',
  'SUPER_ADMIN',
];

export const USER_STATUSES: UserStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED'];

/** Display labels — Arabic & English (RTL/LTR support) */
export const ROLE_LABELS: Record<UserRole, { ar: string; en: string }> = {
  SUPER_ADMIN: { ar: 'مدير النظام', en: 'Super Administrator' },
  COMPANY_ADMIN: { ar: 'مدير الشركة', en: 'Company Admin' },
  MANAGER: { ar: 'مدير', en: 'Manager' },
  MODERATOR: { ar: 'موديريتور', en: 'Moderator' },
  CONFIRMATION_AGENT: { ar: 'موظف التأكيد', en: 'Confirmation Agent' },
  FOLLOW_UP_AGENT: { ar: 'موظف المتابعة', en: 'Follow-Up Agent' },
  SETTLEMENT_OFFICER: { ar: 'مدقق التسويات', en: 'Settlement Officer' },
  ACCOUNTANT: { ar: 'المحاسب', en: 'Accountant' },
  DELIVERY_MANAGER: { ar: 'مدير التوصيل', en: 'Delivery Manager' },
  PENDING_USER: { ar: 'حساب معلق', en: 'Pending User' },
};

export const STATUS_LABELS: Record<UserStatus, { ar: string; en: string }> = {
  PENDING: { ar: 'بانتظار الموافقة', en: 'Pending' },
  ACTIVE: { ar: 'نشط', en: 'Active' },
  SUSPENDED: { ar: 'موقوف', en: 'Suspended' },
  DISABLED: { ar: 'معطّل', en: 'Disabled' },
};

/** Human-readable permission labels for the /permissions matrix page */
export const PERMISSION_LABELS: Record<Permission, { ar: string; en: string; group: string }> = {
  'users.view': { ar: 'عرض المستخدمين', en: 'View users', group: 'USERS' },
  'users.create': { ar: 'إنشاء مستخدمين', en: 'Create users', group: 'USERS' },
  'users.update': { ar: 'تعديل المستخدمين', en: 'Update users', group: 'USERS' },
  'users.manage_roles': { ar: 'إدارة الأدوار', en: 'Manage roles', group: 'USERS' },
  'users.manage': { ar: 'إدارة كاملة للمستخدمين', en: 'Full user management', group: 'USERS' },
  'users.delete': { ar: 'حذف المستخدمين', en: 'Delete users', group: 'USERS' },
  'orders.view': { ar: 'عرض كل الطلبات', en: 'View all orders', group: 'ORDERS' },
  'orders.view_assigned': { ar: 'عرض الطلبات المسندة فقط', en: 'View assigned orders only', group: 'ORDERS' },
  'orders.view_own': { ar: 'عرض طلباتي المنشأة فقط', en: 'View own created orders only', group: 'ORDERS' },
  'orders.create': { ar: 'إنشاء طلبات', en: 'Create orders', group: 'ORDERS' },
  'orders.update': { ar: 'تحديث أي طلب', en: 'Update any order', group: 'ORDERS' },
  'orders.update_own': { ar: 'تحديث طلباتي فقط', en: 'Update own orders only', group: 'ORDERS' },
  'orders.assign': { ar: 'إسناد الطلبات', en: 'Assign orders', group: 'ORDERS' },
  'orders.reassign': { ar: 'إعادة إسناد الطلبات', en: 'Reassign orders', group: 'ORDERS' },
  'orders.claim': { ar: 'استلام الطلبات', en: 'Claim orders', group: 'ORDERS' },
  'orders.release': { ar: 'تحرير الطلبات', en: 'Release orders', group: 'ORDERS' },
  'orders.unlock': { ar: 'تجاوز أقفال التحرير', en: 'Override edit locks', group: 'ORDERS' },
  'orders.delete': { ar: 'حذف الطلبات', en: 'Delete orders', group: 'ORDERS' },
  'orders.confirmation_status': { ar: 'تغيير حالة التأكيد', en: 'Change confirmation status', group: 'ORDERS' },
  'orders.shipping_status': { ar: 'تغيير حالة الشحن', en: 'Change shipping status', group: 'ORDERS' },
  'customers.view': { ar: 'عرض العملاء', en: 'View customers', group: 'CUSTOMERS' },
  'customers.view_basic': { ar: 'عرض بيانات العميل الأساسية', en: 'View basic customer info', group: 'CUSTOMERS' },
  'customers.create': { ar: 'إنشاء عملاء', en: 'Create customers', group: 'CUSTOMERS' },
  'customers.update': { ar: 'تحديث عملاء', en: 'Update customers', group: 'CUSTOMERS' },
  'customers.freeze': { ar: 'تجميد عملاء', en: 'Freeze customers', group: 'CUSTOMERS' },
  'customers.unfreeze': { ar: 'فك تجميد العملاء', en: 'Unfreeze customers', group: 'CUSTOMERS' },
  'products.view': { ar: 'عرض المنتجات', en: 'View products', group: 'PRODUCTS' },
  'products.create': { ar: 'إنشاء منتجات', en: 'Create products', group: 'PRODUCTS' },
  'products.update': { ar: 'تحديث منتجات', en: 'Update products', group: 'PRODUCTS' },
  'products.delete': { ar: 'حذف منتجات', en: 'Delete products', group: 'PRODUCTS' },
  'offers.manage': { ar: 'إدارة العروض', en: 'Manage offers', group: 'PRODUCTS' },
  'products.manage': { ar: 'إدارة المنتجات (كاملة)', en: 'Manage products (full)', group: 'PRODUCTS' },
  'moderators.manage': { ar: 'إدارة الموديريتورز', en: 'Manage moderators', group: 'USERS' },
  'finance.view': { ar: 'عرض المالية', en: 'View finance', group: 'FINANCE' },
  'finance.create': { ar: 'إنشاء معاملات مالية', en: 'Create financial transactions', group: 'FINANCE' },
  'finance.update': { ar: 'تعديل السجلات المالية', en: 'Update financial records', group: 'FINANCE' },
  'finance.cashbox': { ar: 'إدارة الصناديق النقدية', en: 'Manage cashboxes', group: 'FINANCE' },
  'settlement.view': { ar: 'عرض التسويات', en: 'View settlements', group: 'SETTLEMENT' },
  'settlement.upload': { ar: 'رفع تقارير الشحن', en: 'Upload shipping reports', group: 'SETTLEMENT' },
  'settlement.review': { ar: 'مراجعة المطابقات', en: 'Review reconciliations', group: 'SETTLEMENT' },
  'inventory.manage': { ar: 'إدارة المخزون', en: 'Manage inventory', group: 'OPERATIONS' },
  'production.manage': { ar: 'إدارة الإنتاج', en: 'Manage production', group: 'OPERATIONS' },
  'reports.view': { ar: 'عرض التقارير', en: 'View reports', group: 'ANALYTICS' },
  'analytics.view': { ar: 'عرض التحليلات', en: 'View analytics', group: 'ANALYTICS' },
  'ai.use': { ar: 'استخدام المساعد الذكي', en: 'Use AI assistant', group: 'ANALYTICS' },
  'settings.view': { ar: 'عرض الإعدادات', en: 'View settings', group: 'SETTINGS' },
  'settings.manage': { ar: 'تعديل إعدادات النظام', en: 'Manage system settings', group: 'SETTINGS' },
  'audit.view': { ar: 'عرض سجل التدقيق', en: 'View audit logs', group: 'SETTINGS' },
  'crm.view': { ar: 'عرض وحدة CRM', en: 'View CRM module', group: 'CRM' },
  'crm.manage': { ar: 'إدارة CRM (إنشاء/تعديل/حذف)', en: 'Manage CRM (create/update/delete)', group: 'CRM' },
};

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string | null;
  companyId: string | null;
  companyName?: string;
  commissionRate?: number;
  permissions: Permission[];
}
