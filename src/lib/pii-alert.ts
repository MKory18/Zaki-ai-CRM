import { logAudit } from './audit';
import { createNotification } from './notification';
import { BULK_VIEW_RECORDS, BULK_VIEW_WINDOW_MS } from './pii-access';
import type { SessionUser } from '@/types/auth';

/**
 * THE ONE LINE A HARVEST LEAVES BEHIND.
 *
 * Called only on the crossing (see pii-access.ts), so this writes at most
 * once per person per window. Two things happen, and they are different
 * jobs: the audit row is the RECORD — it outlives the alert, it is
 * append-only at the database, and it is what an investigation reads
 * afterwards. The notification is the ALERT — it is for the people who
 * could act today, and it is allowed to be missed.
 *
 * Told to holders of `users.manage`: whoever can grant and revoke access
 * is who can do something about somebody reading everything, and they are
 * the smallest audience that fits. Not `audit.view`, which is a reading
 * permission and would tell people who cannot act.
 *
 * NEVER THROWS, and never blocks the response it is attached to. A person
 * asked to see customers they are allowed to see; failing that request
 * because an alert could not be written would turn a monitoring feature
 * into an outage, and would teach the next person to remove it.
 */
export async function announceBulkCustomerView(input: {
  companyId: string;
  storeId: string | null;
  user: SessionUser;
  records: number;
  /** Which screen the reading came through, for the line a person reads. */
  where: string;
}): Promise<void> {
  const minutes = Math.round(BULK_VIEW_WINDOW_MS / 60_000);
  const message = `${input.user.name || input.user.email} اطّلع على ${input.records} سجلّ عميل خلال ${minutes} دقيقة من ${input.where}`;

  try {
    await logAudit({
      companyId: input.companyId,
      userId: input.user.id,
      action: 'CUSTOMER_BULK_VIEW',
      entity: 'Customer',
      // The event is about a person's reading, not about one customer —
      // and naming a customer here would put a row of the data being
      // protected into the alert about it.
      entityId: input.user.id,
      newData: {
        records: input.records,
        threshold: BULK_VIEW_RECORDS,
        windowMinutes: minutes,
        where: input.where,
        storeId: input.storeId,
      },
    });

    await createNotification({
      companyId: input.companyId,
      storeId: input.storeId,
      // The actor is not told about their own reading: an alert that
      // announces itself to the person it is watching is a tip-off.
      actorId: input.user.id,
      audience: { permission: 'users.manage' },
      title: 'اطّلاعٌ واسعٌ على بيانات العملاء',
      message,
      type: 'SYSTEM_ALERT',
      // `linkFor` drops a link the recipient's own guard would refuse, so
      // someone holding `users.manage` without `audit.view` gets the alert
      // with no link rather than a click into a 403.
      link: '/control/audit',
    });
  } catch (error) {
    console.error('Failed to announce a bulk customer view:', error);
  }
}
