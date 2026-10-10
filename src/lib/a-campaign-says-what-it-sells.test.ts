import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './guard-source';
import { campaignProductId, productConflict, campaignInputSchema } from './campaigns';

/**
 * «اقدر احدد كل حملة لاي منتج»
 *
 * ── WHAT WAS MEASURED BEFORE ANY COLUMN WAS ADDED ──
 *
 * `campaigns` holds ZERO rows. `landing_pages` holds 44, and **44 of 44
 * name a product**. So for any campaign pointing at a page, the product was
 * ALREADY known — and the obvious implementation, a `productId` on the
 * campaign that the screen fills in, would have been a second answer to a
 * question the data already answers. “If the same figure is computed in two
 * different places, that is a defect even when the two agree today.”
 *
 * ── SO WHAT THE COLUMN IS ACTUALLY FOR ──
 *
 * `Campaign.landingPageId` is NULLABLE. A campaign with no page is a real
 * and reachable state — an ad pointing at a storefront product page, or at
 * a WhatsApp thread — and before this it could never say what it sold. That
 * is the hole, and it is the only one.
 *
 * ── AND THE PAGE WINS WHEN THERE IS ONE ──
 *
 * Not arbitrarily: the page is what the click LANDS ON, so it is what the
 * visitor is being sold. A column saying otherwise is a note about
 * intention, and intention does not take an order. A contradiction between
 * the two is refused at the door rather than resolved, because a figure
 * that quietly picks a winner is a figure nobody can trust.
 */

const root = process.cwd();
const read = (f: string) => readFileSync(join(root, f), 'utf8');

const PRODUCT_A = 'prod-a';
const PRODUCT_B = 'prod-b';

describe('Ⅰ · which product a campaign advertises — one answer', () => {
  it('the linked page’s product, when there is a page', () => {
    expect(campaignProductId({ landingPage: { productId: PRODUCT_A } })).toBe(PRODUCT_A);
  });

  it('and the page wins over the column, because the page is what the click lands on', () => {
    expect(
      campaignProductId({ productId: PRODUCT_B, landingPage: { productId: PRODUCT_A } })
    ).toBe(PRODUCT_A);
  });

  it('the campaign’s own product when there is NO page — the hole this closes', () => {
    expect(campaignProductId({ productId: PRODUCT_B, landingPage: null })).toBe(PRODUCT_B);
    expect(campaignProductId({ productId: PRODUCT_B })).toBe(PRODUCT_B);
  });

  it('and the column when the page names nothing', () => {
    // 0 of 44 pages are like this today, and the column is nullable, so it
    // is reachable rather than theoretical.
    expect(campaignProductId({ productId: PRODUCT_B, landingPage: { productId: null } })).toBe(PRODUCT_B);
  });

  it('and null means «not stated», which is a real answer', () => {
    // An ad pointing at a shop front rather than at anything in particular.
    expect(campaignProductId({})).toBeNull();
    expect(campaignProductId({ productId: null, landingPage: null })).toBeNull();
    expect(campaignProductId({ landingPage: { productId: null } })).toBeNull();
  });
});

describe('Ⅱ · a contradiction is refused, not resolved', () => {
  it('names both products and which two things disagree', () => {
    const msg = productConflict(PRODUCT_B, PRODUCT_A, { chosen: 'كريم', page: 'سيروم' });
    expect(msg).toContain('سيروم');
    expect(msg).toContain('كريم');
    expect(msg).toContain('صحِّح أحدهما');
  });

  it('and says nothing when they agree', () => {
    expect(productConflict(PRODUCT_A, PRODUCT_A)).toBeNull();
  });

  it('and nothing when either side is absent — that is not a contradiction', () => {
    expect(productConflict(PRODUCT_A, null)).toBeNull();
    expect(productConflict(null, PRODUCT_A)).toBeNull();
    expect(productConflict(undefined, undefined)).toBeNull();
    expect(productConflict('', PRODUCT_A)).toBeNull();
  });

  it('and falls back to generic words rather than printing «undefined»', () => {
    const msg = productConflict(PRODUCT_B, PRODUCT_A);
    expect(msg).not.toContain('undefined');
    expect(msg).toContain('منتجاً');
  });
});

