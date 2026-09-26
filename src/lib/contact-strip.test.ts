import { describe, expect, it } from 'vitest';
import { CONTACT_RESULTS } from './confirmation-workflow';
import { dashboardFiles, repoFile, stripComments } from './guard-source';

/**
 * REACHING A CUSTOMER, FROM THE SCREEN WHOSE WHOLE JOB IS REACHING THEM.
 *
 * «طلباتي» had two hand-rolled buttons and both were poorer for it. The
 * WhatsApp one opened NOTHING — it recorded a contact and left the agent to
 * find the customer in WhatsApp themselves — and there was no SMS at all, on
 * the one screen where the work is making contact.
 *
 * `ContactButtons` already carried the ready-made messages, filtered by
 * channel and filled with the order's own words, and two other screens
 * already used it. The templates were never missing; this screen was not
 * asking for them.
 */

describe('the contact strip', () => {
  it('is the shared one, on the screen that needs it most', () => {
    const screen = stripComments(repoFile('src/components/screens/ConfirmationMineScreen.tsx'));
    expect(screen, 'شاشة «طلباتي» لا تستعمل شريط الاتصال المشترك').toContain('<ContactButtons');
    // And the hand-rolled pair is gone, not left beside it.
    expect(screen, 'ما زال فيها زرُّ واتساب مكتوبٌ باليد').not.toMatch(
      /logAttempt\(order, 'WHATSAPP', 'ANSWERED'\)/
    );
    expect(screen, 'ما زال فيها اتّصالٌ مكتوبٌ باليد').not.toContain('const callCustomer');
  });

  it('and carries this order’s own words into the message', () => {
    const screen = stripComments(repoFile('src/components/screens/ConfirmationMineScreen.tsx'));
    const call = screen.slice(screen.indexOf('<ContactButtons'), screen.indexOf('/>', screen.indexOf('<ContactButtons')));
    for (const field of ['orderNumber', 'customerName', 'amount']) {
      expect(call, `القالب بلا ${field}`).toContain(field);
    }
  });

  /**
   * A SENT MESSAGE IS NOT AN ANSWER.
   *
   * Filing it as `ANSWERED` would inflate the answer rate — the number that
   * decides whether the problem is the script or the hour of the day — with
   * messages nobody has replied to. So it has its own result.
   */
  it('records a sent message as sent, never as answered', () => {
    expect(CONTACT_RESULTS).toContain('MESSAGE_SENT');
    const screen = stripComments(repoFile('src/components/screens/ConfirmationMineScreen.tsx'));
    expect(screen).toMatch(/method === 'PHONE' \? 'ANSWERED' : 'MESSAGE_SENT'/);
  });

  /**
   * AND IT NEVER COUNTS TOWARD THE THREE-STRIKE CLOSE.
   *
   * That counter reads NO_ANSWER and BUSY. Closing an order because three
   * messages were sent would punish the agent for trying twice more.
   */
  it('and a sent message never closes an order', () => {
    const route = stripComments(repoFile('src/app/api/orders/[id]/contact-attempts/route.ts'));
    const counted = /result: \{ in: \[([^\]]*)\] \}/.exec(route);
    expect(counted, 'لا عدّاد محاولات').toBeTruthy();
    expect(counted![1], 'الرسالة المُرسَلة تُحسب محاولةً بلا ردّ').not.toContain('MESSAGE_SENT');
  });

  /** The strip reports what left, so a counter somewhere can hear it. */
  it('tells the caller what actually left', () => {
    const src = stripComments(repoFile('src/components/orders/ContactButtons.tsx'));
    expect(src).toContain("onContacted?: (method: 'PHONE' | 'SMS' | 'WHATSAPP') => void");
    // On all three doors: the dial, the template send, and the empty WhatsApp.
    expect((src.match(/onContacted\?\.\(/g) ?? []).length).toBe(3);
  });

  /**
   * AND NO SCREEN BUILDS ITS OWN.
   *
   * A `sms:` or `wa.me` link written into a screen is a screen that will not
   * have the templates, will not report the contact, and will not know that
   * a desktop browser cannot send an SMS.
   */
  it('and no screen hand-writes a message link of its own', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboardFiles()) {
      if (rel.endsWith('/ContactButtons.tsx')) continue;
      const body = stripComments(src);
      if (/`sms:\$\{/.test(body) || /wa\.me\//.test(body)) offenders.push(rel);
    }
    expect(offenders, `رابط رسالة مكتوب في شاشة:\n${offenders.join('\n')}`).toEqual([]);
  });
});
