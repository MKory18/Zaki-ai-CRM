import { z } from 'zod';

/**
 * THE SHOP'S MENUS.
 *
 * Five of them, each a list of places a customer can be sent: the header
 * bar, the main menu, the footer, "about the shop", and the policies.
 * Every item has a label, a destination and whether it shows at all — the
 * last so a seller can take a link down for a week without losing what it
 * said and where it pointed.
 *
 * WHERE A FOOTER LINK LIVES. It lives here. It briefly lived on the store's
 * theme as well, because the contract named «روابط التذييل» in the template
 * tab AND «التذييل» among these five. Two owners for one field is the thing
 * this whole section exists to stop, so the theme keeps the footer's
 * COPYRIGHT — a line of text — and its LINKS moved here, where they get an
 * order, a visibility flag and the same editor as every other menu.
 *
 * WHY THE ITEMS ARE JSON AND NOT ROWS. A menu is read whole, written whole
 * and ordered by hand; it is never queried by item. The landing page's
 * sections are stored the same way for the same reason. A table would buy
 * nothing and cost a join on every public page render.
 *
 * Pure and client-safe: the editor and the storefront read the same rules.
 */

export const MENU_KEYS = ['HEADER', 'MAIN', 'FOOTER', 'ABOUT', 'POLICIES'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

export const MENU_AR: Record<MenuKey, { label: string; hint: string }> = {
  HEADER: { label: 'قائمة الترويسة', hint: 'الروابط القليلة أعلى كل صفحة' },
  MAIN: { label: 'القائمة الرئيسية', hint: 'قائمة المتجر الكاملة' },
  FOOTER: { label: 'التذييل', hint: 'أسفل كل صفحة — مكان الصفحات القانونية' },
  ABOUT: { label: 'عن المتجر', hint: 'من نحن، القصة، تواصل معنا' },
  POLICIES: { label: 'الشروط والسياسات', hint: 'الخصوصية، الاستبدال، الشروط' },
};

/**
 * Where a menu item may point.
 *
 * An internal path, or an absolute http(s) URL. The internal branch refuses
 * a SECOND slash (and a backslash) after the first: `//evil.example` is a
 * path as far as a regex is concerned and another origin as far as a
 * browser is concerned, so a menu could have walked the shop's customers
 * somewhere else entirely.
 */
export const MENU_HREF = /^(\/(?![/\\])[^\s]*|https?:\/\/[^\s]+)$/;

export const menuItemSchema = z.object({
  label: z.string().trim().min(1).max(60),
  href: z.string().trim().min(1).max(300).regex(MENU_HREF, 'رابط غير صالح'),
  /** Off keeps the item and its address while taking it off the shop. */
  visible: z.boolean().default(true),
});

export type MenuItem = z.infer<typeof menuItemSchema>;

export const menuItemsSchema = z.array(menuItemSchema).max(30);

export const storeMenuUpdateSchema = z.object({
  items: menuItemsSchema,
});

/** The stored JSON, or an empty menu. A corrupt menu is no menu, never a crash. */
export function parseMenuItems(raw: string | null | undefined): MenuItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const ok = menuItemsSchema.safeParse(parsed);
    if (ok.success) return ok.data;
    // Item by item, so one bad row does not empty a shop's whole menu.
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => menuItemSchema.safeParse(item))
      .filter((r): r is { success: true; data: MenuItem } => r.success)
      .map((r) => r.data)
      .slice(0, 30);
  } catch {
    return [];
  }
}

/** What a shopper sees: the visible items, in order. */
export function visibleItems(items: MenuItem[]): MenuItem[] {
  return items.filter((item) => item.visible);
}

/** The address of one of a shop's own pages, for the link picker. */
export function storePageHref(storeSlug: string, pageSlug: string): string {
  return `/s/${storeSlug}/pages/${pageSlug}`;
}
