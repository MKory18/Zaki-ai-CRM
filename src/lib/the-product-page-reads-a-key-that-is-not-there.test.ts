import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * FOUR COMPLAINTS, ONE MISSING KEY.
 *
 * The owner, 21/10, listed five things about the product page:
 *
 *   «المخزون الي فوق شيله لانو في واحد تحت»
 *   «الخصائص مش شغالة»
 *   «التعديل من داخل صفحة المنتج مش شغال»
 *   «معلومات المنتج وبيانات = معلومات المنتج + المخزون و التكلفة»
 *   «تشغيلات الانتاج مش لازم تكون داخل صفحة المنتج الجاهز والعكس صحيح»
 *
 * Four of them met in one line. `GET /api/products/[id]` answered
 * `{ product, currencyCode }`, and the screen reads `data.analytics`,
 * `product.batches` and `product.orders` — keys that have never existed,
 * since the first commit. So four cards were permanently blank:
 * «أداء المبيعات», «المخزون», «تشغيلات الإنتاج» and «أحدث الطلبات». A
 * blank card reads as «no data», which about a product that has sold for
 * months is a lie the screen tells with a straight face.
 *
 * «الخصائص» was the same shape of mistake one level in: the card read
 * `p.category` off the ENVELOPE rather than `p.product.category`, so it
 * always decided the product had no category and drew «أسنِد له فئةً
 * أولاً». The save button sits behind that branch, so it was never
 * rendered at all.
 *
 * And «التعديل» was not broken: there was no edit form on that page,
 * ever — while the LIST's edit modal sends people there «للتعديل
 * والتبديل والحذف».
 * ═══════════════════════════════════════════════════════════════════════
 */

const door = () => stripComments(repoFile('src/app/api/products/[id]/route.ts'));
const screen = () => stripComments(repoFile('src/components/screens/ProductDetailScreen.tsx'));

