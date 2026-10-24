import { describe, expect, it } from 'vitest';
import { CLAIM_CAPS, pullPermission, pullRefusal } from './confirmation-queue';
import { repoFile, stripComments } from './guard-source';

/**
 * THE PULL BUTTON A SUPERVISOR COULD PRESS AND NEVER USE.
 *
 * `/confirmation/queue` admits two keys — `confirmation.pull` so an agent can
 * work it, and `confirmation.supervise` so somebody can watch the pool. On
 * this database COMPANY_ADMIN, MANAGER and CONFIRMATION_SUPERVISOR hold the
 * second and not the first. The screen drew «اسحب الطلب التالي» enabled for
 * all three, because `canPull` was computed from the claim CAPS alone, and
 * `POST /api/confirmation/pull` answers `confirmation.pull` with a 403.
 *
 * The authority is now asked FIRST, on the server, and the screen is told.
 */

const clear = { total: 0, withoutAttempt: 0 };

describe('may this account pull the next order', () => {
  it('refuses an account that does not hold confirmation.pull, however empty its hands', () => {
    const refusal = pullPermission(false, clear);
    expect(refusal?.code).toBe('NOT_YOUR_DESK');
  });

  it('lets a confirmation agent with nothing in hand through', () => {
    expect(pullPermission(true, clear)).toBeNull();
  });

  /**
   * ORDER MATTERS. Telling a supervisor to «سجّل محاولة اتصال قبل السحب» is
   * advice about a thing she will never be allowed to do, and it reads as
   * «you are one step away» when she is not.
   */
  it('answers the authority before the caps, never the other way round', () => {
    const loaded = { total: CLAIM_CAPS.total, withoutAttempt: CLAIM_CAPS.withoutAttempt };
    expect(pullPermission(false, loaded)?.code).toBe('NOT_YOUR_DESK');
    // And the cap rule itself is untouched for somebody who may pull.
    expect(pullPermission(true, loaded)?.code).toBe('CAP_TOTAL');
    expect(pullRefusal(loaded)?.code).toBe('CAP_TOTAL');
  });

  it('still applies every operational refusal to an agent who may pull', () => {
    expect(pullPermission(true, { total: 1, withoutAttempt: 1 })?.code).toBe('UNTOUCHED_ORDER');
    expect(
      pullPermission(true, { total: 5, withoutAttempt: CLAIM_CAPS.withoutAttempt })?.code
    ).toBe('CAP_WITHOUT_ATTEMPT');
  });

  it('says why in Arabic, not in a code', () => {
    expect(pullPermission(false, clear)?.message).toMatch(/[؀-ۿ]/);
  });
});

describe('the queue route', () => {
  const src = stripComments(repoFile('src/app/api/confirmation/queue/route.ts'));

  it('asks whether this caller holds confirmation.pull and hands the answer to the rule', () => {
    expect(src).toMatch(/pullPermission\(\s*can\(user, 'confirmation\.pull'\)\s*,\s*counts\s*\)/);
  });

  /**
   * The bare cap rule must not be what this route reports. It is the escape
   * the bug came through: `pullRefusal(counts)` alone knows nothing about
   * who is asking.
   */
  it('never reports the cap rule on its own', () => {
    expect(src).not.toMatch(/\bpullRefusal\s*\(/);
  });

  it('and still reports the refusal to the screen beside canPull', () => {
    expect(src).toContain('canPull: !refusal');
    expect(src).toContain('refusal,');
  });
});

describe('the pull endpoint', () => {
  it('remains the enforcer — hiding a button is not a permission', () => {
    const src = stripComments(repoFile('src/app/api/confirmation/pull/route.ts'));
    expect(src).toContain("requirePermission('confirmation.pull')");
  });
});

// The screen half of this — «NOT_YOUR_DESK» draws no button and no caps, a refusal
// keeps the button greyed with its sentence — moved with the pull panel to
// `src/components/confirmation/the-pull-panel.test.tsx`, which RENDERS it instead of
// reading its source for the shape of the JSX.