describe('Ⅲ · the column may be set AND cleared', () => {
  it('the input schema accepts a uuid, a null, and an absence', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const base = { name: 'حملة', startDate: '2026-10-01' };
    expect(campaignInputSchema.safeParse({ ...base, productId: uuid }).success).toBe(true);
    // Nullable, not merely optional: clearing it is a real edit, and a
    // schema that only took a uuid could set one and never unset it.
    expect(campaignInputSchema.safeParse({ ...base, productId: null }).success).toBe(true);
    expect(campaignInputSchema.safeParse({ ...base }).success).toBe(true);
  });

  it('and refuses anything that is not an id', () => {
    const base = { name: 'حملة', startDate: '2026-10-01' };
    expect(campaignInputSchema.safeParse({ ...base, productId: 'not-an-id' }).success).toBe(false);
    expect(campaignInputSchema.safeParse({ ...base, productId: 7 }).success).toBe(false);
  });
});

describe('Ⅳ · both doors, and an id from a browser is never a foreign key', () => {
  const CREATE = 'src/app/api/growth/campaigns/route.ts';
  const EDIT = 'src/app/api/growth/campaigns/[id]/route.ts';

  for (const rel of [CREATE, EDIT]) {
    it(`${rel.includes('[id]') ? 'the edit door' : 'the create door'} looks the product up WITH the store`, () => {
      /*
       * Another store's product is a REAL product, so the foreign key takes
       * it — and the campaign is then reported against something it never
       * advertised.
       */
      const src = stripComments(read(rel));
      /*
       * TWO ASSERTIONS RATHER THAN ONE LONG PATTERN. The create door asks
       * on `input.productId` and the edit door on the post-merge
       * `nextProductId` — both correct, and a single regex covering both
       * would be either loose or wrong. What must hold either way is that
       * the lookup is SCOPED: `inStore` inside the same `findFirst`.
       */
      const call = /db\.product\.findFirst\(\{[\s\S]{0,200}?\}\);/.exec(src)?.[0];
      expect(call, 'لا بحثَ عن المنتج').toBeTruthy();
      expect(call!, 'المنتجُ يُبحَثُ عنه بلا متجر').toMatch(/\.\.\.inStore\(companyId, storeId\)/);
      expect(call!).toMatch(/where: \{ id: (?:input\.productId|nextProductId),/);
    });

    it(`${rel.includes('[id]') ? 'the edit door' : 'the create door'} refuses a contradiction`, () => {
      const src = stripComments(read(rel));
      expect(src).toMatch(/productConflict\(/);
      expect(src).toMatch(/PRODUCT_CONFLICT/);
    });

    it(`${rel.includes('[id]') ? 'the edit door' : 'the create door'} stores nothing when a page answers`, () => {
      /*
       * The column exists NOT to be a second copy. With a page linked the
       * product is derivable from it, so writing it on the row too is the
       * duplication this whole design avoids — and a stale copy is worse
       * than none, because `campaignProductId` ignores it forever while the
       * next reader of the row believes it.
       */
      const src = stripComments(read(rel));
      expect(src).toMatch(/productId: pageProduct \? null : \(chosenProduct\?\.id \?\? null\)/);
    });
  }
});

describe('Ⅴ · the edit door measures the state AFTER the merge', () => {
  const src = stripComments(read('src/app/api/growth/campaigns/[id]/route.ts'));

  it('reads the row’s own page and product to measure against', () => {
    // The trap a per-field `!== undefined` cannot see: a body carrying only
    // `{ landingPageId }` changes which product the campaign advertises,
    // and one carrying only `{ productId }` must be judged against the page
    // ALREADY on the row. Reading the input alone answers neither.
    expect(src).toMatch(/landingPageId: true, productId: true,/);
  });

  it('and works out the effective values before judging anything', () => {
    expect(src).toMatch(
      /const nextPageId =\s*\n?\s*input\.landingPageId !== undefined \? \(input\.landingPageId \?\? null\) : existing\.landingPageId/
    );
    expect(src).toMatch(
      /const nextProductId =\s*\n?\s*input\.productId !== undefined \? \(input\.productId \?\? null\) : existing\.productId/
    );
  });

  it('and writes the column whenever EITHER side moved', () => {
    /*
     * Linking a page to a campaign that had an explicit product must CLEAR
     * that column. Otherwise the row keeps a stale second answer that
     * `campaignProductId` ignores forever, and the next person to read the
     * row sees a product the campaign is not advertising.
     */
    expect(src).toMatch(
      /const scopeMoved = input\.landingPageId !== undefined \|\| input\.productId !== undefined/
    );
    expect(src).toMatch(/\.\.\.\(scopeMoved \? \{ productId:/);
  });
});

describe('Ⅵ · the browser is handed the answer, not the sources', () => {
  const route = stripComments(read('src/app/api/growth/campaigns/route.ts'));
  const screen = read('src/components/screens/CampaignsScreen.tsx');

  it('the server resolves the precedence', () => {
    expect(route).toMatch(/product: c\.landingPage\?\.product \?\? c\.product \?\? null/);
  });

  it('and the screen does NOT work it out again', () => {
    /*
     * A second copy of the precedence in a browser is a screen that prints
     * a different product from the export beside it, the first time one of
     * them is changed. The screen reads `c.product` and nothing more.
     */
    const code = stripComments(screen);
    expect(code, 'الشاشةُ تُعيدُ حسابَ الأسبقيّة').not.toMatch(/landingPage\?\.product/);
    expect(code).toMatch(/c\.product/);
  });

  it('and the form offers back the ROW’s product, not the derived one', () => {
    // With a page linked the row holds null; offering the page's product
    // here would make the form look as though the row stores something it
    // does not, and saving would then write it.
    expect(screen).toMatch(/productId: campaign\?\.productId \?\? ''/);
  });

  it('and linking a page CLEARS the chosen product in the form', () => {
    // A form that lets somebody save a contradiction the door then refuses
    // is a form that wastes a person's time to teach them a rule.
    expect(screen).toMatch(/productId: e\.target\.value \? '' : form\.productId/);
  });

  it('and the field is replaced by a sentence when a page answers', () => {
    expect(screen).toContain('مأخوذ من صفحة الهبوط المرتبطة');
    // And the other case says what «empty» means, rather than leaving it
    // to be guessed.
    expect(screen).toContain('للإعلانات التي لا تذهب إلى صفحة هبوط');
  });

  it('and the row prints the product beside the code', () => {
    expect(screen).toMatch(/c\.product \? ` · \$\{c\.product\.name\}` : ''/);
  });
});

describe('Ⅶ · the migration is additive and keeps the spend', () => {
  const sql = read('prisma/migrations/20261010180000_campaign_product/migration.sql').replace(
    /^\s*--.*$/gm,
    ''
  );

  it('adds one nullable column and nothing else', () => {
    expect(sql).toMatch(/ADD COLUMN "product_id" TEXT;/);
    expect(sql).not.toMatch(/\bNOT NULL\b|\bDROP\b|TRUNCATE|DELETE FROM/i);
  });

  it('and SET NULL, so deleting a product cannot delete the campaign', () => {
    // The spend recorded on it was real money that left for Meta. A cascade
    // would erase the record of it.
    expect(sql).toMatch(/ON DELETE SET NULL/);
    expect(sql, 'حذفُ منتجٍ يَحذِفُ الحملةَ ومعها ما صُرِف').not.toMatch(/ON DELETE CASCADE/);
  });

  it('and the schema says the same', () => {
    const model = /model Campaign \{([\s\S]*?)\n\}/.exec(read('prisma/schema.prisma'));
    expect(model).not.toBeNull();
    expect(model![1]).toMatch(/productId\s+String\?\s+@map\("product_id"\)/);
    expect(model![1]).toMatch(/product\s+Product\?\s+@relation\([^)]*onDelete: SetNull\)/);
  });

  it('and the reason the column is not a duplicate is written down', () => {
    // The measurement that justified the design — 44 of 44 — belongs beside
    // the column, or the next reader adds the second copy back.
    const model = /model Campaign \{([\s\S]*?)\n\}/.exec(read('prisma/schema.prisma'))![1];
    expect(model).toMatch(/44 of 44/);
  });
});
