import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ISSUE_REASONS, ISSUE_REASON_AR } from '@/app/api/confirmation/issues/route';
import { repoFile, stripComments } from './guard-source';

/**
 * AN ENTRY ISSUE HAS TO REACH SOMEBODY.
 *
 * Raising one put the order back in the pool marked as having a problem and
 * TOLD NOBODY — it waited for whoever happened to open the issues screen
 * next, which for an order a customer is waiting on is the wrong kind of
 * patience.
 *
 * And the one role whose whole job is chasing stuck orders could not open
 * that screen at all: the follow-up agent holds `confirmation.pull` and
 * `confirmation.work` and never held `confirmation.issues`.
 *
 * (I first measured this against `ROLE_PERMISSIONS` in `types/auth.ts` and
 * read it as fifty permissions nobody holds. That matrix is the legacy
 * bootstrap; the live grants are `role_permissions` rows in the database,
 * where the moderator does hold this exactly as the contract says. The
 * migration below is the only thing that was actually missing.)
 */

const migration = () =>
  readFileSync(
    join(process.cwd(), 'prisma/migrations/20260927010000_followup_sees_issues/migration.sql'),
    'utf8'
  );

describe('who hears about it', () => {
  it('grants the follow-up agent the screen, at the scope the moderator has it', () => {
    const sql = migration();
    expect(sql).toContain("'confirmation.issues'");
    expect(sql).toContain("r.name = 'FOLLOW_UP_AGENT'");
    expect(sql).toContain("'ALL_COMPANY'");
    // Re-runnable: a migration that fails on a grant somebody already made by
    // hand is a deploy that stops halfway.
    expect(sql, 'الترحيل ينكسر إن مُنحت الصلاحية يدويّاً').toContain('ON CONFLICT');
  });

  it('and takes it back cleanly, touching no order', () => {
    const back = readFileSync(
      join(process.cwd(), 'prisma/migrations/20260927010000_followup_sees_issues/rollback.sql'),
      'utf8'
    );
    expect(back).toContain('DELETE FROM "role_permissions"');
    expect(back).toContain("r.name = 'FOLLOW_UP_AGENT'");
    expect(back, 'التراجع يمسّ الطلبات').not.toMatch(/\borders\b/i);
  });

  /**
   * BOTH AUDIENCES, IN ONE CALL.
   *
   * The moderator who entered it, BY NAME — they typed the wrong number and
   * they are the one who can say what was meant, and there may be several
   * moderators holding the permission for their own work. Plus everyone who
   * can act on an issue, which is now the follow-up agent too: waiting for
   * one person to come back from lunch is how a correctable order becomes a
   * late one.
   */
  it('tells the moderator who entered it AND everyone who can fix one', () => {
    const src = stripComments(repoFile('src/app/api/confirmation/issues/route.ts'));
    const call = src.slice(src.indexOf('await createNotification('));
    expect(call, 'لا تنبيه عند رفع الإشكال').toContain('createNotification');
    expect(call).toMatch(/permission: 'confirmation\.issues'/);
    expect(call).toMatch(/userIds: order\.moderatorId \? \[order\.moderatorId\] : \[\]/);
    // The link lands on the screen that fixes it, on the order in question.
    expect(call).toContain('/confirmation/issues?order=');
  });

  /** The record is the issue; the message is the courtesy. */
  it('and a failed message never loses the issue', () => {
    const src = stripComments(repoFile('src/app/api/confirmation/issues/route.ts'));
    const call = src.slice(src.indexOf('await createNotification('));
    expect(call.slice(0, 900), 'فشلُ التنبيه يُسقط الإشكال').toMatch(/\}\)\.catch\(/);
  });

  /** Said in words, not as a constant somebody has to decode. */
  it('says the reason in Arabic, every one of them', () => {
    for (const r of ISSUE_REASONS) {
      expect(ISSUE_REASON_AR[r], `${r} بلا ترجمة`).toBeTruthy();
    }
  });
});
