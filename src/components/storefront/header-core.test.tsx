import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, DEFAULT_STORE_THEME, layoutOf, parseStoreTheme } from '@/lib/store-theme';
import { LAYOUT_SLOTS } from '@/lib/store-skin';
import { telHref, whatsappHref } from '@/lib/store-contact';
import { repoFile, stripComments } from '@/lib/guard-source';

/**
 * THE HEADER'S LOCKED CORE.
 *
 * «ترويسة فيها: البحث · السلة بعدد القطع · زر تواصل واتساب» and a visible
 * reassurance line. Before this the header carried a logo, a menu and a
 * phone number — so the shelf, the search and the basket had no way in
 * from any page of the shop, and «رقم الهاتف نص، مش زر تواصل» was on the
 * brief's own list of the current storefront's mistakes.
 *
 * A VARIANT IS AN ARRANGEMENT, NEVER A SUBTRACTION. Four templates move
 * these things around; not one of them may remove one.
 */

const shell = () => stripComments(repoFile('src/components/storefront/StorefrontShell.tsx'));
const css = () => repoFile('src/components/storefront/styles.ts');

describe('what every header carries', () => {
  it.each([
    ['the search', /<form className="sf-search"/],
    ['the basket', /<CartLink slug=/],
    ['the WhatsApp button', /className="sf-whatsapp"/],
    ['the reassurance line', /sf-assure/],
  ])('%s', (_what, pattern) => {
    expect(shell()).toMatch(pattern);
  });

  it('says the two facts a wary customer is deciding on', () => {
    expect(shell()).toContain('الدفع عند الاستلام');
    expect(shell()).toContain('توصيل لكل المحافظات');
  });

  /**
   * The search is a plain GET form: it works before any script runs,
   * which on a mid-range Android is the difference between a search box
   * and a dead field.
   */
  it('searches without waiting for a script', () => {
    const form = shell().slice(shell().indexOf('<form className="sf-search"'));
    expect(form.slice(0, 200)).toMatch(/method="get"/);
    expect(form.slice(0, 200)).toMatch(/action=\{`\/s\/\$\{store\.slug\}\/shop`\}/);
  });

  /** A shop with one product has no basket, and `cartBarApplies` decides. */
  it('leaves the basket out of a one-product shop, and only there', () => {
    expect(shell()).toMatch(/cartBarApplies\(store\.type\) && <CartLink/);
  });
});

describe('no variant may take one away', () => {
  /**
   * The arrangements are CSS over one core. A rule that hid a locked
   * element would be a customisation that breaks it — «أي تخصيص بيخرب
   * عنصر منهم بينرفض مع السبب» — so there is none, and this says so.
   */
  it.each(LAYOUT_SLOTS.header)('the «%s» arrangement hides nothing locked', (variant) => {
    const rules = css()
      .split('\n')
      .filter((l) => l.includes(`data-header='${variant}'`));
    for (const rule of rules) {
      expect(rule, rule).not.toMatch(/\.sf-(search|cart|whatsapp|assure)[^{]*\{[^}]*display:\s*none/);
    }
  });

  it('and no rule anywhere hides the search or the basket', () => {
    const body = css();
    for (const part of ['sf-search', 'sf-cart', 'sf-assure']) {
      // The phone NUMBER may go on a small screen — it is not locked, and
      // the WhatsApp button beside it is what the brief asked for.
      const hidden = new RegExp(`\\.${part}[^{]*\\{[^}]*display:\\s*none`);
      expect(body, part).not.toMatch(hidden);
    }
  });

  it('collapses to one order on a phone, whatever the template chose', () => {
    expect(css()).toMatch(/@media \(max-width: 767px\)[\s\S]*data-header\]/);
  });
});

describe('the variant reaches the page at all', () => {
  /**
   * Stage 1 declared seven slots and `skinToStoreTheme` wrote none of
   * them, because the theme had nowhere to put them — so a template could
   * be validated, installed, and still look like every other one.
   */
  it('the theme can hold one', () => {
    const theme = parseStoreTheme(JSON.stringify({ ...DEFAULT_STORE_THEME, layout: { header: 'split' } }));
    expect(theme.layout?.header).toBe('split');
  });

  it('and the header asks for it', () => {
    expect(shell()).toMatch(/data-header=\{layoutOf\(store\.theme, 'header'\)\}/);
  });

  it('a shop that never chose wears what the storefront always drew', () => {
    expect(layoutOf(DEFAULT_STORE_THEME, 'header')).toBe(DEFAULT_LAYOUT.header);
    expect(layoutOf(DEFAULT_STORE_THEME, 'productCard')).toBe(DEFAULT_LAYOUT.productCard);
  });

  it('every slot has a default, so no page ever draws nothing', () => {
    for (const slot of Object.keys(LAYOUT_SLOTS) as (keyof typeof LAYOUT_SLOTS)[]) {
      expect(DEFAULT_LAYOUT[slot], slot).toBeTruthy();
      expect(LAYOUT_SLOTS[slot] as readonly string[], slot).toContain(DEFAULT_LAYOUT[slot]);
    }
  });

  /**
   * ONE LIST, AND EVERYBODY IMPORTS IT.
   *
   * A second copy is how a template comes to name a variant no renderer
   * has. It began inside the template contract, which could not work:
   * the contract imports the block library, so the block library could
   * not import the contract back to learn which hero variants exist.
   * The catalogue is its own module under both — see layout-slots.ts.
   */
  it.each([
    'src/lib/store-theme.ts',
    'src/lib/store-skin.ts',
    'src/lib/landing-sections.ts',
  ])('%s names the variants from the catalogue', (file) => {
    expect(stripComments(repoFile(file))).toMatch(
      /import \{ LAYOUT_SLOTS \} from '\.\/layout-slots'/
    );
  });

  it('and nobody writes a second list of them', () => {
    for (const file of ['src/lib/store-theme.ts', 'src/lib/landing-sections.ts']) {
      expect(stripComments(repoFile(file)), file).not.toMatch(/LAYOUT_SLOTS = /);
    }
  });

  it('refuses a variant nobody built', () => {
    const theme = parseStoreTheme(JSON.stringify({ ...DEFAULT_STORE_THEME, layout: { header: 'neon' } }));
    expect(theme.layout?.header).toBeUndefined();
  });
});

describe('reaching the shop', () => {
  /**
   * Digits only, and the + goes: `wa.me` takes an international number
   * with no punctuation, and a link built from the number as typed opens
   * nothing — which looks to a shopper exactly like a shop that does not
   * answer.
   */
  it('strips everything a number is written with', () => {
    expect(whatsappHref('+963 11 222 3333')).toBe('https://wa.me/963112223333');
    expect(whatsappHref('0963-11-222-3333')).toBe('https://wa.me/0963112223333');
  });

  it('offers nothing rather than a dead link', () => {
    expect(whatsappHref(null)).toBeNull();
    expect(whatsappHref('')).toBeNull();
    expect(whatsappHref('12345')).toBeNull();
  });

  /** And the + SURVIVES for dialling: a phone app needs it to know the
   *  number is international, and a customer roaming gets a failed call
   *  without it. */
  it('keeps the plus on something to dial', () => {
    expect(telHref('+963 11 222 3333')).toBe('tel:+963112223333');
    expect(telHref('123')).toBeNull();
  });
});
