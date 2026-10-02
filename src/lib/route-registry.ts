import type { SessionUser } from '@/types/auth';

/**
 * WHY THIS FILE IMPORTS NOTHING THAT RUNS ON THE SERVER.
 *
 * It is the one list of screens, and both sides read it: the sidebar and
 * the page titles in the browser, the guard and the notifications on the
 * server. It used to import `can` from authorization.ts, which imports
 * auth.ts, which imports `next/headers` — so the moment a client component
 * read a route's LABEL it dragged the session machinery into the bundle,
 * and the build refused.
 *
 * So the permission CHECK arrives as an argument. The data stays readable
 * from anywhere, which is the whole point of having one list.
 */

/** Does this user hold this permission? Supplied by the caller. */
export type PermissionCheck = (user: SessionUser, permission: string) => boolean;

/**
 * ROUTE REGISTRY — the navigation contract (references/architecture.md).
 *
 * Single source for the sidebar, the server-side page guard and the route
 * tests. A path not listed here does not exist (404). Access is decided by
 * permissions, never by role names: a route opens when the user holds ANY of
 * its permissions (null = every active user). The API behind each screen
 * enforces the same permissions again.
 *
 * There is no "not built yet" marking any more. There was one — a `stage`
 * number whose documentation promised an under-construction page — and
 * nothing ever read it: the guard did not check it, the placeholder
 * component it named was imported by no page, and the one screen still
 * carrying a number (campaigns, seven hundred lines of working screen) wore
 * a "under construction" badge in the sidebar for a year.
 *
 * A registry read as a contract must not contain a clause nobody enforces.
 */

export interface RouteDef {
  path: string;
  label: string;
  /** A NAME, not a component: a route is data. src/components/shell/icons.ts
   *  turns it into a glyph, and decides line or fill. */
  icon: string;
  permissions: string[] | null;
}

export interface NavGroup {
  key: string;
  label: string;
  routes: RouteDef[];
}

const r = (path: string, label: string, icon: string, permissions: string[] | null): RouteDef => ({
  path, label, icon, permissions,
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
      // The discount is money, so this is the supervisor's screen — the
      // agent meets the result of it as an ordinary new order in her queue.
      r('/confirmation/winback', 'استرجاع الملغى', 'Repeat', ['confirmation.supervise']),
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
      r('/control/penalties', 'الخصومات', 'ShieldQuestion', ['penalties.view']),
      r('/control/audit', 'سجل التدقيق', 'ScrollText', ['audit.view']),
      r('/control/blacklist', 'القائمة السوداء', 'Ban', ['control.blacklist']),
    ],
  },
  {
    key: 'growth',
    label: 'النمو',
    routes: [
      r('/growth/performance', 'لوحة الأداء', 'Gauge', ['reports.view', 'analytics.view']),
      r('/growth/campaigns', 'الحملات', 'Megaphone', ['reports.view']),

      /**
       * EVERYTHING THE MODEL TOUCHES, IN ONE PLACE.
       *
       * The assistant sat under «الرئيسية», the intelligence centre here,
       * and the prompts the model is actually given under «الإعدادات» —
       * three menus for one subject, and the one that decides what the
       * assistant SAYS was the hardest to find. Somebody who wants the AI
       * to answer differently should not have to know that its words live
       * in settings while its answers live in growth.
       */
      r('/assistant', 'المساعد الذكي', 'Bot', ['ai.use']),
      r('/growth/intelligence', 'مركز الذكاء', 'Lightbulb', ['growth.intelligence']),
      r('/settings/ai', 'الذكاء الاصطناعي والنصوص', 'Bot', ['settings.view']),
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
      /**
       * THE SHOP ITSELF, ABOVE THE THINGS THAT DRESS IT.
       *
       * These two sat under «النمو» while the design, the templates, the
       * logo and the icon sat here — and a Single Product store IS one of
       * these landing pages wearing this store's theme. Somebody choosing
       * the page their advert points at had to leave the tab to change how
       * it looks, and the two menus never said they were about one thing.
       *
       * Order is the order the work happens in: which page is the front,
       * which pages exist, then how they look.
       */
      r('/store/single-product', 'متجر Single Product', 'Store', ['geo.manage']),
      r('/store/landing-pages', 'صفحات الهبوط', 'PanelsTopLeft', ['landing_pages.view']),

      r('/store/design', 'التصميم', 'LayoutTemplate', ['storefront.view', 'storefront.manage']),
      r('/store/themes', 'القوالب', 'Palette', ['storefront.view', 'storefront.manage']),
      r('/store/menus', 'القوائم', 'ListTree', ['storefront.view', 'storefront.manage']),
      r('/store/pages', 'الصفحات التعريفية والسياسات', 'FileText', ['storefront.view', 'storefront.manage']),
      r('/store/search', 'البحث والفلاتر', 'Search', ['storefront.view', 'storefront.manage']),
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

      /**
       * ONE SCREEN FOR THE COURIER AND ITS FEES — and one entry for both.
       *
       * They were two: «شركات الشحن» and «أجور التوصيل», each linking to the
       * other because neither is usable alone. A fee row already carries
       * `deliveryProviderId`; in the data a fee has always been «this
       * courier, this region», and only the screens were split.
       *
       * It sits right after «البلدان والمتاجر» because that screen defines
       * the regions this one prices: you cannot set an Aleppo fee before
       * Aleppo exists, and the two now read in that order.
       */
      r('/settings/couriers', 'شركات الشحن وأجورها', 'Truck', ['settings.view']),
      r('/settings/commission', 'العمولات', 'Percent', ['settings.view']),
      r('/settings/channels', 'قنوات الطلبات', 'Radio', ['settings.view']),
      r('/settings/tracking', 'بكسل التتبع والحملات', 'Radar', ['settings.view']),
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
/**
 * The screen's name, as the menu says it.
 *
 * A page title and a menu item that disagree cost a moment every time
 * somebody clicks one and lands on the other, so screens read their own
 * name from the registry. `findRoute` returns `undefined` for a path the
 * registry does not name — which is a bug, and a blank heading hides it.
 * The path is shown instead: wrong, and impossible to miss.
 */
export function routeLabel(path: string): string {
  return findRoute(path)?.label ?? path;
}

export function findRoute(path: string): RouteDef | undefined {
  return ALL_ROUTES.find((route) => route.path === path);
}

/** Whether the user may open this route (server truth; the sidebar reuses it). */
export function canAccessRoute(user: SessionUser, route: RouteDef, can: PermissionCheck): boolean {
  if (user.status !== 'ACTIVE') return false;
  if (route.permissions === null) return true;
  return route.permissions.some((p) => can(user, p));
}

/** The navigation as this user sees it: forbidden routes and empty groups removed. */
export function visibleNav(user: SessionUser, can: PermissionCheck): NavGroup[] {
  return NAV.map((g) => ({ ...g, routes: g.routes.filter((route) => canAccessRoute(user, route, can)) })).filter(
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
export function landingRoute(user: SessionUser, can: PermissionCheck): string {
  const first = visibleNav(user, can)[0]?.routes[0];
  return first?.path ?? '/no-access';
}
