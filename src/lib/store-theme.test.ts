import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from './landing-theme';
import {
  CHECKOUT_FIELDS,
  DEFAULT_STORE_THEME,
  MANDATORY_CHECKOUT_FIELDS,
  cartBarApplies,
  checkoutOrder,
  headingFont,
  menuFont,
  parseStoreTheme,
  requiredCheckoutFields,
  storeThemeSchema,
  storeThemeVars,
  themeForPage,
  type StoreTheme,
} from './store-theme';

const of = (partial: Partial<StoreTheme>): StoreTheme => ({ ...DEFAULT_STORE_THEME, ...partial });

describe('the store owns the colour, and the page inherits it', () => {
  it('a page with no theme of its own wears its store’s', () => {
    const store = of({ accent: '#123456', mood: 'bold' });
    expect(themeForPage(store, null)).toBe(store);
    expect(themeForPage(store, undefined).accent).toBe('#123456');
  });

  it('a page that overrides departs from the store, wholly and legibly', () => {
    const store = of({ accent: '#123456', mood: 'bold', corners: 'sharp' });
    const page = themeForPage(store, { accent: '#abcdef' });
    expect(page.accent).toBe('#abcdef');
    // What it did not override still comes from the store — the override is
    // a departure, not a replacement.
    expect(page.mood).toBe('bold');
    expect(page.corners).toBe('sharp');
  });

  it('drops only the field it cannot read, and keeps the rest of the override', () => {
    const store = of({ accent: '#123456', mood: 'clean', pageImage: '' });
    // A mood this code no longer knows must not repaint the whole page: the
    // seller's background photo and colour are still theirs.
    const page = themeForPage(store, { mood: 'light', accent: '#abcdef', pageImage: '/a/b.webp' } as never);
    expect(page.mood).toBe('clean');
    expect(page.accent).toBe('#abcdef');
    expect(page.pageImage).toBe('/a/b.webp');
  });

  it('carries through nothing that is not a theme field', () => {
    const page = themeForPage(of({ accent: '#123456' }), { evil: 'x' } as never);
    expect((page as Record<string, unknown>).evil).toBeUndefined();
  });
});

describe('a stored theme that no longer parses', () => {
  it('is the house theme when it is not even JSON', () => {
    expect(parseStoreTheme('}{')).toEqual(DEFAULT_STORE_THEME);
    expect(parseStoreTheme(null)).toEqual(DEFAULT_STORE_THEME);
    expect(parseStoreTheme('"a string"')).toEqual(DEFAULT_STORE_THEME);
  });

  it('keeps what still parses, part by part', () => {
    // A header height this code refuses must not take the shop's colour
    // down with it.
    const stored = JSON.stringify({
      ...DEFAULT_THEME,
      accent: '#0a0b0c',
      header: { height: 9000, sticky: true },
      product: { priceStyle: 'with_compare', showStock: true, discountBadge: false, imageOrder: 'newest_first' },
    });
    const theme = parseStoreTheme(stored);
    expect(theme.accent).toBe('#0a0b0c');
    expect(theme.header?.height).toBe(DEFAULT_STORE_THEME.header?.height);
    expect(theme.product?.showStock).toBe(true);
  });

  it('reads a theme saved before any of this existed', () => {
    // A plain landing theme is a valid store theme; nothing about the shop
    // it did not know about may change.
    const theme = parseStoreTheme(JSON.stringify(DEFAULT_THEME));
    expect(theme.accent).toBe(DEFAULT_THEME.accent);
    expect(theme.checkout?.fieldOrder).toEqual([...CHECKOUT_FIELDS]);
  });
});

describe('the checkout cannot be configured into a broken order', () => {
  it('always requires the four a COD parcel needs, whatever was saved', () => {
    const theme = of({ checkout: { ...DEFAULT_STORE_THEME.checkout!, required: [] } });
    for (const f of MANDATORY_CHECKOUT_FIELDS) {
      expect(requiredCheckoutFields(theme), f).toContain(f);
    }
  });

  it('adds the shop’s own on top', () => {
    const theme = of({ checkout: { ...DEFAULT_STORE_THEME.checkout!, required: ['note'] } });
    expect(requiredCheckoutFields(theme)).toContain('note');
  });

  it('never drops a field an older saved order forgot', () => {
    const theme = of({ checkout: { ...DEFAULT_STORE_THEME.checkout!, fieldOrder: ['phone', 'name'] } });
    const order = checkoutOrder(theme);
    expect(order.slice(0, 2)).toEqual(['phone', 'name']);
    for (const f of CHECKOUT_FIELDS) expect(order, f).toContain(f);
  });

  it('never shows a field twice', () => {
    const theme = of({ checkout: { ...DEFAULT_STORE_THEME.checkout!, fieldOrder: ['name', 'name', 'phone'] } });
    const order = checkoutOrder(theme);
    expect(new Set(order).size).toBe(order.length);
  });

  it('refuses to make the region or the address optional — they are not offered', () => {
    // The guard is that the schema has no way to express it: `required` only
    // ever ADDS, and requiredCheckoutFields unions the mandatory four in.
    const theme = of({ checkout: { ...DEFAULT_STORE_THEME.checkout!, required: ['name'] } });
    expect(requiredCheckoutFields(theme)).toContain('region');
    expect(requiredCheckoutFields(theme)).toContain('address');
  });
});

