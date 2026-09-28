import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * THREE BUTTONS AT THE DOOR, AND NONE OF THEM MOVES MONEY.
 *
 * Asked for twice: «تسجيل التسليم في خانة المتابعة هي إشعار فقط… و٣ أزرار
 * الرفض أو الملغي واستلم والملاحظة الداخلية».
 *
 * What was there was ONE «تسجيل التسليم» that opened a dialog and asked
 * which lines were taken. Almost every parcel is all of it or none of it,
 * so the common answer cost a dialog and a line list to give. The partial
 * case is real and keeps the dialog — one tap further, from the same row.
 *
 * AND THE DOOR STILL WRITES ONLY WHAT HAPPENED. The collected amount is
 * written when the courier's statement is matched; that ruling is older
 * than these buttons and neither of them may quietly undo it.
 */

const screen = () => stripComments(repoFile('src/components/screens/TrackingScreen.tsx'));
const route = () => stripComments(repoFile('src/app/api/ops/tracking/deliver/route.ts'));

describe('the three controls on a shipped row', () => {
  it('are received, refused and the internal note', () => {
    const src = screen();
    expect(src).toMatch(/settle\(o, 'ALL'\)/);
    expect(src).toMatch(/settle\(o, 'NONE'\)/);
    expect(src).toMatch(/void addNote\(o\)/);
    expect(src).toContain('رفض / ملغى');
    // The rare one is still reachable, and still the line-by-line dialog.
    expect(src).toMatch(/setDeliverFor\(o\)/);
    expect(src).toContain('استلم جزءاً');
  });

  it('and refusing asks first, because it makes the order a return', () => {
    const src = screen();
    expect(src).toMatch(/outcome === 'NONE'[\s\S]{0,200}confirm\(\{/);
    // And says the thing people get wrong: stock does not come back yet.
    expect(src).toMatch(/لا تعود إلى المخزون الآن/);
  });

  it('and both go through the one endpoint that knows the fee rule', () => {
    const src = screen();
    const at = src.indexOf('const settle');
    const body = src.slice(at, src.indexOf('\n  const ', at + 10));
    expect(body).toContain("'/api/ops/tracking/deliver'");
    // A second settlement path is how two fee rules are born.
    expect(body, 'يكتب الحالة بنفسه بدل المرور بالباب').not.toMatch(/shippingStatus:/);
  });
});

describe('the outcome shorthand', () => {
  it('is expanded from the order’s own lines, never from the request', () => {
    const src = route();
    expect(src).toMatch(/outcome: z\.enum\(\['ALL', 'NONE'\]\)/);
    expect(src).toMatch(/db\.orderItem\.findMany\(\{[\s\S]{0,140}orderId: asked\.orderId/);
    // «All of it» means every unit the order HAS.
    expect(src).toMatch(/asked\.outcome === 'ALL' \? i\.quantity \+ i\.freeQuantity : 0/);
    // Scoped to the company, like every other read.
    expect(src).toMatch(/order: \{ companyId \}/);
  });

  it('and still runs the one settlement function', () => {
    const src = route();
    expect(src).toMatch(/recordPartialDelivery\(tx, \{/);
    // One call, not one per shape — three endpoints would be three fee rules.
    expect((src.match(/recordPartialDelivery\(/g) ?? []).length).toBe(1);
  });

  it('and the door writes no collected amount onto the order', () => {
    // The ruling this system already made: the statement writes the money.
    // Asserted against the ORDER UPDATE, not the file — the figure is
    // computed and reported, and a blunter check matched its own type.
    const settle = stripComments(repoFile('src/lib/partial-delivery.ts'));
    const at = settle.indexOf('tx.order.update(');
    const block = settle.slice(at, settle.indexOf('});', at));
    expect(at, 'لا تحديثَ للطلب أصلاً').toBeGreaterThan(-1);
    expect(block, 'البابُ يكتب المال — والكشفُ هو من يكتبه').not.toContain('collectedAmount');
    expect(block).toContain('shippingStatus: status');
  });
});
