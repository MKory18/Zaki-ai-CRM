import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { REJECTION_REASONS } from './confirmation-workflow';

/**
 * A FAKE ORDER IS A PHONE, NOT JUST A ROW.
 *
 * The blacklist was complete and correct: the model, the release-only
 * history, and enforcement on all four intake doors — the direct order, the
 * AI intake, the storefront and Telegram. Nothing ever put anybody ON it
 * except somebody opening `/control/blacklist` and typing a number.
 *
 * So the moment a fake is actually identified — «طلب وهميّ», the one
 * rejection reason that accuses nobody of changing their mind — stopping the
 * next one was a separate errand on another screen. After the twentieth call
 * of the day nobody runs it, the list stays empty, and the same number
 * orders again on Tuesday.
 */

const route = () => stripComments(repoFile('src/app/api/orders/[id]/confirmation/route.ts'));
const list = () => stripComments(repoFile('src/lib/blacklist.ts'));

describe('rejecting an order as fake blocks the phone', () => {
  it('at the moment of rejection, not as a second errand', () => {
    const src = route();
    expect(src, 'الرفض لا يصل القائمة السوداء').toMatch(
      /if \(target === 'REJECTED' && rejectionReason === 'FAKE_ORDER'\) \{/
    );
    expect(src).toContain('await blockPhone(db, {');
  });

  /**
   * ONLY THIS ONE. A wrong number is our typing, an entry error is our own
   * mistake, and «لا يريد المنتج» is a customer exercising a choice. None is
   * a reason to stop somebody buying.
   */
  it('and only for that reason, never for the ones that blame nobody', () => {
    const src = route();
    const at = src.indexOf("rejectionReason === 'FAKE_ORDER'");
    const branch = src.slice(at, at + 1800);
    for (const r of ['WRONG_NUMBER', 'MODERATOR_DATA_ERROR', 'CUSTOMER_DOES_NOT_WANT_PRODUCT', 'DUPLICATE_ORDER']) {
      expect(branch, `${r} يحظر العميل`).not.toContain(r);
    }
    expect(REJECTION_REASONS).toContain('FAKE_ORDER');
  });

  /**
   * THE PHONE IS READ, NOT REACHED FOR.
   *
   * `assertOrderAccess` loads the order's own columns and no relations, so
   * `order.customer` is undefined. A first version of this branch read it
   * from there: it typechecked perfectly and would never have blocked
   * anybody — a silent no-op shaped exactly like a working feature.
   */
  it('reading the phone from the customer row', () => {
    const src = route();
    expect(src, 'يقرأ علاقةً غير مُحمَّلة').not.toMatch(/\(order as \{ customer\?:/);
    expect(src).toMatch(/await db\.customer\.findUnique\(\{\s*where: \{ id: order\.customerId \}/);
    expect(src).toMatch(/if \(customer\?\.phone\) \{/);
  });

  /** The order WAS rejected. That is committed, and nothing here undoes it. */
  it('and never fails the rejection it followed', () => {
    const src = route();
    const at = src.indexOf("rejectionReason === 'FAKE_ORDER'");
    const branch = src.slice(at, at + 1800);
    expect(branch, 'الحظر يُسقط الرفض').toMatch(/catch \(e\) \{/);
    expect(branch).toContain('if (!(e instanceof AlreadyBlocked))');
    // And it runs after the transaction, not inside it.
    expect(src.indexOf("target === 'REJECTED' && rejectionReason === 'FAKE_ORDER'")).toBeGreaterThan(
      src.indexOf('await logAudit({')
    );
  });

  it('carrying the order it came from, so the block can be argued with', () => {
    const src = route();
    expect(src).toMatch(/reason: `طلب وهميّ — \$\{order\.orderNumber\}/);
    expect(src).toContain("action: 'CUSTOMER_BLOCKED_ON_FAKE_ORDER'");
  });
});

describe('and the list it lands on already stops the next order', () => {
  /** A block nobody enforces is a note. */
  it('at every door an order can come in through', () => {
    for (const [name, path] of [
      ['المباشر', 'src/app/api/orders/route.ts'],
      ['الذكاء', 'src/app/api/orders/ai-intake/route.ts'],
      ['واجهة المتجر', 'src/lib/public-order.ts'],
      ['تلغرام', 'src/lib/telegram/inbound.ts'],
    ] as const) {
      const src = stripComments(repoFile(path));
      expect(src, `${name} لا يفحص القائمة السوداء`).toMatch(/activeBlock\(|isBlocked\(/);
    }
  });

  /** A block that can be walked around by typing +963 instead of 0 is not one. */
  it('matched on the canonical phone, and never deleted — only released', () => {
    const src = list();
    // BOTH SIDES. `canonicalPhone` is called when a block is matched and
    // when one is written, and reading the file for the word passed with
    // the WRITE side raw — which is the half that lets «+963 …» and
    // «0…» become two different blocks on one person.
    for (const fn of ['export async function activeBlock', 'export async function blockPhone']) {
      const at = src.indexOf(fn);
      expect(at, `${fn} غير موجودة`).toBeGreaterThan(-1);
      expect(src.slice(at, at + 400), `${fn} لا تُوحّد الرقم`).toContain('canonicalPhone(');
    }
    expect(src).toContain('export async function releaseBlock');
    expect(src, 'الحظر يُحذف بدل أن يُرفع').not.toContain('customerBlock.delete');
  });
});
