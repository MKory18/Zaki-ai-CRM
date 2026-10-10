import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from '../guard-source';
import { pixelReaches, pixelScopeKind, type PixelScope } from './tracking-types';

/**
 * «فصل البيكسل لكل متجر وبلد حتى لو ح اولد بلد او متجر جديد»
 *
 * BEFORE THIS, A PIXEL BELONGED TO THE COMPANY AND NOTHING ELSE.
 * `TrackingPixel` carried `companyId` and no more, so every pixel fired on
 * every shop — and the owner's question was the sharp one: what happens
 * when I open the NEXT store? It inherited all of them, silently, on the
 * day it was created. Two shops selling different products reported their
 * sales into each other's ad accounts.
 *
 * MEASURED BEFORE THE CHANGE: `tracking_pixels` holds ZERO rows and there
 * are 3 stores. So nothing had to be decided for existing data — which is
 * the good moment to fix a thing, and it is also why the migration could
 * not be tested against real scoped rows. Said plainly rather than implied.
 *
 * ── THE SHAPE OF THE ANSWER ──
 *
 * Three scopes, mutually exclusive: the company's own, one country's, one
 * store's. A new store is reached by the first two — and that is not NULL
 * handling, it is a seller having SAID «كل المتاجر» or «كل متاجر الأردن» in
 * a dropdown whose first option says so out loud.
 */

const root = process.cwd();
const read = (f: string) => readFileSync(join(root, f), 'utf8');

const JO = 'country-jo';
const SY = 'country-sy';
const SHOP_A = 'store-a';
const SHOP_B = 'store-b';

/** A shop in Jordan, a shop in Syria, and a page belonging to neither. */
const inJordan = { storeId: SHOP_A, countryId: JO };
const inSyria = { storeId: SHOP_B, countryId: SY };
const noShop = { storeId: null, countryId: null };

describe('Ⅰ · whose visitors a pixel is told about', () => {
  it('a company-wide pixel reaches every shop', () => {
    const pixel: PixelScope = {};
    expect(pixelReaches(pixel, inJordan)).toBe(true);
    expect(pixelReaches(pixel, inSyria)).toBe(true);
  });

  it('and reaches a shop that did not exist when it was created', () => {
    /*
     * THE OWNER'S OWN QUESTION. A store opened tomorrow is reached by a
     * company-wide pixel — because somebody chose «كل المتاجر», which the
     * dropdown says in words, not because a column was left empty.
     */
    const pixel: PixelScope = { storeId: null, countryId: null };
    expect(pixelReaches(pixel, { storeId: 'store-opened-tomorrow', countryId: JO })).toBe(true);
  });

  it('a country pixel reaches that country only', () => {
    const pixel: PixelScope = { countryId: JO };
    expect(pixelReaches(pixel, inJordan)).toBe(true);
    expect(pixelReaches(pixel, inSyria), 'بكسلُ الأردنِ يعملُ على متجرٍ سوريّ').toBe(false);
  });

  it('and reaches a shop opened in that country later', () => {
    // The whole reason a country scope exists rather than only a store one.
    expect(pixelReaches({ countryId: JO }, { storeId: 'brand-new', countryId: JO })).toBe(true);
  });

  it('a store pixel reaches that store and nothing else', () => {
    const pixel: PixelScope = { storeId: SHOP_A };
    expect(pixelReaches(pixel, inJordan)).toBe(true);
    expect(pixelReaches(pixel, inSyria)).toBe(false);
    // Not even its own country's other shops.
    expect(pixelReaches(pixel, { storeId: SHOP_B, countryId: JO })).toBe(false);
  });

  it('and a page belonging to no shop gets company-wide pixels ONLY', () => {
    /*
     * `LandingPage.storeId` is nullable — a campaign page can exist with no
     * shop. The alternative reading, «unknown matches everything», is how a
     * pixel scoped to one shop starts reporting another's sales.
     */
    expect(pixelReaches({}, noShop)).toBe(true);
    expect(pixelReaches({ countryId: JO }, noShop)).toBe(false);
    expect(pixelReaches({ storeId: SHOP_A }, noShop)).toBe(false);
  });

  it('and a store scope beats a country scope on the same row', () => {
    // The row cannot hold both (a CHECK refuses it), but the function must
    // still be total: if one ever existed, the narrower answer wins rather
    // than the first branch that happens to be written.
    expect(pixelReaches({ storeId: SHOP_A, countryId: SY }, inJordan)).toBe(true);
    expect(pixelReaches({ storeId: SHOP_A, countryId: SY }, inSyria)).toBe(false);
  });

  it('and the kind a screen shows is read from the same two fields', () => {
    expect(pixelScopeKind({})).toBe('COMPANY');
    expect(pixelScopeKind({ storeId: null, countryId: null })).toBe('COMPANY');
    expect(pixelScopeKind({ countryId: JO })).toBe('COUNTRY');
    expect(pixelScopeKind({ storeId: SHOP_A })).toBe('STORE');
  });
});

