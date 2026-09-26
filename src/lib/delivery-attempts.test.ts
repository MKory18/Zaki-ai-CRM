import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import {
  ATTEMPT_RESULT_AR,
  DELIVERY_ATTEMPT_RESULTS,
  DELIVERY_FAILURE_REASONS,
  attemptForShippingStatus,
} from './shipping-workflow';

/**
 * A TABLE NAMED «ATTEMPTS» THAT HELD ONLY FAILURES.
 *
 * Measured: 0 rows in `delivery_attempts` against 166 orders. Three things
 * end a delivery and none of them wrote there — the manual transition, the
 * door-side partial delivery, and the courier feed (which is correctly
 * forbidden from asserting a delivery at all). The only writer was the
 * browser: the failure modal POSTed an attempt and then PATCHed the
 * transition, as two requests.
 *
 * So the successes were never recorded. «Delivered on the first knock» and
 * «attempts per delivery» — the two numbers that say whether a courier is
 * any good — were not computable from the table built to hold them, and the
 * count shown on the tracking screen as «محاولات» was a count of failures.
 */

describe('every delivery outcome', () => {
  /**
   * BOTH HUMAN PATHS RECORD THE KNOCK, IN THEIR OWN TRANSACTION.
   *
   * Not in the browser. An append-only audit row written by a client can
   * outlive the transition it describes — the request pair is not atomic,
   * and the second half can fail or simply never be sent.
   */
  /**
   * BOTH OF THESE WERE VACUOUS IN THEIR FIRST VERSION.
   *
   * They checked that the file CONTAINED the words `appendDeliveryAttempt` —
   * which `if (knock && false) await appendDeliveryAttempt(...)` contains
   * just as well. The mutation run said MISSED twice, which is the only
   * reason either of them is worth anything now.
   *
   * The door-side path moved to a real test with a fake transaction:
   * `partial-delivery-attempt.test.ts`. This one stays textual because a
   * Next route handler is not callable without the whole request pipeline —
   * so it pins the exact SHAPE instead of the presence of a name, and the
   * end-to-end proof is in the browser.
   */
  it('is recorded by the transition that causes it, not by the browser', () => {
    const route = stripComments(repoFile('src/app/api/orders/[id]/shipping/route.ts'));
    const tx = route.slice(route.indexOf('await db.$transaction'));
    expect(tx, 'المحاولة لا تُكتب داخل معاملة الانتقال، أو صارت وراء شرطٍ آخر').toMatch(
      /if \(knock\) \{\s*await appendDeliveryAttempt\(tx, \{/
    );
    expect(tx, 'المحاولة لم تُشتقّ من الحالة الجديدة').toMatch(
      /const knock = newShippingStatus\s*\?\s*attemptForShippingStatus\(/
    );
  });

  /**
   * ONE WRITER. A second `deliveryAttempt.create` anywhere is a second
   * numbering scheme, and `attemptNumber` is what orders the history.
   */
  it('goes through the one function that appends a row', () => {
    const offenders: string[] = [];
    for (const rel of [
      'src/app/api/orders/[id]/shipping/route.ts',
      'src/app/api/orders/[id]/delivery-attempts/route.ts',
      'src/lib/partial-delivery.ts',
    ]) {
      if (/deliveryAttempt\.create\(/.test(stripComments(repoFile(rel)))) offenders.push(rel);
    }
    expect(offenders, `يكتب صفَّ محاولةٍ بنفسه:\n${offenders.join('\n')}`).toEqual([]);
    expect(stripComments(repoFile('src/lib/delivery-attempts.ts'))).toContain('deliveryAttempt.create(');
  });

  it('and the screen no longer writes one alongside a transition', () => {
    const screen = stripComments(repoFile('src/components/orders/ShippingSection.tsx'));
    expect(screen, 'المتصفّح ما زال يسجّل المحاولة مع الانتقال — تُكتب مرّتين').not.toMatch(
      /recordAttempt\(\s*'FAILED'\s*\)/
    );
  });
});

describe('the attempt a status implies', () => {
  it('is the delivery itself, which was the half that never got written', () => {
    expect(attemptForShippingStatus('DELIVERED')).toEqual({ result: 'DELIVERED', failureReason: null });
    expect(attemptForShippingStatus('PARTIALLY_DELIVERED')).toEqual({
      result: 'PARTIALLY_DELIVERED',
      failureReason: null,
    });
  });

  it('carries the structured reason on a failure, and never an empty one', () => {
    expect(attemptForShippingStatus('FAILED_DELIVERY', { failureReason: 'WRONG_ADDRESS' })).toEqual({
      result: 'FAILED',
      failureReason: 'WRONG_ADDRESS',
    });
    // The schema requires a reason for a failure; OTHER is the honest
    // fallback rather than null, which the column would refuse.
    expect(attemptForShippingStatus('FAILED_DELIVERY')!.failureReason).toBe('OTHER');
  });

  /**
   * A PARCEL COMING BACK IS NOT ANOTHER KNOCK.
   *
   * RETURNED follows RETURN_REQUESTED and happens at a warehouse. Counting
   * it as an attempt would inflate «attempts per delivery» by one for every
   * return — the exact metric this table exists to make honest.
   */
  it('is nothing for a warehouse event or a move that is still in flight', () => {
    for (const status of ['RETURNED', 'RETURN_REQUESTED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'CANCELLED', 'PACKING']) {
      expect(attemptForShippingStatus(status), `${status} ولّد محاولة`).toBeNull();
    }
  });
});

describe('the result vocabulary', () => {
  /**
   * WHAT HAPPENED TO THE PARCEL, NEVER WHY.
   *
   * The list used to hold `CUSTOMER_UNAVAILABLE` and `CUSTOMER_REFUSED`
   * while the reason list holds `CUSTOMER_NOT_AVAILABLE` and
   * `CUSTOMER_REFUSED` — two vocabularies for one event, in two spellings.
   * That is not a tidiness complaint: it is why the screen shipped a
   * translation map containing the reason spelling, which could not read a
   * row written with the result spelling and printed the raw English
   * constant to an Arabic reader.
   */
  it('says nothing about the customer — that is what failureReason is for', () => {
    const leaks = (DELIVERY_ATTEMPT_RESULTS as readonly string[]).filter((r) => /CUSTOMER/.test(r));
    expect(leaks, `رمزُ نتيجةٍ يتحدّث عن سبب: ${leaks.join('، ')}`).toEqual([]);
  });

  it('shares nothing with the reason list but the catch-all', () => {
    const reasons = new Set<string>(DELIVERY_FAILURE_REASONS as readonly string[]);
    const shared = (DELIVERY_ATTEMPT_RESULTS as readonly string[]).filter(
      (r) => reasons.has(r) && r !== 'OTHER'
    );
    expect(shared, `رمزٌ واحدٌ في قائمتَين: ${shared.join('، ')}`).toEqual([]);
  });

  /**
   * EVERY CODE READS AS A WORD.
   *
   * Including the two retired ones. `delivery_attempts` is empty on this
   * database so narrowing the writable list costs nothing here — but this is
   * a dev database and production is not mine to see, so an old row must
   * still render as Arabic rather than as an English constant.
   */
  it('reads in Arabic — every writable code, and the retired ones too', () => {
    for (const r of DELIVERY_ATTEMPT_RESULTS) {
      expect(ATTEMPT_RESULT_AR[r], `${r} بلا ترجمة`).toBeTruthy();
    }
    for (const retired of ['CUSTOMER_UNAVAILABLE', 'CUSTOMER_REFUSED']) {
      expect(ATTEMPT_RESULT_AR[retired], `${retired} صفٌّ قديم يُقرأ بالإنجليزيّة`).toBeTruthy();
    }
  });

  it('and the screen reads that one map rather than a copy of it', () => {
    const screen = stripComments(repoFile('src/components/orders/ShippingSection.tsx'));
    expect(screen).toMatch(/import\s*\{[^}]*ATTEMPT_RESULT_AR[^}]*\}\s*from '@\/lib\/shipping-workflow'/);
    expect(screen, 'نسخةٌ محليّةٌ من القاموس ستفترق عن الأصل').not.toMatch(
      /const ATTEMPT_RESULT_AR[^=]*=/
    );
  });
});

/**
 * AND THE ATTEMPT THAT IS NOT AN OUTCOME.
 *
 * «Knocked, nobody home, coming back tomorrow» is most of what a hard round
 * is, and it does not end the order — so it had no transition button, and
 * therefore no way into the product. The endpoint for it existed and nothing
 * could reach it, which is the same shape of defect as the categories: a
 * capability nobody can reach is indistinguishable from a broken one.
 */
describe('an attempt without an outcome', () => {
  it('has a way in', () => {
    const screen = stripComments(repoFile('src/components/orders/ShippingSection.tsx'));
    expect(screen, 'لا زرَّ لتسجيل محاولةٍ لم تُنهِ الطلب').toContain("setOpenForm('attempt')");
    expect(screen).toContain("openForm === 'attempt'");
    // Only results that leave the order out for delivery. A delivery that
    // truly failed belongs on the transition, which records the attempt too
    // — offering it twice would make the two disagree.
    const modal = screen.slice(screen.indexOf("openForm === 'attempt'"));
    const form = modal.slice(0, modal.indexOf('</Modal>'));
    expect(form).toContain('RESCHEDULED');
    expect(form, 'نتيجةٌ نهائيّةٌ معروضةٌ في مكانَين').not.toContain('value="DELIVERED"');
    expect(form, 'نتيجةٌ نهائيّةٌ معروضةٌ في مكانَين').not.toContain('value="FAILED"');
  });
});
