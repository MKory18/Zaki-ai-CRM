import type { SessionUser } from '@/types/auth';
import { canAccessRoute, type PermissionCheck } from './route-registry';

/**
 * THE SHOP'S ADMINISTRATION — TWO MENU ENTRIES, NOT TEN.
 *
 * The storefront group used to list ten screens: the shop itself, its
 * landing pages, and eight more for the design, the templates, the menus,
 * the policy pages, the search, the languages, the routes and the domain.
 * `docs/storefront/AUDIT.md` §6 counted what that cost — 89 paragraphs, 60
 * long sentences and 72 buttons across them, with no screen marking its
 * primary action — and the owner's own words for it were «معجّق، كلام فوق
 * بعضه، داتا مكدّسة، بتضيع».
 *
 * §7.1 proposes the shape this file holds: two levels and nothing more.
 * **All shops** (`/store`) → **one shop** (`/store?tab=…&sec=…`), whose
 * three tabs are the three questions a seller actually arrives with:
 *
 *   الواجهة   how the shop LOOKS      — its home page, its template
 *   المحتوى   what the shop SAYS      — policy pages, menus, search, language
 *   العنوان   where the shop LIVES    — its domain, its old addresses
 *
 * WHY THE TABS CARRY SECTIONS. A tab holding four screens at once would
 * have four primary buttons, and «a title + one line + ONE primary action»
 * is the rule this task exists to establish. One section is open at a
 * time, so one panel is on screen, so there is exactly one primary action
 * on it. The panels are the EXISTING screens, reused — not one line of
 * their bodies was rewritten to hang them here.
 *
 * NOTHING WAS LOST AND NOTHING MOVED HOUSE. Every one of the eight old
 * addresses redirects permanently (next.config.ts) to the section that now
 * holds it, and `OLD_STORE_ROUTES` below is the one list both the redirects
 * and their guard read — so an address cannot be redirected to a section
 * that does not exist, and a section cannot quietly stop answering an old
 * address.
 */

/** The three tabs of one shop. `null` is the list of all shops. */
export type StoreTab = 'front' | 'content' | 'address';

export interface StoreSection {
  key: string;
  /** The panel's own name, as the tab's chip says it. */
  label: string;
  /**
   * WHO MAY OPEN THIS PANEL — the same keys the old route carried, so the
   * merge widened nobody's access.
   *
   * It matters that this is here and not only in the screen: `/store`
   * itself opens for `geo.manage` (somebody who decides which shops
   * EXIST), and before this list the tabs would have opened for them too
   * — eight panels whose every request the API would then refuse, which
   * is a screen full of red where a closed door belongs.
   */
  permissions: string[];
}

export interface StoreTabDef {
  key: StoreTab;
  label: string;
  /** One line. What this tab answers — printed under the title. */
  line: string;
  sections: StoreSection[];
}

const LOOK: string[] = ['storefront.view', 'storefront.manage'];

export const STORE_TABS: StoreTabDef[] = [
  {
    key: 'front',
    /**
     * «تصميم المتجر» — the owner's own name for it, 15/10 01:33, when he
     * found «التصميم» and «القوالب» both editing the home page. They are
     * one tab now: the page is arranged in `home` and nowhere else, and
     * the look — palette, type, arrangement, the cover image — is `look`.
     */
    label: 'الواجهة',
    line: 'شكل المتجر وصفحته الرئيسية — تصميم المتجر كله من هنا.',
    sections: [
      { key: 'home', label: 'الصفحة الرئيسية', permissions: LOOK },
      { key: 'look', label: 'القالب والألوان', permissions: LOOK },
    ],
  },
  {
    key: 'content',
    label: 'المحتوى',
    line: 'كلام المتجر عن نفسه، وكيف يتنقّل الزبون فيه ويبحث.',
    sections: [
      { key: 'pages', label: 'الصفحات والسياسات', permissions: LOOK },
      { key: 'menus', label: 'القوائم', permissions: LOOK },
      { key: 'search', label: 'البحث والفلاتر', permissions: LOOK },
      { key: 'languages', label: 'اللغة', permissions: LOOK },
    ],
  },
  {
    key: 'address',
    label: 'العنوان',
    line: 'الرابط الذي يراه الزبون، والعناوين القديمة التي ما زالت تأتيك.',
    sections: [
      // `storefront.domain` and not `storefront.manage`: moving a shop's
      // host is the one act here that can take the shop off the internet.
      { key: 'domain', label: 'الدومين', permissions: ['storefront.view', 'storefront.domain'] },
      { key: 'routes', label: 'المسارات', permissions: LOOK },
    ],
  },
];

