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
      r('/ops/batches', 'دفعات الشحن', 'Boxes', ['ops.ship', 'ops.track']),
      r('/ops/tracking', 'متابعة الشحن', 'MapPin', ['ops.track']),
      r('/ops/returns', 'المرتجعات', 'Undo2', ['ops.returns']),
    ],
  },
  {
    key: 'inventory',
    label: 'المخزون',
    // Stock has one home: what you have, the two doors it comes in through,
    // and the history. Production used to sit beside "Products" as if it were
    // a different subject; it is the door for the goods you make.
    routes: [
      r('/inventory/balances', 'أرصدة المخزون', 'Boxes', ['inventory.view']),
      r('/manufacturing', 'تشغيلات الإنتاج', 'Factory', ['production.view']),
      r('/inventory/receiving', 'استلام بضاعة جاهزة', 'PackagePlus', ['inventory.adjust']),
      r('/inventory/movements', 'حركات المخزون', 'ArrowLeftRight', ['inventory.view']),
    ],
  },
  {
    key: 'finance',
    label: 'المال',
    routes: [
      r('/finance/collection', 'التحصيل والكشوف', 'FileSpreadsheet', ['settlement.upload', 'settlement.view']),
      r('/finance/matching', 'المطابقة', 'GitCompare', ['settlement.review']),
      r('/finance/agents', 'عهدة المندوبين', 'Bike', ['settlement.view', 'settlement.review']),
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
      r('/growth/single-product-stores', 'متجر Single Product', 'Store', ['geo.manage']),
      r('/growth/landing-pages', 'صفحات الهبوط', 'PanelsTopLeft', ['landing_pages.view']),
      r('/growth/whatsapp/inbox', 'صندوق الواتساب', 'MessageCircle', ['whatsapp.view']),
      r('/growth/telegram/orders', 'طلبات تلجرام', 'Send', ['telegram.view']),
    ],
  },
  {
    // The shop's own face. Named «واجهة المتجر» and not «المتجر», because
    // «متجر التطبيقات» sits one group below and two menu entries that both
    // read "store" are two entries nobody can tell apart.
    //
    // The rule that divides this group from /settings: anything about how
    // the shop LOOKS or what it SAYS lives here; anything about how the
    // system RUNS lives there. No field appears in both.
    key: 'storefront',
    label: 'واجهة المتجر',
    routes: [
      r('/store/design', 'التصميم', 'LayoutTemplate', ['storefront.view', 'storefront.manage']),
      r('/store/themes', 'القوالب', 'Palette', ['storefront.view', 'storefront.manage']),
      r('/store/menus', 'القوائم', 'ListTree', ['storefront.view', 'storefront.manage']),
      r('/store/pages', 'الصفحات', 'FileText', ['storefront.view', 'storefront.manage']),
      r('/store/languages', 'اللغات', 'Languages', ['storefront.view', 'storefront.manage']),
      r('/store/routes', 'المسارات', 'Signpost', ['storefront.view', 'storefront.manage']),
      r('/store/domain', 'الدومين', 'Globe', ['storefront.view', 'storefront.domain']),
    ],
  },
  {
    key: 'apps',
    label: 'التطبيقات',
    routes: [
      r('/apps/store', 'متجر التطبيقات', 'LayoutGrid', ['apps.view']),
      r('/apps/installed', 'التطبيقات المثبتة', 'Blocks', ['apps.view']),
    ],
  },
  {
    key: 'settings',
    label: 'الإعدادات',
    routes: [
      r('/settings/geo', 'البلدان والمتاجر', 'Globe', ['geo.view']),
      r('/settings/delivery-fees', 'أجور التوصيل', 'Receipt', ['settings.view']),
      r('/settings/commission', 'العمولات', 'Percent', ['settings.view']),
      r('/settings/couriers', 'شركات الشحن', 'Truck', ['settings.view']),
      r('/settings/channels', 'قنوات الطلبات', 'Radio', ['settings.view']),
      r('/settings/tracking', 'بكسل التتبع والحملات', 'Radar', ['settings.view']),
      // Its own entry, not a card at the bottom of system settings: the
      // words the system says to the model are a thing a seller edits,
      // and they cannot edit what they cannot find.
      r('/settings/ai', 'الذكاء الاصطناعي والنصوص', 'Bot', ['settings.view']),
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

/**
 * Where "/" sends this user.
 *
 * The dashboard is the first screen for anyone who may open it, but a
 * narrowly-scoped account (a moderator who only works his own orders) does
 * not hold dashboard.view — sending him there lands him on a 403 the moment
 * he logs in. He goes to the first screen he may actually open instead,
 * which is the first item of his own sidebar.
 */
export function landingRoute(user: SessionUser): string {
  const first = visibleNav(user)[0]?.routes[0];
  return first?.path ?? '/no-access';
}
