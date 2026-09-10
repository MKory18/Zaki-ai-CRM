// ─── PERMISSION CATALOG for the Roles & Permissions UI ───
// Canonical engine keys only (legacy-only keys such as orders.update are
// excluded; never-granted keys are excluded — see AGENTS phase notes).
// Arabic labels mirror PERMISSION_LABELS from types/auth where available.
// This module is client-safe (no server imports).

export type ScopeValue = 'ALL_COMPANY' | 'OWN' | 'ASSIGNED' | 'CATEGORY' | 'SPECIFIC';

export interface CatalogItem {
  key: string;
  ar: string;
  en: string;
  /** Scopes selectable in the matrix for this key (omit = ALL_COMPANY only). */
  scopes?: ScopeValue[];
}

export interface CatalogModule {
  module: string; // stable module id (English)
  items: CatalogItem[];
}

export const PERMISSION_MODULES: CatalogModule[] = [
  {
    module: 'dashboard',
    items: [{ key: 'dashboard.view', ar: 'عرض لوحة التحكم', en: 'View dashboard' }],
  },
  {
    module: 'orders',
    items: [
      { key: 'orders.view', ar: 'عرض الطلبات', en: 'View orders', scopes: ['ALL_COMPANY', 'OWN', 'ASSIGNED'] },
      { key: 'orders.edit', ar: 'تعديل الطلبات', en: 'Edit orders', scopes: ['ALL_COMPANY', 'OWN', 'ASSIGNED'] },
      { key: 'orders.create', ar: 'إنشاء طلبات', en: 'Create orders' },
      { key: 'orders.delete', ar: 'حذف الطلبات', en: 'Delete orders' },
      { key: 'orders.assign', ar: 'إسناد الطلبات', en: 'Assign orders' },
      { key: 'orders.claim', ar: 'استلام الطلبات', en: 'Claim orders' },
      { key: 'orders.release', ar: 'تحرير الطلبات', en: 'Release orders' },
      { key: 'orders.unlock', ar: 'تجاوز أقفال التحرير', en: 'Override edit locks' },
      { key: 'orders.confirm', ar: 'تغيير حالة التأكيد', en: 'Change confirmation status' },
      { key: 'orders.change_status', ar: 'تغيير حالة الشحن', en: 'Change shipping status' },
    ],
  },
  {
    module: 'customers',
    items: [
      { key: 'customers.view', ar: 'عرض العملاء', en: 'View customers' },
      { key: 'customers.view_basic', ar: 'عرض بيانات العميل الأساسية', en: 'View basic customer info' },
      { key: 'customers.create', ar: 'إنشاء عملاء', en: 'Create customers' },
      { key: 'customers.edit', ar: 'تعديل العملاء', en: 'Edit customers' },
      { key: 'customers.freeze', ar: 'تجميد عملاء', en: 'Freeze customers' },
      { key: 'customers.unfreeze', ar: 'فك تجميد العملاء', en: 'Unfreeze customers' },
    ],
  },
  {
    module: 'products',
    items: [
      { key: 'products.view', ar: 'عرض المنتجات', en: 'View products', scopes: ['ALL_COMPANY', 'CATEGORY', 'SPECIFIC'] },
      { key: 'products.edit', ar: 'تعديل المنتجات', en: 'Edit products', scopes: ['ALL_COMPANY', 'CATEGORY', 'SPECIFIC'] },
      { key: 'products.create', ar: 'إنشاء منتجات', en: 'Create products' },
      { key: 'products.delete', ar: 'حذف منتجات', en: 'Delete products' },
      { key: 'products.change_price', ar: 'تغيير أسعار المنتجات', en: 'Change product prices' },
      { key: 'products.upload_images', ar: 'رفع صور المنتجات', en: 'Upload product images' },
    ],
  },
  {
    module: 'categories',
    items: [
      { key: 'categories.view', ar: 'عرض الفئات', en: 'View categories' },
      { key: 'categories.create', ar: 'إنشاء فئات', en: 'Create categories' },
      { key: 'categories.edit', ar: 'تعديل الفئات', en: 'Edit categories' },
      { key: 'categories.delete', ar: 'حذف الفئات', en: 'Delete categories' },
    ],
  },
  {
    module: 'offers',
    items: [
      { key: 'offers.view', ar: 'عرض العروض', en: 'View offers' },
      { key: 'offers.manage', ar: 'إدارة العروض', en: 'Manage offers' },
    ],
  },
  {
    module: 'crm',
    items: [
      { key: 'crm.view', ar: 'عرض وحدة CRM', en: 'View CRM module' },
      { key: 'crm.manage', ar: 'إدارة CRM (إنشاء/تعديل/حذف)', en: 'Manage CRM (create/update/delete)' },
      { key: 'crm.contacts.view', ar: 'عرض جهات الاتصال', en: 'View CRM contacts' },
      { key: 'crm.contacts.create', ar: 'إنشاء جهات اتصال', en: 'Create CRM contacts' },
      { key: 'crm.contacts.edit', ar: 'تعديل جهات الاتصال', en: 'Edit CRM contacts' },
      { key: 'crm.contacts.delete', ar: 'حذف جهات الاتصال', en: 'Delete CRM contacts' },
      { key: 'crm.companies.view', ar: 'عرض الشركات', en: 'View CRM companies' },
      { key: 'crm.companies.create', ar: 'إنشاء شركات', en: 'Create CRM companies' },
      { key: 'crm.companies.edit', ar: 'تعديل الشركات', en: 'Edit CRM companies' },
      { key: 'crm.companies.delete', ar: 'حذف الشركات', en: 'Delete CRM companies' },
      { key: 'crm.leads.view', ar: 'عرض العملاء المحتملين', en: 'View CRM leads' },
      { key: 'crm.leads.create', ar: 'إنشاء عملاء محتملين', en: 'Create CRM leads' },
      { key: 'crm.leads.edit', ar: 'تعديل العملاء المحتملين', en: 'Edit CRM leads' },
      { key: 'crm.leads.delete', ar: 'حذف العملاء المحتملين', en: 'Delete CRM leads' },
      { key: 'crm.deals.view', ar: 'عرض الصفقات', en: 'View CRM deals' },
      { key: 'crm.deals.create', ar: 'إنشاء صفقات', en: 'Create CRM deals' },
      { key: 'crm.deals.edit', ar: 'تعديل الصفقات', en: 'Edit CRM deals' },
      { key: 'crm.deals.delete', ar: 'حذف الصفقات', en: 'Delete CRM deals' },
      { key: 'crm.tasks.view', ar: 'عرض مهام CRM', en: 'View CRM tasks' },
      { key: 'crm.tasks.create', ar: 'إنشاء مهام CRM', en: 'Create CRM tasks' },
      { key: 'crm.tasks.edit', ar: 'تعديل مهام CRM', en: 'Edit CRM tasks' },
      { key: 'crm.tasks.delete', ar: 'حذف مهام CRM', en: 'Delete CRM tasks' },
      { key: 'crm.invoices.view', ar: 'عرض فواتير CRM', en: 'View CRM invoices' },
      { key: 'crm.invoices.create', ar: 'إنشاء فواتير CRM', en: 'Create CRM invoices' },
      { key: 'crm.invoices.edit', ar: 'تعديل فواتير CRM', en: 'Edit CRM invoices' },
      { key: 'crm.invoices.delete', ar: 'حذف فواتير CRM', en: 'Delete CRM invoices' },
      { key: 'crm.notes.view', ar: 'عرض ملاحظات CRM', en: 'View CRM notes' },
      { key: 'crm.notes.create', ar: 'إنشاء ملاحظات CRM', en: 'Create CRM notes' },
      { key: 'crm.notes.edit', ar: 'تعديل ملاحظات CRM', en: 'Edit CRM notes' },
      { key: 'crm.notes.delete', ar: 'حذف ملاحظات CRM', en: 'Delete CRM notes' },
      { key: 'crm.activities.view', ar: 'عرض أنشطة CRM', en: 'View CRM activities' },
      { key: 'crm.activities.create', ar: 'إنشاء أنشطة CRM', en: 'Create CRM activities' },
      { key: 'crm.activities.delete', ar: 'حذف أنشطة CRM', en: 'Delete CRM activities' },
    ],
  },
  {
    module: 'inventory',
    items: [
      { key: 'inventory.view', ar: 'عرض المخزون', en: 'View inventory' },
      { key: 'inventory.adjust', ar: 'تعديل المخزون', en: 'Adjust inventory' },
    ],
  },
  {
    module: 'production',
    items: [
      { key: 'production.view', ar: 'عرض الإنتاج', en: 'View production' },
      { key: 'production.manage', ar: 'إدارة الإنتاج', en: 'Manage production' },
    ],
  },
  {
    module: 'finance',
    items: [
      { key: 'finance.view', ar: 'عرض المالية', en: 'View finance' },
      { key: 'finance.create', ar: 'إنشاء معاملات مالية', en: 'Create financial transactions' },
      { key: 'finance.update', ar: 'تعديل السجلات المالية', en: 'Update financial records' },
      { key: 'finance.cashbox', ar: 'إدارة الصناديق النقدية', en: 'Manage cashboxes' },
    ],
  },
  {
    module: 'settlement',
    items: [
      { key: 'settlement.view', ar: 'عرض التسويات', en: 'View settlements' },
      { key: 'settlement.upload', ar: 'رفع تقارير الشحن', en: 'Upload shipping reports' },
      { key: 'settlement.review', ar: 'مراجعة المطابقات', en: 'Review reconciliations' },
    ],
  },
  {
    module: 'reports',
    items: [
      { key: 'reports.view', ar: 'عرض التقارير', en: 'View reports' },
      { key: 'reports.export', ar: 'تصدير التقارير', en: 'Export reports' },
      { key: 'analytics.view', ar: 'عرض التحليلات', en: 'View analytics' },
      { key: 'ai.use', ar: 'استخدام المساعد الذكي', en: 'Use AI assistant' },
    ],
  },
  {
    module: 'users',
    items: [
      { key: 'users.view', ar: 'عرض المستخدمين', en: 'View users' },
      { key: 'users.create', ar: 'إنشاء مستخدمين', en: 'Create users' },
      { key: 'users.edit', ar: 'تعديل المستخدمين', en: 'Edit users' },
      { key: 'users.delete', ar: 'حذف المستخدمين', en: 'Delete users' },
      { key: 'users.manage', ar: 'إدارة كاملة للمستخدمين', en: 'Full user management' },
      { key: 'users.manage_roles', ar: 'إدارة الأدوار', en: 'Manage roles' },
      { key: 'moderators.manage', ar: 'إدارة الموديريتورز', en: 'Manage moderators' },
    ],
  },
  {
    module: 'roles',
    items: [
      { key: 'roles.view', ar: 'عرض الأدوار والصلاحيات', en: 'View roles & permissions' },
      { key: 'roles.create', ar: 'إنشاء أدوار', en: 'Create roles' },
      { key: 'roles.edit', ar: 'تعديل الأدوار والصلاحيات', en: 'Edit roles & permissions' },
      { key: 'roles.delete', ar: 'حذف أدوار', en: 'Delete roles' },
    ],
  },
  {
    module: 'settings',
    items: [
      { key: 'settings.view', ar: 'عرض الإعدادات', en: 'View settings' },
      { key: 'settings.edit', ar: 'تعديل إعدادات النظام', en: 'Edit system settings' },
    ],
  },
  {
    module: 'landing_pages',
    items: [
      { key: 'landing_pages.view', ar: 'عرض صفحات الهبوط', en: 'View landing pages' },
      { key: 'landing_pages.create', ar: 'إنشاء صفحات هبوط', en: 'Create landing pages' },
      { key: 'landing_pages.edit', ar: 'تعديل صفحات الهبوط', en: 'Edit landing pages' },
      { key: 'landing_pages.delete', ar: 'حذف صفحات هبوط', en: 'Delete landing pages' },
      { key: 'landing_pages.publish', ar: 'نشر / إلغاء نشر صفحات الهبوط', en: 'Publish / unpublish landing pages' },
      { key: 'landing_pages.analytics', ar: 'عرض تحليلات صفحات الهبوط', en: 'View landing page analytics' },
    ],
  },
  {
    module: 'audit',
    items: [{ key: 'audit.view', ar: 'عرض سجل التدقيق', en: 'View audit logs' }],
  },
];

