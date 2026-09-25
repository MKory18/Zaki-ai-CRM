import { describe, expect, it } from 'vitest';
import {
  MENU_AR,
  MENU_KEYS,
  menuItemSchema,
  menuItemsSchema,
  parseMenuItems,
  storePageHref,
  visibleItems,
} from './store-menus';

/**
 * A MENU CANNOT SEND A SHOP'S CUSTOMERS SOMEWHERE ELSE.
 *
 * Every test here is the refusal, because the destination is the only part
 * of a menu that can do harm.
 */

describe('where a menu item may point', () => {
  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    // A path as far as a regex is concerned, another origin as far as a
    // browser is concerned — this is the one that looks safe.
    ['//evil.example'],
    ['/\\evil.example'],
    ['ftp://x.example'],
    ['mailto:a@b.c'],
    ['about:blank'],
    ['  '],
    [''],
  ])('%s is refused', (href) => {
    expect(menuItemSchema.safeParse({ label: 'x', href }).success, href).toBe(false);
  });

  it.each([
    ['/s/seha/pages/privacy'],
    ['/'],
    ['https://example.com/x'],
    ['http://example.com'],
  ])('%s is accepted', (href) => {
    expect(menuItemSchema.safeParse({ label: 'x', href }).success, href).toBe(true);
  });

  it('needs a label somebody can read', () => {
    expect(menuItemSchema.safeParse({ label: '', href: '/' }).success).toBe(false);
    expect(menuItemSchema.safeParse({ label: 'x'.repeat(61), href: '/' }).success).toBe(false);
  });

  it('shows by default — a new item the seller just added is not invisible', () => {
    expect(menuItemSchema.parse({ label: 'من نحن', href: '/' }).visible).toBe(true);
  });

  it('caps a menu, so one cannot be grown until a page will not render', () => {
    const many = Array.from({ length: 31 }, () => ({ label: 'x', href: '/' }));
    expect(menuItemsSchema.safeParse(many).success).toBe(false);
  });
});

describe('a stored menu that no longer parses', () => {
  it('is no menu at all rather than a crash on a public page', () => {
    expect(parseMenuItems('}{')).toEqual([]);
    expect(parseMenuItems(null)).toEqual([]);
    expect(parseMenuItems('"a string"')).toEqual([]);
    expect(parseMenuItems('{"not":"an array"}')).toEqual([]);
  });

  it('keeps the good items when one row has gone bad', () => {
    // One link saved before the rule tightened must not empty the shop's
    // whole footer.
    const stored = JSON.stringify([
      { label: 'من نحن', href: '/s/seha/pages/about', visible: true },
      { label: 'سيّئ', href: '//evil.example', visible: true },
      { label: 'الشروط', href: '/s/seha/pages/terms', visible: true },
    ]);
    const items = parseMenuItems(stored);
    expect(items.map((i) => i.label)).toEqual(['من نحن', 'الشروط']);
  });

  it('keeps the order it was saved in', () => {
    const stored = JSON.stringify([
      { label: 'ثالث', href: '/c', visible: true },
      { label: 'أول', href: '/a', visible: true },
    ]);
    expect(parseMenuItems(stored).map((i) => i.label)).toEqual(['ثالث', 'أول']);
  });
});

describe('what a shopper sees', () => {
  it('is the visible items, in order, with the hidden ones kept in the shop’s own record', () => {
    const items = [
      { label: 'أ', href: '/a', visible: true },
      { label: 'ب', href: '/b', visible: false },
      { label: 'ج', href: '/c', visible: true },
    ];
    expect(visibleItems(items).map((i) => i.label)).toEqual(['أ', 'ج']);
    // Hiding does not delete: the label and the address are still there.
    expect(items).toHaveLength(3);
  });
});

describe('the five menus', () => {
  it('each have a name and a hint a seller can act on', () => {
    for (const key of MENU_KEYS) {
      expect(MENU_AR[key].label.length, key).toBeGreaterThan(2);
      expect(MENU_AR[key].hint.length, key).toBeGreaterThan(5);
    }
  });

  it('are exactly the five the contract names', () => {
    expect([...MENU_KEYS]).toEqual(['HEADER', 'MAIN', 'FOOTER', 'ABOUT', 'POLICIES']);
  });
});

describe('a link to one of the shop’s own pages', () => {
  it('is built, not typed — a path typed from memory breaks silently', () => {
    expect(storePageHref('seha-plus', 'privacy')).toBe('/s/seha-plus/pages/privacy');
  });

  it('and what it builds is a destination the rule accepts', () => {
    expect(menuItemSchema.safeParse({ label: 'x', href: storePageHref('a', 'b') }).success).toBe(true);
  });
});