describe('the door sends what the screen has always read', () => {
  it('— the analytics the screen asks for on every load', () => {
    const src = door();
    expect(src, 'الشاشة بتقرا analytics والباب ما بيبعتها').toMatch(/analytics: \{/);
    expect(src).toMatch(/totalProduced/);
    expect(src).toMatch(/totalSold/);
    expect(src).toMatch(/totalRemaining/);
  });

  it('and the production runs it draws', () => {
    expect(door()).toMatch(/batches: \{/);
  });

  it('and it counts them with the LIST’s arithmetic, not a second copy', () => {
    /*
     * `productCosts`, `maySeeCost` and `withoutCost` are the list route's.
     * Two places computing «how many were produced» is two answers to one
     * question — and the one on this page would be the one nobody
     * cross-checks against the other.
     */
    const src = door();
    expect(src).toContain('productCosts(db, companyId');
    expect(src).toContain('maySeeCost(user)');
  });

  it('and withholds cost from whoever may not see it — stripped, never zeroed', () => {
    // A zero is a claim, and «this cost nothing» is a false one.
    const src = door();
    expect(src).toMatch(/showCost \? product\.batches : product\.batches\.map\(withoutCost\)/);
    expect(src).toMatch(/\.\.\.\(showCost\s*\?\s*\{ avgCostPerUnit/);
  });
});

describe('and the attributes card reads the product, not the envelope', () => {
  it('— one misread key was the whole of «الخصائص مش شغالة»', () => {
    const src = stripComments(repoFile('src/components/products/ProductAttributes.tsx'));
    expect(src, 'لسّا بتقرا من الظرف').toMatch(/const \{ product: p \} = await apiJson/);
    expect(src, 'بتقرا p.category من فوق').not.toMatch(/apiJson<\{ attributes/);
  });
});

describe('and the page can be edited from the page', () => {
  it('— there is an edit button and the shared dialog behind it', () => {
    const src = screen();
    expect(src).toContain('<ProductEditDialog');
    expect(src).toContain('setEditOpen(true)');
  });

  it('and the list uses the SAME dialog, so the two cannot drift', () => {
    /*
     * It was markup inside `ProductsScreen`, and the detail page — the
     * place that very modal points people to — had none. Lifted out
     * rather than copied.
     */
    const list = stripComments(repoFile('src/components/screens/ProductsScreen.tsx'));
    expect(list).toContain('<ProductEditDialog');
    expect(list, 'نسخة تانية من النموذج ضلّت بالقائمة').not.toContain('handleEditSave');
  });

  it('and the dialog can set the product’s TYPE, which no screen could', () => {
    /*
     * `PATCH /api/products/[id]` has always accepted `sourceType` and no
     * screen ever sent it, so a product created with the wrong type could
     * never be corrected — and it decides which door its stock comes in
     * through and whether this page draws production runs at all.
     */
    const dialog = stripComments(repoFile('src/components/products/ProductEditDialog.tsx'));
    expect(dialog).toContain('sourceType');
    expect(dialog).toContain('PURCHASED');
  });
});

describe('and the page shows each kind of product its own door', () => {
  it('— a bought product draws no production runs', () => {
    expect(screen(), 'كرت التشغيلات بينرسم لكلّ منتج').toMatch(
      /product\.sourceType !== 'PURCHASED' && \(/
    );
  });

  it('and the duplicated stock card is gone — it was the broken copy', () => {
    /*
     * Two cards said «المخزون»: this one, reading the key the door never
     * sent, and the real one below reading `/stock`. The owner asked for
     * the upper one to go, and the upper one was the blank one.
     */
    const src = screen();
    expect(src, 'كرت «المخزون» المكرّر رجع').not.toMatch(/CardHeader title="المخزون" \/>/);
  });

  it('and the numbers live under one heading, with the words above them', () => {
    const stock = stripComments(repoFile('src/components/products/ProductStock.tsx'));
    expect(stock).toContain('معلومات المنتج وبياناته');
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE GUARD THAT WAS MISSING: EVERY KEY THE PAGE READS IS A KEY THE DOOR SENDS.
 *
 * The first four tests above fixed four blank cards one at a time, and each of them asked a question about a SPECIFIC
 * key. Two cards stayed blank anyway — «أداء المبيعات» read `analytics.revenue`, `.netProfit`, `.totalOrders` and
 * `.deliveredOrders`, and «أحدث الطلبات» read `product.orders`, none of which the door has ever sent — and the owner had
 * to ask «أحدث الطلبات على هذا المنتج شغالة؟» to find out, because a test that names the keys it checks cannot find the
 * key nobody thought of.
 *
 * So the question is asked of the page: every `product.<key>` it reads must be a column of the product or a relation the
 * door `include`s; and it reads nothing off `analytics` that the door does not put there. The next card that reads a
 * key the door never sent fails here, before it is drawn blank.
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * The keys of the object literal that follows `marker` in `src` — found by counting braces, not by guessing. `deep` takes
 * the keys of every object nested inside it too (the door writes `...(showCost ? { avgCostPerUnit } : {})`, a key that is
 * sent only to some callers and is still a key the door sends).
 */
function keysOf(src: string, marker: string, deep = false): string[] {
  const at = src.indexOf(marker);
  if (at < 0) return [];
  const open = src.indexOf('{', at + marker.length - 1);
  const keys: string[] = [];
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) break;
    } else if (depth === 1 || (deep && depth > 1)) {
      // `name:` or a shorthand `name,` / `name }` — preceded by whitespace, a comma or a brace, never by `(` or `.`.
      const m = /^([A-Za-z_]\w*)\s*(?=[:,}]|\n)/.exec(src.slice(i));
      const prev = src[i - 1] ?? ' ';
      if (m && /[\s,{]/.test(prev) && src[i - 1] !== '.') keys.push(m[1]);
      if (m) i += m[1].length - 1;
    }
  }
  return keys;
}

describe('every key the page reads is one the door sends', () => {
  const productModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Product')!;
  const columns = productModel.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.name);

  it('— `product.<key>`: a column of the product, or a relation the door includes', () => {
    // The first `include` after the GET's own read — the relations the door reads along with the product.
    // (`findFirst` now: the read is held to this store, which `findUnique` by id alone was not.)
    const get = door().slice(door().indexOf('db.product.findFirst('));
    const included = keysOf(get, 'include: {');
    expect(included.sort(), 'قرأتُ include الباب خطأً').toEqual(['batches', 'category', 'images']);
    const sent = new Set([...columns, ...included]);

    const reads = [...new Set([...screen().matchAll(/\bproduct\.([A-Za-z_]\w*)/g)].map((m) => m[1]))];
    expect(reads.length, 'الشاشة لا تقرأ شيئاً من المنتج؟').toBeGreaterThan(5);
    const unsent = reads.filter((k) => !sent.has(k));
    expect(unsent, `الشاشةُ تقرأ من المنتجِ مفاتيحَ لا يُرسلُها الباب: ${unsent.join('، ')}`).toEqual([]);
  });

  it('and `analytics.<key>`: nothing is read off it that the door does not put there', () => {
    const put = keysOf(door(), 'analytics: {', true);
    expect(put).toEqual(expect.arrayContaining(['totalProduced', 'totalSold', 'totalRemaining']));
    const reads = [...new Set([...screen().matchAll(/\banalytics\??\.([A-Za-z_]\w*)/g)].map((m) => m[1]))];
    const unsent = reads.filter((k) => !put.includes(k));
    expect(unsent, `الشاشةُ تقرأ من analytics ما لا يُرسلُه الباب: ${unsent.join('، ')}`).toEqual([]);
  });

  it('and the two blank cards read their own doors now — nothing is left to a key that was never sent', () => {
    expect(stripComments(repoFile('src/components/products/ProductRecentOrders.tsx'))).toContain('/api/products/');
    expect(stripComments(repoFile('src/components/products/ProductPerformance.tsx'))).toContain('/api/products/grades?ids=');
    expect(screen()).toContain('<ProductPerformance');
    expect(screen()).toContain('<ProductRecentOrders');
  });

  it('and the parser reads what it should: it finds the keys of a literal and ignores what is nested', () => {
    expect(keysOf('x = { a: 1, b: { c: 2 }, d: [1] }', '= {')).toEqual(['a', 'b', 'd']);
    expect(keysOf('x = { a, b: { c: 2 }, ...(on ? { e: 1 } : {}) }', '= {', true).sort()).toEqual(['a', 'b', 'c', 'e']);
    expect(keysOf('nothing here', '= {')).toEqual([]);
  });
});