/**
 * THE EIGHT ADDRESSES THAT MOVED, AND WHERE EACH LANDS.
 *
 * Read by `next.config.ts` (through the test that holds the two in step)
 * and by the guard that proves none of them 404s. A bookmark, a link
 * pasted in a chat and a note somebody wrote down all keep working.
 */
export const OLD_STORE_ROUTES: Record<string, { tab: StoreTab; section: string }> = {
  '/store/design': { tab: 'front', section: 'home' },
  '/store/themes': { tab: 'front', section: 'look' },
  '/store/pages': { tab: 'content', section: 'pages' },
  '/store/menus': { tab: 'content', section: 'menus' },
  '/store/search': { tab: 'content', section: 'search' },
  '/store/languages': { tab: 'content', section: 'languages' },
  '/store/domain': { tab: 'address', section: 'domain' },
  '/store/routes': { tab: 'address', section: 'routes' },
};

/** `/store?tab=front&sec=home` — the address a tab's panel is read at. */
export function storeTabHref(tab: StoreTab, section?: string): string {
  const sec = section ?? STORE_TABS.find((t) => t.key === tab)!.sections[0].key;
  return `/store?tab=${tab}&sec=${sec}`;
}

/** Where an old storefront address goes now, or undefined if it never moved. */
export function movedTo(oldPath: string): string | undefined {
  const target = OLD_STORE_ROUTES[oldPath];
  return target && storeTabHref(target.tab, target.section);
}

export function findTab(raw: string | undefined | null): StoreTabDef | undefined {
  return STORE_TABS.find((t) => t.key === raw);
}

/**
 * The section being read, tolerant of a stale or hand-typed `sec`.
 *
 * A link from a year-old note carrying a section this tab no longer has
 * must open the tab, not a blank panel: the first section is the answer,
 * because every tab's first section is the one its name means.
 */
export function readSection(tab: StoreTabDef, raw: string | undefined | null): StoreSection {
  return tab.sections.find((s) => s.key === raw) ?? tab.sections[0];
}

/**
 * MAY THIS USER OPEN THIS PANEL? — the server asks it before rendering and
 * the shell asks it before drawing the chip, through the one function.
 *
 * It is `canAccessRoute`'s own shape on purpose: a panel is a screen, the
 * rule for opening one is «holds ANY of its permissions, and is ACTIVE»,
 * and writing that rule a second time here is how the sidebar and the
 * guard came to disagree once before.
 */
export function canOpenSection(
  user: SessionUser,
  section: StoreSection,
  can: PermissionCheck
): boolean {
  return canAccessRoute(user, { path: '/store', label: '', icon: '', permissions: section.permissions }, can);
}

/** A tab opens when any one of its panels does. */
export function canOpenTab(user: SessionUser, tab: StoreTabDef, can: PermissionCheck): boolean {
  return tab.sections.some((s) => canOpenSection(user, s, can));
}

/** The sections of this tab this user may actually open, in order. */
export function openSections(
  user: SessionUser,
  tab: StoreTabDef,
  can: PermissionCheck
): StoreSection[] {
  return tab.sections.filter((s) => canOpenSection(user, s, can));
}