describe('the bottom cart bar belongs to a shop that has a cart', () => {
  it('does not apply to a Single Product store', () => {
    expect(cartBarApplies('SINGLE_PRODUCT')).toBe(false);
  });

  it('applies to a multi-product one', () => {
    expect(cartBarApplies('MULTI_PRODUCT')).toBe(true);
    expect(cartBarApplies(null)).toBe(true);
  });
});

describe('the fonts', () => {
  it('fall back to the body face rather than storing a copy of it', () => {
    const theme = of({ font: 'cairo' });
    expect(headingFont(theme)).toBe('cairo');
    expect(menuFont(theme)).toBe('cairo');
    // Changing the body face must change all three, which a stored copy
    // would quietly prevent.
    expect(headingFont(of({ font: 'amiri' }))).toBe('amiri');
  });

  it('are used when set', () => {
    const theme = of({ font: 'cairo', fonts: { heading: 'lalezar', menu: 'rubik' } });
    expect(headingFont(theme)).toBe('lalezar');
    expect(menuFont(theme)).toBe('rubik');
  });

  it('refuse a face that is not in the library', () => {
    expect(storeThemeSchema.safeParse({ ...DEFAULT_THEME, fonts: { heading: 'comic-sans' } }).success).toBe(false);
  });
});

describe('every colour is a variable', () => {
  it('a colour the seller never named still has a value, from the accent', () => {
    const vars = storeThemeVars(of({ accent: '#b8256e' }));
    expect(vars['--lp-primary']).toBe('#b8256e');
    for (const key of ['--lp-secondary', '--lp-primary-light', '--lp-success', '--lp-warning', '--lp-danger']) {
      expect(vars[key], key).toMatch(/^#|^rgb/);
    }
  });

  it('a named colour wins over the derived one', () => {
    const vars = storeThemeVars(of({ accent: '#b8256e', colors: { primary: '#0000ff', danger: '#ff0000' } }));
    expect(vars['--lp-primary']).toBe('#0000ff');
    expect(vars['--lp-danger']).toBe('#ff0000');
  });

  it('the header height is a variable too, so no component writes a pixel', () => {
    expect(storeThemeVars(of({ header: { height: 96, sticky: true } }))['--lp-header-h']).toBe('96px');
  });

  it('refuses a colour that is not one', () => {
    expect(storeThemeSchema.safeParse({ ...DEFAULT_THEME, colors: { primary: 'blue' } }).success).toBe(false);
    expect(storeThemeSchema.safeParse({ ...DEFAULT_THEME, colors: { primary: '#fff' } }).success).toBe(false);
  });
});

describe('a footer link cannot point anywhere it likes', () => {
  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    // A path as far as a regex is concerned, another origin as far as a
    // browser is concerned.
    ['//evil.example'],
    ['/\\evil.example'],
    ['ftp://x.example'],
  ])(
    '%s is refused',
    (href) => {
      const parsed = storeThemeSchema.safeParse({
        ...DEFAULT_THEME,
        footer: { links: [{ label: 'x', href }], copyright: '' },
      });
      expect(parsed.success, href).toBe(false);
    }
  );

  it('accepts an internal path and an absolute https link', () => {
    const parsed = storeThemeSchema.safeParse({
      ...DEFAULT_THEME,
      footer: { links: [{ label: 'من نحن', href: '/pages/about' }, { label: 'x', href: 'https://e.example/x' }], copyright: '' },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('the cover image is same-origin, like the page image', () => {
  it('refuses somewhere we do not control', () => {
    expect(
      storeThemeSchema.safeParse({ ...DEFAULT_THEME, home: { sectionOrder: [], coverImage: 'https://e.example/a.png' } })
        .success
    ).toBe(false);
  });

  it('accepts an uploaded path, and empty for none', () => {
    for (const coverImage of ['', '/api/public/media/x/y.webp']) {
      expect(
        storeThemeSchema.safeParse({ ...DEFAULT_THEME, home: { sectionOrder: [], coverImage } }).success,
        coverImage
      ).toBe(true);
    }
  });
});
