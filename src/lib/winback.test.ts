import { describe, expect, it } from 'vitest';
import { REJECTION_REASONS } from './confirmation-workflow';
import { repoFile, stripComments } from './guard-source';
import {
  maxWinbackDiscount,
  NOT_WINBACK_AR,
  WINBACK_COOLING_DAYS,
  WINBACK_MAX_DISCOUNT_SHARE,
  WINBACK_REASONS,
  winbackVerdict,
  type WinbackSource,
} from './winback';

/**
 * ASKING A SECOND TIME — AND KNOWING WHOM NOT TO ASK.
 *
 * Some orders are lost for a reason that stops being true: a price is
 * answered by a discount, a change of mind by time, three unanswered calls
 * by the fact that we never reached anybody. Most are not, and ringing
 * those is worse than leaving them alone — a duplicate means the customer
 * already has the goods, a refusal is an answer, and a wrong number reaches
 * nobody the second time either.
 *
 * So the rule is spelled out reason by reason rather than as a subtraction,
 * and the guard below fails when a reason is added to the vocabulary and
 * nobody decides which side of it that reason is on.
 */

const route = () => stripComments(repoFile('src/app/api/confirmation/winback/route.ts'));
const screen = () => stripComments(repoFile('src/components/screens/WinbackScreen.tsx'));

const DAY = 86_400_000;
const NOW = new Date('2026-09-27T09:00:00.000Z');
const long = new Date(NOW.getTime() - 40 * DAY);

const base: WinbackSource = {
  confirmationStatus: 'REJECTED',
  rejectionReason: 'PRICE_TOO_HIGH',
  rejectedAt: long,
  shippedAt: null,
  replacedByOrderNumber: null,
  sellingPrice: 100,
  discountAmount: 0,
};

describe('every rejection reason is decided, one way or the other', () => {
  /**
   * The one that matters most. A reason added to `REJECTION_REASONS` with no
   * entry on either list would silently fall to «لا يُعاد عليه» with the
   * generic sentence — a rule nobody chose, applied to real customers.
   */
  it('and none falls through unnamed', () => {
    for (const r of REJECTION_REASONS) {
      const winnable = (WINBACK_REASONS as readonly string[]).includes(r);
      if (winnable) {
        expect(NOT_WINBACK_AR[r], `${r} على القائمتين معاً`).toBeUndefined();
      } else {
        expect(NOT_WINBACK_AR[r], `${r} مستبعَدٌ بلا سببٍ مكتوب`).toBeTruthy();
      }
    }
  });

  /** Exactly the four the request named, refused for the reasons it gave. */
  it('excludes the duplicate, the refusal, the bad data and the uncovered area', () => {
    for (const r of [
      'DUPLICATE_ORDER',
      'CUSTOMER_DOES_NOT_WANT_PRODUCT',
      'WRONG_NUMBER',
      'FAKE_ORDER',
      'MODERATOR_DATA_ERROR',
      'OUT_OF_SERVICE_AREA',
      'OTHER',
    ]) {
      expect(WINBACK_REASONS, `${r} يُعاد عليه`).not.toContain(r);
      const v = winbackVerdict({ ...base, rejectionReason: r }, NOW);
      expect(v.eligible).toBe(false);
      if (!v.eligible) expect(v.code).toBe('REASON_NOT_WINBACK');
    }
  });

  it('and keeps the three that time or a price answers', () => {
    expect(WINBACK_REASONS).toEqual(['PRICE_TOO_HIGH', 'CUSTOMER_CHANGED_MIND', 'NO_ANSWER_3_ATTEMPTS']);
    for (const r of WINBACK_REASONS) {
      expect(winbackVerdict({ ...base, rejectionReason: r }, NOW).eligible, r).toBe(true);
    }
  });
});

