import { describe, expect, it } from 'vitest';
import { CONTACT_RESULTS, NO_ANSWER_LIMIT, NO_ANSWER_RESULTS } from './confirmation-workflow';
import { CONTACT_FIRST_ACTIONS, needsContactFirst } from './confirmation-queue';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE PHONE THAT CANNOT RING, AND THE DOOR THAT WAS LEFT OPEN.
 *
 * Two things the owner watched an agent hit.
 *
 * ── A PHONE THAT IS OFF HAD NO WORD ──
 *
 * She rings, hears the network's own recording, and has to file it as
 * `NO_ANSWER` — which says the customer did not pick up, a different fact
 * about a different person. The two read the same in a counter and
 * differently to whoever opens the order next: one is somebody ignoring
 * the phone, the other is what a wrong digit looks like.
 *
 * ── AND THE COUNTER AND THE CLOSE DISAGREED ──
 *
 * The counter read `['NO_ANSWER', 'BUSY']` and the close fired only on
 * `NO_ANSWER`. So an order whose third attempt was busy reached «3/3» and
 * closed nothing, and sat there with no door out of it. One list now.
 *
 * ── AND «افتح وعدّل» WAS THE WAY AROUND THE OTHER THREE ──
 *
 * «تأكيد» and «تأجيل» and «ألغِ» have been locked until the order carries
 * a contact attempt since C1. «افتح وعدّل» was not — so an agent who had
 * rung nobody could open the order, change the quantity, the price or the
 * address, and save. The rule existed and its widest door was open.
 * ═══════════════════════════════════════════════════════════════════════
 */

describe('a call that reached nobody', () => {
  it('has a word of its own', () => {
    expect(CONTACT_RESULTS).toContain('UNREACHABLE');
  });

  it('and counts toward the three, like the other two ways a line fails', () => {
    expect([...NO_ANSWER_RESULTS].sort()).toEqual(['BUSY', 'NO_ANSWER', 'UNREACHABLE']);
  });

  it('and «answered» and «message sent» are not among them', () => {
    // A sent message is an attempt — it unlocks the four actions — but it
    // is not a call that reached nobody, and counting it would close an
    // order because somebody tried twice more.
    for (const not of ['ANSWERED', 'MESSAGE_SENT', 'WRONG_NUMBER', 'OPENED', 'CALLBACK_REQUESTED']) {
      expect(NO_ANSWER_RESULTS as readonly string[], not).not.toContain(not);
    }
  });

  it('and the limit is still three', () => {
    expect(NO_ANSWER_LIMIT).toBe(3);
  });
});

describe('the counter and the close read ONE list', () => {
  const route = () => stripComments(repoFile('src/app/api/orders/[id]/contact-attempts/route.ts'));

  it('— the counter does', () => {
    const src = route();
    expect(src, 'العدّاد لسّا بلستة مكتوبة بالإيد').not.toMatch(/result:\s*\{\s*in:\s*\['NO_ANSWER'/);
    expect(src).toContain('NO_ANSWER_RESULTS');
  });

  it('— and so does the close, so a third BUSY is not a dead end', () => {
    /*
     * This was the bug: `result === 'NO_ANSWER'` alone. The counter had
     * always counted BUSY, so the order reached the limit and then nothing
     * closed it.
     */
    const src = route();
    expect(src, 'الإغلاق لسّا بيفحص NO_ANSWER وحدها').not.toMatch(/result === 'NO_ANSWER' &&/);
    expect(src).toMatch(/NO_ANSWER_RESULTS[\s\S]{0,80}includes\(result/);
  });

  it('and the mine screen counts the same three', () => {
    const src = stripComments(repoFile('src/app/api/confirmation/mine/route.ts'));
    expect(src, 'شاشة «طلباتي» بتعدّ لستة تانية').toContain('NO_ANSWER_RESULTS');
  });
});

describe('«افتح وعدّل» joined the rule', () => {
  it('is one of the actions that wait for a contact attempt', () => {
    expect(CONTACT_FIRST_ACTIONS as readonly string[]).toContain('edit');
  });

  it('and the holder with no attempt is refused', () => {
    expect(needsContactFirst({ action: 'edit', isHolder: true, hasAttempt: false })).toBe(true);
  });

  it('and one attempt — «رقم خطأ» included — unlocks it', () => {
    // «رقم خطأ» is an attempt, and it is the finding that most often makes
    // an edit the right next move.
    expect(needsContactFirst({ action: 'edit', isHolder: true, hasAttempt: true })).toBe(false);
  });

  it('and it binds the holder, never a supervisor correcting a record', () => {
    expect(needsContactFirst({ action: 'edit', isHolder: false, hasAttempt: false })).toBe(false);
  });

  it('and the server refuses it, not only the card', () => {
    /*
     * A card that hides a button is a courtesy. The rule is the door: the
     * order route refuses a holder's edit of a customer or line field
     * before any attempt, with the code the screen reads.
     */
    const src = stripComments(repoFile('src/app/api/orders/[id]/route.ts'));
    expect(src, 'الباب ما بيفحص القاعدة').toContain("code: 'CONTACT_FIRST'");
    expect(src).toContain("needsContactFirst({ action: 'edit'");
  });

  it('and the card no longer claims the edit button is open', () => {
    // The comment on the screen used to name «افتح وعدّل» among the ones
    // that stay available. A stale sentence beside a changed rule is how
    // the next person restores the bug.
    const screen = repoFile('src/components/screens/ConfirmationMineScreen.tsx');
    expect(screen).not.toMatch(/«افتح وعدّل», «إدخال إشكال» and «مساعدة» stay open/);
  });
});

describe('and the card says where the order came from', () => {
  const screen = () => stripComments(repoFile('src/components/screens/ConfirmationMineScreen.tsx'));

  it('because an entry issue goes to the moderator who typed it', () => {
    expect(screen()).toContain('sourceLabel(order)');
  });

  it('and «إدخال إشكال» is drawn only on an order a moderator entered', () => {
    /*
     * The door accepts `moderatorId` orders only; a store order is refused
     * with «لا يمكن فتح إشكال إدخال على طلب من مصدر خارجي». Drawn on every
     * card, the agent learned that by pressing it — and pressed it again
     * on the next one.
     */
    const src = screen();
    const at = src.indexOf('إدخال إشكال');
    expect(src.slice(Math.max(0, at - 300), at), 'الزرّ مرسوم على كلّ كرت').toContain('order.moderatorId');
  });

  it('and a store order says what to do instead, not nothing', () => {
    const src = screen();
    expect(src).toContain('ما في مودريتور يصلّحه');
    expect(src, 'بيقول المشكلة وما بيقول الحلّ').toContain('سجّل «رقم خطأ»');
  });

  it('and the API sends the four fields the sentence needs', () => {
    const src = stripComments(repoFile('src/app/api/confirmation/mine/route.ts'));
    for (const field of ['source:', 'moderatorId:', 'createdBy:', 'channel:']) {
      expect(src, `«طلباتي» ما بتبعت ${field}`).toContain(field);
    }
  });
});
