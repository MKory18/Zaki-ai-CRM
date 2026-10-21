import { describe, expect, it } from 'vitest';
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