describe('Ⅱ · the database holds what a route cannot', () => {
  const sqlWithProse = read('prisma/migrations/20261010170000_pixel_per_store_and_country/migration.sql');
  /*
   * THE STATEMENTS ONLY. The header above this migration EXPLAINS the
   * `ON DELETE RESTRICT` choice, so counting it in the whole file finds
   * three where there are two — and this is the sixth time in this
   * repository that a sweep reading prose has been the bug rather than the
   * find. Strip the `--` lines first, always.
   */
  const sql = sqlWithProse.replace(/^\s*--.*$/gm, '');

  it('refuses a row naming a store AND a country', () => {
    /*
     * Two answers to one question: if the store is not in that country,
     * which decides? There is no good answer, so the state cannot exist.
     * PROVED LIVE against the dev database — the insert came back
     * `23514` and the table stayed at zero rows.
     */
    expect(sql).toMatch(/ADD CONSTRAINT "tracking_pixels_one_scope_only"/);
    // And the reason is written down where the next reader will be.
    expect(sqlWithProse, 'القيدُ بلا سببٍ مكتوب').toMatch(/two answers to one question/);
    expect(sql).toMatch(/CHECK \("storeId" IS NULL OR "countryId" IS NULL\)/);
  });

  it('and RESTRICTS rather than cascades, so deleting a shop cannot delete the pixel', () => {
    // A cascade decides where the pixel points by throwing it away. Somebody
    // has to decide instead.
    expect((sql.match(/ON DELETE RESTRICT/g) ?? []).length).toBe(2);
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
  });

  it('and is additive — nothing in it can lose a row', () => {
    expect(sql).not.toMatch(/\bDROP\b|\bNOT NULL\b|\bDELETE FROM\b|TRUNCATE/i);
  });

  it('and the schema agrees with it', () => {
    const model = /model TrackingPixel \{([\s\S]*?)\n\}/.exec(read('prisma/schema.prisma'));
    expect(model).not.toBeNull();
    expect(model![1]).toMatch(/storeId\s+String\?/);
    expect(model![1]).toMatch(/countryId\s+String\?/);
    // One row per pixel id, still. The row says WHERE it fires; the same
    // pixel scoped two ways would be two rows claiming one ad account.
    expect(model![1], 'تغيّر مفتاحُ التفرّد').toMatch(/@@unique\(\[companyId, platform, pixelId\]\)/);
  });
});

