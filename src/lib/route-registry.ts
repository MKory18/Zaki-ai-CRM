import type { SessionUser } from '@/types/auth';
import { can } from './authorization';

/**
 * ROUTE REGISTRY — the navigation contract (references/architecture.md).
 *
 * Single source for the sidebar, the server-side page guard and the route
 * tests. A path not listed here does not exist (404). Access is decided by
 * permissions, never by role names: a route opens when the user holds ANY of
 * its permissions (null = every active user). The API behind each screen
 * enforces the same permissions again.
 *
 * `stage` marks screens not rebuilt yet; they render an "under construction"
 * page until that stage ships. `null` = live.
 */

export interface RouteDef {
  path: string;
  label: string;
  icon: string; // lucide-react icon name
  permissions: string[] | null;
  stage: number | null;
}

export interface NavGroup {
  key: string;
  label: string;
  routes: RouteDef[];
}

const r = (path: string, label: string, icon: string, permissions: string[] | null, stage: number | null = null): RouteDef => ({
  path, label, icon, permissions, stage,
});

export const NAV: NavGroup[] = [
  {
    key: 'main',
    label: 'الرئيسية',
    routes: [
      r('/dashboard', 'لوحة التحكم', 'LayoutDashboard', ['dashboard.view']),
      r('/orders', 'الطلبات', 'ShoppingCart', ['orders.view']),
      r('/customers', 'العملاء', 'Users', ['customers.view', 'customers.view_basic']),
      r('/products', 'المنتجات', 'Package', ['products.view']),
      r('/promotions', 'العروض الترويجية', 'Tag', ['offers.view', 'offers.manage']),
      r('/manufacturing', 'التصنيع والتشغيلات', 'Factory', ['production.view']),
      r('/assistant', 'المساعد الذكي', 'Bot', ['ai.use']),
    ],
  },
  {
    key: 'confirmation',
    label: 'مركز التأكيد',
    routes: [
      // Moderators never hold confirmation.pull / .supervise — pulling is not their job.
      r('/confirmation/queue', 'الطلبات الجديدة', 'Inbox', ['confirmation.pull', 'confirmation.supervise']),
      r('/confirmation/mine', 'طلباتي', 'ClipboardList', ['confirmation.work']),
      r('/confirmation/postponed', 'الطلبات المؤجلة', 'CalendarClock', ['confirmation.work', 'confirmation.supervise']),
      r('/confirmation/issues', 'الإشكالات', 'AlertTriangle', ['confirmation.issues']),
    ],
  },
  {
    key: 'ops',
    label: 'التشغيل',
    routes: [
      r('/ops/preparation', 'التجهيز', 'PackageCheck', ['ops.prepare']),
      r('/ops/shipments/new', 'إنشاء شحنة', 'Truck', ['ops.ship']),
      r('/ops/labels', 'البوالص', 'Printer', ['ops.labels']),
      r('/ops/tracking', 'متابعة الشحن', 'MapPin', ['ops.track']),
      r('/ops/returns', 'المرتجعات', 'Undo2', ['ops.returns']),
    ],
  },
  {
    key: 'inventory',
    label: 'المخزون',
    routes: [
      r('/inventory/receiving', 'استلام البضاعة', 'PackagePlus', ['inventory.adjust']),
      r('/inventory/balances', 'أرصدة المخزون', 'Boxes', ['inventory.view']),
      r('/inventory/movements', 'حركات المخزون', 'ArrowLeftRight', ['inventory.view']),
    ],
  },
  {
    key: 'finance',
    label: 'المال',
    routes: [
      r('/finance/collection', 'التحصيل والكشوف', 'FileSpreadsheet', ['settlement.upload', 'settlement.view']),
      r('/finance/matching', 'المطابقة', 'GitCompare', ['settlement.review']),
      r('/finance/wallets', 'المحافظ والحركات', 'Wallet', ['finance.cashbox']),
      r('/finance/transfers', 'التحويلات', 'Repeat', ['finance.cashbox']),
      r('/finance/closing', 'الإغلاق اليومي', 'Lock', ['finance.cashbox']),
      r('/finance/profit', 'الأرباح', 'TrendingUp', ['finance.view']),
    ],
  },
  {
    key: 'control',
    label: 'الرقابة',
    routes: [
      r('/control/change-requests', 'طلبات التعديل', 'FilePen', ['control.change_requests']),
      r('/control/discount-alerts', 'تنبيهات الخصم', 'BadgePercent', ['control.discount_alerts']),
      r('/control/audit', 'سجل التدقيق', 'ScrollText', ['audit.view']),
      r('/control/blacklist', 'القائمة السوداء', 'Ban', ['control.blacklist']),
    ],
  },
  {
    key: 'growth',
    label: 'النمو',
    routes: [
      r('/growth/performance', 'لوحة الأداء', 'Gauge', ['reports.view', 'analytics.view']),
      r('/growth/campaigns', 'الحملات', 'Megaphone', ['reports.view'], 8),
      r('/growth/intelligence', 'مركز الذكاء', 'Lightbulb', ['growth.intelligence']),
      r('/growth/single-product-stores', 'المتاجر المفردة', 'Store', ['geo.manage'], 10),
      r('/growth/landing-pages', 'صفحات الهبوط', 'PanelsTopLeft', ['landing_pages.view']),
      r('/growth/whatsapp/inbox', 'صندوق الواتساب', 'MessageCircle', ['whatsapp.view']),
      r('/growth/telegram/orders', 'طلبات تلجرام', 'Send', ['telegram.view']),
    ],
  },
  {
    key: 'apps',
    label: 'التطبيقات',
    routes: [
      r('/apps/store', 'متجر التطبيقات', 'LayoutGrid', ['apps.view'], 11),
      r('/apps/installed', 'التطبيقات المثبتة', 'Blocks', ['apps.view'], 11),
    ],
  },
  {
    key: 'settings',
    label: 'الإعدادات',
    routes: [
      r('/settings/geo', 'البلدان والمتاجر والمحافظ', 'Globe', ['geo.view']),
      r('/settings/delivery-fees', 'أجور التوصيل', 'Receipt', ['settings.view']),
      r('/settings/commission', 'العمولات', 'Percent', ['settings.view']),
      r('/settings/couriers', 'شركات الشحن', 'Truck', ['settings.view']),
      r('/settings/pixels', 'البكسلات والتتبع', 'Radar', ['settings.view']),
      r('/settings/whatsapp', 'إعدادات واتساب', 'MessageCircle', ['whatsapp.manage']),
      r('/settings/telegram', 'إعدادات تلجرام', 'Send', ['telegram.manage']),
      r('/settings/system', 'إعدادات النظام', 'Settings', ['settings.view']),
    ],
  },
  {
    key: 'admin',
    label: 'الإدارة',
    routes: [
      r('/admin/users', 'الموظفين', 'UserCog', ['users.view']),
      r('/admin/permissions', 'الصلاحيات', 'ShieldCheck', ['roles.view']),
      r('/admin/jobs', 'المهام المجدولة', 'Timer', ['settings.view']),
      r('/admin/profile', 'الملف الشخصي', 'CircleUser', null),
    ],
  },
];

export const ALL_ROUTES: RouteDef[] = NAV.flatMap((g) => g.routes);

/** Exact contract route for a path, or undefined (= 404). */
export function findRoute(path: string): RouteDef | undefined {
  return ALL_ROUTES.find((route) => route.path === path);
}

/** Whether the user may open this route (server truth; the sidebar reuses it). */
export function canAccessRoute(user: SessionUser, route: RouteDef): boolean {
  if (user.status !== 'ACTIVE') return false;
  if (route.permissions === null) return true;
  return route.permissions.some((p) => can(user, p));
}

/** The navigation as this user sees it: forbidden routes and empty groups removed. */
export function visibleNav(user: SessionUser): NavGroup[] {
  return NAV.map((g) => ({ ...g, routes: g.routes.filter((route) => canAccessRoute(user, route)) })).filter(
    (g) => g.routes.length > 0
  );
}
