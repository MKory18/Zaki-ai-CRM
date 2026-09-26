import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/**
 * A NUMBER HAS ONE SCREEN, AND A FIELD HAS ONE EDITOR.
 *
 * The contract's rule: reading is one place, setting is another, and neither
 * is two places. It is a rule about where files put things, so it is checked
 * against the files — the moment somebody pastes the conversion rate back
 * onto the list "just so it's handy", this fails and says why.
 */

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('landing-page analytics are read on the performance screen', () => {
  it.each([
    'src/components/screens/LandingPagesScreen.tsx',
    'src/components/screens/LandingPageDetailScreen.tsx',
  ])('%s shows no counts of its own', (file) => {
    const src = read(file);
    // The counts came off the API row as viewsCount / ordersCount /
    // conversionRate. Rendering any of them here is the duplicate.
    for (const field of ['viewsCount', 'ordersCount', 'conversionRate']) {
      expect(src, `${file} still renders ${field}`).not.toContain(`lp.${field}`);
    }
  });

  it('the detail screen points at where they are read instead', () => {
    expect(read('src/components/screens/LandingPageDetailScreen.tsx')).toContain(
      '/growth/performance?tab=landing'
    );
  });

  it('and that screen actually opens on that tab', () => {
    const perf = read('src/components/screens/PerformanceScreen.tsx');
    // The link carries ?tab=, the screen reads it and lands on that tab.
    // Asserted as the pair rather than as one exact line, so adding a third
    // tab does not read as the link being broken.
    expect(perf).toContain("URLSearchParams(window.location.search).get('tab')");
    expect(perf).toContain("=== 'landing'");
    expect(perf).toContain('تحليلات صفحات الهبوط');
  });
});