describe('and the other four gates', () => {
  it('refuses one that is not rejected at all', () => {
    const v = winbackVerdict({ ...base, confirmationStatus: 'CONFIRMED' }, NOW);
    expect(v.eligible).toBe(false);
    if (!v.eligible) expect(v.code).toBe('NOT_REJECTED');
  });

  /** A parcel that went out and came back is a return, with its own bill. */
  it('refuses one that already shipped', () => {
    const v = winbackVerdict({ ...base, shippedAt: new Date('2026-09-01') }, NOW);
    expect(v.eligible, 'يعرض خصماً على شحنةٍ رجعت').toBe(false);
    if (!v.eligible) expect(v.code).toBe('ALREADY_SHIPPED');
  });

  /** Somebody who said no twice has answered twice. */
  it('refuses one already offered, and names the order that was raised', () => {
    const v = winbackVerdict({ ...base, replacedByOrderNumber: 'SY-0099' }, NOW);
    expect(v.eligible).toBe(false);
    if (!v.eligible) {
      expect(v.code).toBe('ALREADY_OFFERED');
      expect(v.reason).toContain('SY-0099');
    }
  });

  /**
   * THE COOLING PERIOD, AND ITS EDGE.
   *
   * Rung back on Thursday about Tuesday's no, the customer has been
   * pestered rather than won back.
   */
  it('refuses one still inside the cooling period, and says when it is due', () => {
    const fresh = new Date(NOW.getTime() - 3 * DAY);
    const v = winbackVerdict({ ...base, rejectedAt: fresh }, NOW);
    expect(v.eligible).toBe(false);
    if (!v.eligible) {
      expect(v.code).toBe('COOLING');
      expect(v.dueAt?.getTime()).toBe(fresh.getTime() + WINBACK_COOLING_DAYS * DAY);
    }
  });

  it('and allows it the moment the period is up, not a day later', () => {
    const exactly = new Date(NOW.getTime() - WINBACK_COOLING_DAYS * DAY);
    expect(winbackVerdict({ ...base, rejectedAt: exactly }, NOW).eligible).toBe(true);
    const oneShort = new Date(NOW.getTime() - WINBACK_COOLING_DAYS * DAY + 1000);
    expect(winbackVerdict({ ...base, rejectedAt: oneShort }, NOW).eligible).toBe(false);
  });

  it('refuses one with no rejection date rather than guessing', () => {
    const v = winbackVerdict({ ...base, rejectedAt: null }, NOW);
    expect(v.eligible).toBe(false);
    if (!v.eligible) expect(v.code).toBe('NO_DATE');
  });
});

describe('the discount has a ceiling, and it counts what was already given', () => {
  it('a quarter of the price', () => {
    expect(WINBACK_MAX_DISCOUNT_SHARE).toBe(0.25);
    expect(maxWinbackDiscount({ sellingPrice: 100, discountAmount: 0 })).toBe(25);
  });

  /**
   * Otherwise an order discounted by five before rejection could take a
   * fresh quarter on top, and two people each keeping to the rule would
   * give away a third of the price between them.
   */
  it('less whatever came off before', () => {
    expect(maxWinbackDiscount({ sellingPrice: 100, discountAmount: 10 }), 'الخصمُ السابق لم يُحسب').toBe(15);
    expect(maxWinbackDiscount({ sellingPrice: 100, discountAmount: 40 }), 'سقفٌ سالب').toBe(0);
  });

  it('and the verdict carries it, so the screen never offers more', () => {
    const v = winbackVerdict({ ...base, sellingPrice: 80, discountAmount: 5 }, NOW);
    expect(v.eligible).toBe(true);
    if (v.eligible) expect(v.maxDiscount).toBe(15);
  });
});