/** Flat set of all canonical keys accepted by the roles API. */
export const ALL_CATALOG_KEYS: Set<string> = new Set(
  PERMISSION_MODULES.flatMap((m) => m.items.map((i) => i.key))
);

/** Module id for a given key (for grouping/labels in the UI). */
export function moduleOf(key: string): CatalogModule | undefined {
  return PERMISSION_MODULES.find((m) => m.items.some((i) => i.key === key));
}

/** Catalog item for a key. */
export function catalogItem(key: string): CatalogItem | undefined {
  for (const m of PERMISSION_MODULES) {
    const item = m.items.find((i) => i.key === key);
    if (item) return item;
  }
  return undefined;
}

/** Module display labels (ar/en) used in the permission matrix. */
export const MODULE_LABELS: Record<string, { ar: string; en: string }> = {
  dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
  orders: { ar: 'الطلبات', en: 'Orders' },
  customers: { ar: 'العملاء', en: 'Customers' },
  products: { ar: 'المنتجات', en: 'Products' },
  categories: { ar: 'الفئات', en: 'Categories' },
  offers: { ar: 'العروض', en: 'Offers' },
  crm: { ar: 'إدارة علاقات العملاء', en: 'CRM' },
  inventory: { ar: 'المخزون', en: 'Inventory' },
  production: { ar: 'الإنتاج', en: 'Production' },
  finance: { ar: 'المالية', en: 'Finance' },
  settlement: { ar: 'التسويات', en: 'Settlements' },
  reports: { ar: 'التقارير والتحليلات', en: 'Reports & Analytics' },
  users: { ar: 'المستخدمون', en: 'Users' },
  roles: { ar: 'الأدوار والصلاحيات', en: 'Roles & Permissions' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  audit: { ar: 'سجل التدقيق', en: 'Audit Logs' },
  landing_pages: { ar: 'صفحات الهبوط', en: 'Landing Pages' },
};

/** Scope display labels (ar/en). */
export const SCOPE_LABELS: Record<ScopeValue, { ar: string; en: string }> = {
  ALL_COMPANY: { ar: 'كل الشركة', en: 'Whole company' },
  OWN: { ar: 'طلباتي المنشأة', en: 'Own created' },
  ASSIGNED: { ar: 'المسندة إليه', en: 'Assigned to self' },
  CATEGORY: { ar: 'فئات محددة', en: 'Specific categories' },
  SPECIFIC: { ar: 'منتجات محددة', en: 'Specific products' },
};