describe('every order edit goes through the one that can answer «why»', () => {
  it('no screen PATCHes an order directly', () => {
    // An edit on company-wide authority is refused with REASON_REQUIRED, and
    // useOrderPatch is what turns that into the question. A call site that
    // skips it is a 400 the person can never get past — which is exactly
    // what three of them were until the review found it.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.test.tsx') || entry.name.endsWith('.test.ts')) continue;
        if (full.endsWith('useOrderPatch.ts')) continue;
        const src = read(full);
        if (!/api\/orders\/\$\{[^}]+\}`,\s*\{\s*\n?\s*method:\s*'PATCH'/m.test(src)) continue;
        // Carrying out an APPROVED change request is the one exemption, and
        // the server grants it: that door already wrote its own reason into
        // the audit, and strayFields refuses anything sent beside the id —
        // so a reason added here would turn a working apply into a 400.
        if (src.includes('changeRequestId')) continue;
        offenders.push(full);
      }
    };
    walk('src/components');
    expect(offenders, 'these must use useOrderPatch').toEqual([]);
  });
});

describe('the store logo and favicon have one editor', () => {
  it('only the identity card writes them', () => {
    // Every other screen that shows a logo shows it; StoreBrandField is the
    // one control that changes it.
    const writers = [
      'src/components/screens/StorefrontsScreen.tsx',
      'src/components/settings/StorefrontSettings.tsx',
      'src/components/screens/SystemSettingsScreen.tsx',
    ].filter((f) => fs.existsSync(f) && read(f).includes('StoreBrandField'));
    expect(writers, 'a second logo/favicon editor appeared').toEqual([]);
    expect(read('src/components/settings/StoreIdentityCard.tsx')).toContain('StoreBrandField');
  });
});

/**
 * A STORE'S ADDRESS HAS ONE EDITOR.
 *
 * It had two. `/store/domain` writes it, checks DNS, and clears
 * `domainVerifiedAt` on every change so a new address starts unverified.
 * The store settings form wrote the same column as a plain string and
 * touched nothing else — so an owner who edited the address there moved
 * the host and left the old tick standing.
 *
 * The dashboard then said "verified" about a domain nobody had looked up,
 * while the customer typing it met an error page. A wrong answer is worse
 * than no answer: nobody investigates a green tick.
 */
describe('the store domain is written in one place', () => {
  it('only the domain route clears and sets the verification', () => {
    const domainRoute = read('src/app/api/store/domain/route.ts');
    expect(domainRoute).toContain('domainVerifiedAt');

    // Anything else that writes `domain` without touching the verification
    // is the fault coming back.
    const geo = read('src/app/api/geo/stores/[id]/route.ts');
    expect(geo).not.toMatch(/data\.domain\s*=/);
  });

  it('the settings schema refuses a domain rather than ignoring one', () => {
    // `.strict()` turns a form that still sends it into a loud 400, not a
    // save that half worked.
    const schemas = read('src/lib/geo-schemas.ts');
    expect(schemas).toContain('.strict()');
    expect(schemas).not.toMatch(/^\s*domain: z\./m);
  });

  it('and the settings form points at the real editor instead of editing', () => {
    const form = read('src/components/settings/StorefrontSettings.tsx');
    expect(form).not.toContain('form.domain');
    expect(form).toContain('/store/domain');
  });
});

/**
 * WHAT A COURIER OWES IS WORKED OUT IN ONE PLACE.
 *
 * `expectedAmountFor` in settlement.ts is the rule, and the statement
 * matcher reads it. The manual-collection dialog computed its own version:
 * `totalAmount − deliveryFee`.
 *
 * That is right for a whole delivery and wrong for a PARTIAL one, where the
 * courier owes only what the customer actually took. So every partial read
 * as a shortfall — the person collecting saw a number accusing a rep of
 * keeping money he had never received — and because the server applied the
 * real rule, the two disagreed and the gap was recorded as an overpayment.
 */
describe('what the courier owes', () => {
  it('the collect dialog adds up the server’s figures, it does not derive them', () => {
    const dialog = read('src/components/screens/tracking/CollectDialog.tsx');
    expect(dialog).toContain('expectedCollection');
    // The old arithmetic, in either of its two places in that file.
    expect(dialog).not.toMatch(/totalAmount\)\s*-\s*Number\(o\.deliveryFee/);
  });

  it('and the tracking route computes it with the settlement rule itself', () => {
    const route = read('src/app/api/ops/tracking/route.ts');
    expect(route).toContain('expectedAmountFor');
    expect(route).toContain('expectedCollection');
  });

  it('the rule still treats a partial delivery as what was collected', async () => {
    // The behaviour both sides now share, asserted where it lives.
    const { expectedAmountFor } = await import('./settlement');
    const whole = expectedAmountFor({ shippingStatus: 'DELIVERED', totalAmount: 5000, deliveryFee: 500 });
    const partial = expectedAmountFor({
      shippingStatus: 'PARTIALLY_DELIVERED',
      totalAmount: 5000,
      collectedAmount: 2000,
      deliveryFee: 500,
    });
    expect(whole).toBe(4500);
    // Not 4500: the customer took part of it, and the courier owes that.
    expect(partial).toBeLessThan(whole);
  });
});

/**
 * THE MOVEMENTS LOG IS DRAWN ONCE.
 *
 * `/inventory/balances` rendered the whole log — eight columns of it —
 * while `/inventory/movements` existed as its own screen. The same record
 * appeared twice under two names, and nobody could say which was THE
 * record. Worse, the balances screen titled itself «المخزون والحركات»,
 * promising the log the menu had sent people elsewhere for.
 *
 * One screen answers "how much is left". The other answers "what happened".
 */
describe('the stock log has one screen', () => {
  it('the balances screen does not redraw it', () => {
    const balances = read('src/components/screens/InventoryBalancesScreen.tsx');
    expect(balances).not.toContain('سجل حركات المخزون\'');
    // No table at all: the balances themselves are cards.
    expect(balances).not.toContain('<table');
  });

  it('and points at the screen that owns it instead', () => {
    expect(read('src/components/screens/InventoryBalancesScreen.tsx')).toContain('/inventory/movements');
  });

  it('the movements screen still draws it', () => {
    // It draws the log with `<Rows>` now — a table on a desk and a card on
    // a phone, from one definition. The invariant is unchanged: ONE screen
    // owns the stock log. Only the markup moved.
    const src = read('src/components/screens/InventoryMovementsScreen.tsx');
    expect(src.includes('<table') || src.includes('<Rows'), 'شاشة الحركات لا ترسم السجلّ').toBe(true);
  });
});