describe('Ⅲ · no page may forget to say where it is', () => {
  /**
   * THE DEFECT THIS WHOLE ITEM IS ABOUT, AS A GUARD.
   *
   * `getTrackingPixelsForPage` used to take `(companyId, page)`. Every call
   * site had the store to hand and passed none, because there was nothing
   * to pass it to. An OPTIONAL third argument would have compiled at all
   * four and silently meant «every pixel» at any one that forgot — so it is
   * required, and this walks the callers to keep it that way.
   */
  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p) && !p.includes('.test.')) {
          out.push(relative(root, p).split('\\').join('/'));
        }
      }
    };
    walk(join(root, 'src'));
    return out;
  }

  const callers = (() => {
    const out: { file: string; args: string }[] = [];
    for (const file of sourceFiles()) {
      if (file === 'src/lib/tracking/tracking-config.ts') continue; // the definition
      const src = stripComments(read(file));
      for (const m of src.matchAll(/getTrackingPixelsForPage\(([\s\S]*?)\n\s*\)/g)) {
        out.push({ file, args: m[1] });
      }
    }
    return out;
  })();

  it('finds every page that loads pixels', () => {
    expect(callers.length, 'لا صفحةَ تُحمِّلُ بكسلات — المسحُ عمي').toBeGreaterThanOrEqual(4);
  });

  it('and every one of them says which shop it is — with a VALUE, not a literal null', () => {
    /*
     * THE FIRST VERSION OF THIS TEST LOOKED ONLY FOR THE KEY, and a
     * mutation proved it: turning `storeId: lp.storeId ?? null` into
     * `storeId: null` left the key in place and the test green, while the
     * landing page went back to taking every pixel in the company.
     *
     * A KEY IS NOT AN ANSWER. The value has to come from the page — an
     * identifier, not a literal. Eighth time in this repository that a
     * check on a NAME was satisfied by something that did not do the job.
     */
    const named = /storeId:\s*(?!null\b|undefined\b|''|"")[A-Za-z_$]/;
    const blind = callers
      .filter((c) => !named.test(c.args))
      .map((c) => `${c.file}  (${/storeId:[^,\n]*/.exec(c.args)?.[0]?.trim() ?? 'لا مفتاح'})`);
    expect(
      blind,
      `صفحةٌ تُحمِّلُ البكسلاتِ بلا أن تَقولَ متجرَها — فتأخذُها كلَّها:\n${blind.join('\n')}`
    ).toEqual([]);
  });

  it('and which country, the same way', () => {
    const named = /countryId:\s*(?!null\b|undefined\b|''|"")[A-Za-z_$]/;
    const blind = callers
      .filter((c) => !named.test(c.args))
      .map((c) => `${c.file}  (${/countryId:[^,\n]*/.exec(c.args)?.[0]?.trim() ?? 'لا مفتاح'})`);
    expect(blind, `صفحةٌ بلا بلد:\n${blind.join('\n')}`).toEqual([]);
  });

  it('and the third argument is REQUIRED, not optional', () => {
    const def = stripComments(read('src/lib/tracking/tracking-config.ts'));
    expect(def, 'أصلُ المنشأِ اختياريٌّ — فالنسيانُ يعني «كلَّ البكسلات»').toMatch(
      /origin: PageOrigin\s*\n?\s*\)/
    );
    expect(def).not.toMatch(/origin\?: PageOrigin/);
  });

  it('and the narrowing is done ONCE, in the pure function', () => {
    /*
     * The same filtering could be a Prisma `where`, and that query would be
     * faster and would be a SECOND copy of the rule — one in SQL, one in
     * `pixelReaches`, and nothing to notice when they disagree. A company
     * has tens of pixels, not thousands.
     */
    const def = stripComments(read('src/lib/tracking/tracking-config.ts'));
    expect(def).toMatch(/pixelReaches\(p, origin\)/);
    expect(def, 'التصفيةُ صارتْ في الاستعلامِ أيضاً — نسختان لقاعدةٍ واحدة').not.toMatch(
      /where: \{[^}]*storeId/
    );
  });
});