describe('the offer raises a new order and leaves the loss where it is', () => {
  /**
   * Reviving the rejected order is the shorter code and the wrong record:
   * every report that reads `confirmationStatus` would show fewer
   * rejections the harder we worked at winning them back.
   */
  it('creates rather than revives', () => {
    const src = route();
    expect(src).toContain('tx.order.create');
    expect(src).toContain('replacesOrderId: order.id');
    expect(src, 'أعاد الملغى إلى الحياة فمحا الخسارة').not.toMatch(
      /order\.update\([\s\S]{0,300}confirmationStatus: 'NEW'/
    );
  });

  it('and the new one lands in the ordinary pool, held by nobody', () => {
    const src = route();
    expect(src).toContain("confirmationStatus: 'NEW'");
    expect(src).toContain("shippingStatus: 'NOT_READY'");
    // No second queue: nothing here claims it for anyone.
    expect(src).not.toContain('claimedById:');
  });

  /** `replacesOrderId` is `@unique`, so the database refuses the second offer. */
  it('once only, and the database is what enforces it', () => {
    expect(stripComments(repoFile('prisma/schema.prisma'))).toMatch(
      /replacesOrderId\s+String\?\s+@unique/
    );
  });

  /** A row eligible when the screen loaded may not be when the button lands. */
  it('re-takes the whole verdict on the server before writing', () => {
    const post = route().slice(route().indexOf('export async function POST'));
    expect(post, 'يثق بما قرّرته الشاشة').toMatch(/if \(!verdict\.eligible\) \{/);
    expect(post).toMatch(/if \(discount > ceiling\) \{/);
    expect(post).toContain('DISCOUNT_TOO_LARGE');
  });

  /**
   * THE REJECTION DATE COMES FROM THE STATUS LOG.
   *
   * The order carries no rejection timestamp, and `updatedAt` is not one: a
   * note added yesterday would reset the customer's cooling period to
   * yesterday and hide them for another fortnight.
   */
  it('and reads when it was closed from the log, not from updatedAt', () => {
    const src = route();
    expect(src).toContain("statusType: 'CONFIRMATION'");
    expect(src).toContain("newValue: 'REJECTED'");
    expect(src, 'اعتمد على updatedAt').not.toContain('updatedAt');
  });

  it('is money, so it is gated and written down', () => {
    const src = route();
    // BOTH HALVES, separately. The permission is written twice — once to
    // list and once to offer — so reading the whole file passed with either
    // one deleted, which is how the first version of this guard let the
    // offer itself go ungated.
    const at = src.indexOf('export async function POST');
    const list = src.slice(0, at);
    const post = src.slice(at);
    expect(list, 'القائمة مفتوحة').toContain("requirePermission('confirmation.supervise')");
    expect(post, 'العرض مفتوح لأيّ موظّف').toContain("requirePermission('confirmation.supervise')");
    expect(post).toContain("action: 'WINBACK_OFFERED'");
    expect(post).toContain('orderNote.create');
  });
});

describe('and the screen teaches the rule instead of hiding it', () => {
  /**
   * A supervisor who remembers rejecting an order and cannot find it here
   * concludes the screen is broken, not that the rule excluded it.
   */
  it('shows the refused ones with the reason, behind a switch', () => {
    const src = screen();
    expect(src).toContain('لا يُعاد عليه — ولماذا');
    expect(src).toMatch(/showSkipped/);
    expect(route()).toContain("searchParams.get('all') === '1'");
    // The default view is the work, not the lecture.
    expect(route()).toContain('skipped: showAll ?');
  });

  it('and never offers more than the ceiling the server sent', () => {
    const src = screen();
    expect(src).toMatch(/const max = r\.verdict\.maxDiscount;/);
    expect(src, 'الشاشة تقبل أيّ رقم').toMatch(/discount > max/);
  });

  it('borrows its heading from the registry, like every other screen', () => {
    expect(screen()).toContain('<ScreenTitle');
    expect(screen(), 'عنوانٌ مكتوبٌ في الشاشة يخالف القائمة').not.toMatch(/ScreenTitle[\s\S]{0,80}title=/);
    expect(stripComments(repoFile('src/lib/route-registry.ts'))).toContain("r('/confirmation/winback'");
  });

  it('and says why it is empty when it is', () => {
    expect(screen()).toContain('<EmptyState');
    expect(screen()).toContain('لا طلبَ جاهزاً لمحاولةٍ ثانية');
  });
});
