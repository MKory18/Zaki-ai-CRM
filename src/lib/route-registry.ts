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
  /**
   * WHERE THIS SCREEN USUALLY FALLS IN A SEQUENCE THE WORK FOLLOWS.
   *
   * Drawn as «3.» before the label, and nothing else. A hint, never a rule:
   * every screen still opens on its own permission, in any order, and a
   * person who may open only the first and the last sees «1.» and «5.» —
   * which is true, those are the first and the last stop.
   *
   * It lives on the ROUTE and not on its position in the group, because a
   * position is not stable: the menu drops what a person may not open,
   * their own arrangement reorders it, and the phone's sheet lifts four
   * screens out into the bar. A number computed from the index would
   * follow all of that around; a number that belongs to the screen does not.
   */
  step?: number;
}

export interface NavGroup {
  key: string;
  label: string;
  routes: RouteDef[];
}

const r = (
  path: string,
  label: string,
  icon: string,
  permissions: string[] | null,
  step?: number
): RouteDef => ({
  path, label, icon, permissions, ...(step ? { step } : {}),
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
    // «الشحن» and not «التشغيل»: «operations» is every group in this menu.
    // What stands here is one parcel's road — picked, shipped, printed,
    // followed, and brought back — and the five stops are numbered so the
    // road can be read off the menu. The owner, 21/10: «كل خطوة بتودّي
    // للي بعدها».
    label: 'الشحن',
    routes: [
      r('/ops/preparation', 'التجهيز', 'PackageCheck', ['ops.prepare'], 1),
      r('/ops/shipments/new', 'إنشاء شحنة', 'Truck', ['ops.ship'], 2),
      r('/ops/batches', 'دفعات الشحن', 'Boxes', ['ops.ship', 'ops.track'], 3),
      r('/ops/tracking', 'متابعة الشحن', 'MapPin', ['ops.track'], 4),
      r('/ops/returns', 'المرتجعات', 'Undo2', ['ops.returns'], 5),
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
    // The first four are ONE errand, in the order it is usually walked: see
    // what each courier is holding, take it in (by statement or by hand),
    // match the statement against the orders, close the day. They sat as
    // «collection, matching, custody» with the closing two entries away,
    // and no screen linked to the next — so the errand was learned by
    // being taught. The wallets, the transfers and the profit are not part
    // of it; they are where the money ends up and what it earned.
    routes: [
      r('/finance/agents', 'عهدة المندوبين', 'Bike', ['settlement.view', 'settlement.review'], 1),
      r('/finance/collection', 'التحصيل والكشوف', 'FileSpreadsheet', ['settlement.upload', 'settlement.view'], 2),
      r('/finance/matching', 'المطابقة', 'GitCompare', ['settlement.review'], 3),
      r('/finance/closing', 'الإغلاق اليومي', 'Lock', ['finance.cashbox'], 4),
      r('/finance/wallets', 'المحافظ والحركات', 'Wallet', ['finance.cashbox']),
      r('/finance/transfers', 'التحويلات', 'Repeat', ['finance.cashbox']),
      r('/finance/profit', 'الأرباح', 'TrendingUp', ['finance.view']),
    ],
  },
  {
    key: 'control',
    label: 'الرقابة',
    routes: [
      r('/control/change-requests', 'طلبات التعديل', 'FilePen', ['control.change_requests']),
      r('/control/discount-alerts', 'تنبيهات الخصم', 'BadgePercent', ['control.discount_alerts']),
      // «خصومات الموظفين», not «الخصومات»: it sat beside «تنبيهات الخصم», and
      // one is money taken off a salary while the other is a price cut
      // given to a customer. Two words from one root, one row apart.
      r('/control/penalties', 'خصومات الموظفين', 'ShieldQuestion', ['penalties.view']),
      r('/control/audit', 'سجل التدقيق', 'ScrollText', ['audit.view']),
      r('/control/blacklist', 'القائمة السوداء', 'Ban', ['control.blacklist']),
    ],
  },
  {
    key: 'growth',
    // «والذكاء» because the assistant, the intelligence centre and the test
    // bench are most of what stands here, and a group named for one of
    // its three subjects made people look for the other two elsewhere.
    label: 'النمو والذكاء',
    routes: [
      r('/growth/performance', 'لوحة الأداء', 'Gauge', ['reports.view', 'analytics.view']),
      r('/growth/campaigns', 'الحملات', 'Megaphone', ['reports.view']),

      /**
       * THE AI'S WORK IS HERE; ITS WIRING IS IN THE SETTINGS.
       *
       * This block used to carry «الذكاء الاصطناعي والنصوص» too, on the
       * argument that somebody who wants the assistant to answer
       * differently should not have to know its words live in settings
       * while its answers live in growth. The argument is sound, and this
       * reverses it anyway — because the contract has a rule that placement
       * was breaking: an OPERATION sits with the work and its CONFIGURATION
       * sits in settings. The WhatsApp inbox is here and its setup is
       * there; the same has to hold for the model. The provider, the key,
       * the address of a server on the owner's own machine and the house
       * prompts are configuration. Asking the assistant a question is work.
       *
       * They are one click apart either way, which was the point of the
       * old argument; and the group is named for what is DONE here.
       */
      r('/assistant', 'المساعد الذكي', 'Bot', ['ai.use']),
      r('/growth/intelligence', 'مركز الذكاء', 'Lightbulb', ['growth.intelligence']),
      /*
       * THE BENCH, BESIDE THE INTELLIGENCE CENTRE AND NOT UNDER PRODUCTS.
       *
       * «منتج تيست» is a growth question — what to try next — and its
       * numbers are deliberately outside every figure the products and
       * inventory screens show. Putting it under «المنتجات» would invite
       * exactly the reading the whole feature refuses: that these products
       * are part of the catalogue's totals.
       *
       * Same permission as the intelligence centre: both answer «what
       * should I do next», and both are read by the person who decides it.
       */
      r('/growth/bench', 'منصّة التجريب', 'FlaskConical', ['growth.intelligence']),
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
       * TWO ENTRIES, WHERE TEN STOOD.
       *
       * `/store` first: every shop on one card each — which are live,
       * which sell anything, and the way into each one. The old
       * single-product address redirects here permanently (next.config.ts)
       * instead of living on as a second entry for the same thing.
       *
       * AND THE EIGHT THAT USED TO FOLLOW IT ARE NOW ITS TABS.
       *
       * «التصميم» «القوالب» «القوائم» «الصفحات التعريفية والسياسات»
       * «البحث والفلاتر» «اللغات» «المسارات» «الدومين» were eight menu
       * entries for one shop, and the owner's word for the result was
       * «معجّق … بتضيع». They are the three tabs of `/store?tab=…` now —
       * الواجهة · المحتوى · العنوان — defined once in
       * `src/lib/store-admin.ts`, and every one of the eight addresses
       * redirects permanently to the tab that holds it.
       *
       * NOT A SCREEN WAS DELETED: the same nine components render, in
       * panels. A menu entry is not a feature, and this group is a menu.
       *
       * TWO AND NOT THREE. §7.1 of docs/storefront/AUDIT.md proposed three
       * and §10 corrected itself in writing: «منصّة التجريب stays under
       * النمو — the storefront group is المتجر + صفحات الهبوط, two
       * entries, not three.» The bench is still where it was.
       */
      r('/store', 'المتجر', 'Store', ['storefront.view', 'storefront.manage', 'geo.manage']),
      r('/store/landing-pages', 'صفحات الهبوط', 'PanelsTopLeft', ['landing_pages.view']),
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

      /**
       * WHAT WAS CONFIGURED FROM OTHER GROUPS, NOW CONFIGURED HERE.
       *
       * Three entries arrive, each from a group it was the odd one out of:
       *
       *   • «الذكاء الاصطناعي والنصوص» — from النمو, where it sat beside
       *     the assistant it configures. See the note there.
       *   • «متجر التطبيقات» and «التطبيقات المثبتة» — a group of their own
       *     with two entries, which is a heading you open to find two
       *     links. Installing an app and wiring it up IS configuration.
       *   • «المهام المجدولة» — from الإدارة, where it sat beside the
       *     staff and the permissions although it is the schedule the
       *     system runs itself by, and its own gate is `settings.view`.
       *
       * The contract had said «apps appear ONCE, as group 8, not in
       * settings». What it was protecting was the ONCE — the same two
       * screens in a main menu, in settings and in a group of their own —
       * and that holds. The owner's plan of 21/10 put them here.
       */
      r('/settings/ai', 'الذكاء الاصطناعي والنصوص', 'Bot', ['settings.view']),
      r('/apps/store', 'متجر التطبيقات', 'LayoutGrid', ['apps.view']),
      r('/apps/installed', 'التطبيقات المثبتة', 'Blocks', ['apps.view']),
      r('/settings/system', 'إعدادات النظام', 'Settings', ['settings.view']),
      r('/admin/jobs', 'المهام المجدولة', 'Timer', ['settings.view']),
    ],
  },
  {
    key: 'admin',
    label: 'الإدارة',
    routes: [
      r('/admin/users', 'الموظفين', 'UserCog', ['users.view']),
      r('/admin/permissions', 'الصلاحيات', 'ShieldCheck', ['roles.view']),
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
  return first?.path ?? NO_ACCESS;
}

/**
 * WHERE A PERSON WITH NOTHING TO OPEN IS SENT — AND THAT IT IS A PAGE.
 *
 * `landingRoute` returned the string `'/no-access'` for years and nothing
 * answered at that address, so the one case it was written for — somebody
 * whose menu is empty — would have been met by a 404. It could not happen
 * in practice (the profile has no permission and every ACTIVE user opens
 * it), which is exactly why nobody noticed: a fallback that is never taken
 * is a fallback nobody tests.
 *
 * It is a constant now so the page, the redirect and the claim that the
 * page exists all say the same word. The page itself sends a person who
 * HAS something to open back to it — so «تحديث» after the manager grants a
 * role takes them in, and the two can never send each other round a loop.
 */
export const NO_ACCESS = '/no-access';