describe('Ⅳ · an id from a browser is never a foreign key', () => {
  const scope = stripComments(read('src/lib/tracking/pixel-scope.ts'));

  it('a store id is looked up WITH the company before it is stored', () => {
    /*
     * The real defect a validator prevents here. A store id belonging to
     * another company is a REAL store, so the foreign key accepts it — and
     * the pixel then fires on somebody else's shop and reports their sales
     * into this company's ad account.
     */
    expect(scope).toMatch(/db\.store\.findFirst\(\{ where: \{ id: storeId, companyId \}/);
    expect(scope).toMatch(/db\.country\.findFirst\(\{ where: \{ id: countryId, companyId \}/);
  });

  it('and both doors use that one validator', () => {
    for (const rel of [
      'src/app/api/settings/tracking-pixels/route.ts',
      'src/app/api/settings/tracking-pixels/[id]/route.ts',
    ]) {
      expect(stripComments(read(rel)), `${rel}: لا يمرُّ بالمُتحقِّق`).toMatch(/resolvePixelScope\(companyId/);
    }
  });

  it('and neither door writes the ids straight from the body', () => {
    for (const rel of [
      'src/app/api/settings/tracking-pixels/route.ts',
      'src/app/api/settings/tracking-pixels/[id]/route.ts',
    ]) {
      const src = stripComments(read(rel));
      expect(src, `${rel}: مُعرِّفٌ من الجسمِ يَنزِلُ العمودَ مباشرة`).not.toMatch(
        /storeId: parsed\.data\.storeId|countryId: parsed\.data\.countryId/
      );
    }
  });

  it('and an empty string from a dropdown is «none», not an id', () => {
    expect(scope).toMatch(/input\.storeId\?\.trim\(\) \|\| null/);
  });

  it('and both at once is refused before the database has to', () => {
    expect(scope).toMatch(/if \(storeId && countryId\)/);
  });
});

describe('Ⅴ · the edit door writes both columns or neither', () => {
  const patch = stripComments(read('src/app/api/settings/tracking-pixels/[id]/route.ts'));

  it('asks whether the scope was MENTIONED, which a parsed body cannot say', () => {
    /*
     * An absent key and an explicit `null` both land as nothing in the
     * parsed object, and they mean opposite things: «leave the scope
     * alone» and «make it company-wide». A partial PATCH that guessed
     * would either refuse to widen a scope or silently clear one — the
     * shape this repository has paid for four times.
     */
    expect(patch).toMatch(/hasOwnProperty\.call\(raw, key\)/);
    expect(patch).toMatch(/const scopeMentioned = mentioned\('storeId'\) \|\| mentioned\('countryId'\)/);
  });

  it('and writes them together when it was', () => {
    expect(patch).toMatch(/nextScope = \{ storeId: where\.storeId, countryId: where\.countryId \}/);
    expect(patch).toMatch(/\.\.\.\(nextScope \?\? \{\}\)/);
    // Never one on its own.
    expect(patch, 'عمودٌ واحدٌ يُكتَبُ وحدَه').not.toMatch(
      /\.\.\.\(storeId !== undefined \? \{ storeId \} : \{\}\)/
    );
  });

  it('and the audit row records where it USED to fire', () => {
    // Moving a pixel from one shop to another is the change somebody will
    // later need to date.
    expect(patch).toMatch(/previousData: \{[\s\S]{0,200}storeId: pixel\.storeId/);
  });
});

describe('Ⅵ · and the seller has to say it, in words', () => {
  const screen = read('src/components/settings/TrackingPixelsSection.tsx');

  it('the first option is a sentence, not an absence', () => {
    /*
     * «كل المتاجر» chosen out loud is a different thing from a field nobody
     * filled in, even though the stored row is identical.
     *
     * AND THIS TEST READ THE PROSE THE FIRST TIME. The doc comment above
     * `COMPANY_WIDE` quotes those very words, so replacing the option's
     * label with «—» left the file still containing them and the test
     * green. Seventh instance here of a sweep that reads comments.
     */
    const code = stripComments(screen);
    expect(code, 'الخيارُ الأوّلُ بلا جملة').toMatch(
      /<option value=\{COMPANY_WIDE\}>[^<]*كل المتاجر[^<]*<\/option>/
    );
  });

  it('and a country option says that it covers shops opened later', () => {
    expect(screen).toContain('ومنها ما يُفتح لاحقاً');
  });

  it('and the picker is ONE control, so «both at once» cannot be typed', () => {
    // Two dropdowns would let somebody answer one question twice.
    expect((screen.match(/<WherePicker/g) ?? []).length).toBe(2); // the row and the add form
    expect((screen.match(/function WherePicker/g) ?? []).length).toBe(1);
  });

  it('and every change sends BOTH keys', () => {
    expect(screen).toMatch(/function scopeBody\(value: string\): \{ storeId: string \| null; countryId: string \| null \}/);
    expect(screen).toMatch(/body: JSON\.stringify\(scopeBody\(v\)\)/);
  });

  it('and the choices come from the pixel route, not a second permission', () => {
    /*
     * `/api/geo/stores` would have done, behind `geo.view` — a permission
     * this screen has no other reason to hold. A settings screen that
     * demands a second permission to draw a dropdown goes blank for
     * somebody who may legitimately edit pixels.
     */
    expect(screen, 'الشاشةُ تَطلُبُ صلاحيةً ثانيةً لرسمِ قائمة').not.toMatch(/api\/geo\/stores/);
    const route = stripComments(read('src/app/api/settings/tracking-pixels/route.ts'));
    expect(route).toMatch(/db\.store\.findMany/);
    expect(route).toMatch(/db\.country\.findMany/);
    // Names only — no figures, no secrets.
    expect(route).toMatch(/select: \{ id: true, name: true, countryId: true \}/);
  });
});
