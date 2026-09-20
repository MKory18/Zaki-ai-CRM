import type { Prisma } from '@prisma/client';
import { db } from './db';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * ORDER TIMELINE — one merged, chronological history of an order.
 *
 * The repository writes events into five separate tables (status logs,
 * claim history, contact attempts, delivery attempts, activities) plus the
 * notes. Reading only one of them is how a screen ends up showing a history
 * that disagrees with the order's actual state, so the timeline merges all
 * of them and sorts once.
 */

export type TimelineKind =
  | 'STATUS'
  | 'OWNERSHIP'
  | 'CONTACT'
  | 'DELIVERY'
  | 'NOTE'
  | 'ACTIVITY'
  | 'CHANGE_REQUEST'
  | 'ISSUE';

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  at: Date;
  /** Short Arabic line for the panel. */
  title: string;
  detail?: string | null;
  actorId?: string | null;
  actorName?: string | null;
}

export async function orderTimeline(tx: Tx, orderId: string): Promise<TimelineEvent[]> {
  const [statusLogs, claims, contacts, deliveries, notes, activities, changeRequests, issues] = await Promise.all([
    tx.orderStatusLog.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    tx.orderClaimHistory.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    tx.orderContactAttempt.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    tx.deliveryAttempt.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    tx.orderNote.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    tx.orderActivity.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    tx.orderChangeRequest.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    tx.orderIssue.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
  ]);

  const actorIds = new Set<string>();
  for (const row of statusLogs) actorIds.add(row.changedById);
  for (const row of claims) actorIds.add(row.userId);
  for (const row of contacts) actorIds.add(row.employeeId);
  for (const row of notes) if (row.authorId) actorIds.add(row.authorId);
  for (const row of activities) if (row.userId) actorIds.add(row.userId);
  for (const row of changeRequests) actorIds.add(row.requestedById);
  for (const row of issues) actorIds.add(row.raisedById);

  const users = actorIds.size
    ? await tx.user.findMany({ where: { id: { in: [...actorIds] } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const CLAIM_LABEL: Record<string, string> = {
    CLAIMED: 'استلام الطلب',
    RELEASED: 'تحرير الطلب',
    TRANSFERRED: 'نقل الطلب',
    OVERRIDDEN: 'تجاوز الملكية',
    UNLOCKED: 'فك القفل',
  };
  const STATUS_TYPE: Record<string, string> = {
    CONFIRMATION: 'التأكيد',
    SHIPPING: 'الشحن',
    SETTLEMENT: 'التسوية',
    LEGACY: 'الحالة',
  };

  const events: TimelineEvent[] = [
    ...statusLogs.map((row) => ({
      id: `st_${row.id}`,
      kind: 'STATUS' as const,
      at: row.createdAt,
      title: `${STATUS_TYPE[row.statusType] ?? row.statusType}: ${row.previousValue ?? '—'} ← ${row.newValue ?? '—'}`,
      detail: row.note,
      actorId: row.changedById,
      actorName: nameOf.get(row.changedById) ?? null,
    })),
    ...claims.map((row) => ({
      id: `cl_${row.id}`,
      kind: 'OWNERSHIP' as const,
      at: row.createdAt,
      title: CLAIM_LABEL[row.action] ?? row.action,
      detail: row.reason,
      actorId: row.userId,
      actorName: nameOf.get(row.userId) ?? null,
    })),
    ...contacts.map((row) => ({
      id: `ct_${row.id}`,
      kind: 'CONTACT' as const,
      at: row.createdAt,
      title: `محاولة اتصال ${row.attemptNumber} (${row.contactMethod}): ${row.result}`,
      detail: row.note,
      actorId: row.employeeId,
      actorName: nameOf.get(row.employeeId) ?? null,
    })),
    ...deliveries.map((row) => ({
      id: `dl_${row.id}`,
      kind: 'DELIVERY' as const,
      at: row.createdAt,
      title: `محاولة توصيل ${row.attemptNumber}: ${row.result}`,
      detail: row.failureReason ?? row.note,
      actorId: row.deliveryAgentId,
      actorName: null,
    })),
    ...notes.map((row) => ({
      id: `nt_${row.id}`,
      kind: 'NOTE' as const,
      at: row.createdAt,
      title: `ملاحظة (${row.kind})`,
      detail: row.body,
      actorId: row.authorId,
      actorName: row.authorId ? nameOf.get(row.authorId) ?? null : null,
    })),
    ...changeRequests.map((row) => ({
      id: `cr_${row.id}`,
      kind: 'CHANGE_REQUEST' as const,
      at: row.createdAt,
      title: `طلب تعديل — ${row.status}`,
      detail: row.reason,
      actorId: row.requestedById,
      actorName: nameOf.get(row.requestedById) ?? null,
    })),
    ...issues.map((row) => ({
      id: `is_${row.id}`,
      kind: 'ISSUE' as const,
      at: row.createdAt,
      title: `إشكال إدخال (${row.reason}) — ${row.status}`,
      detail: row.note,
      actorId: row.raisedById,
      actorName: nameOf.get(row.raisedById) ?? null,
    })),
    // Activities repeat some of the above; keep only the ones nothing else covers.
    ...activities
      .filter((row) => row.action !== 'STATUS_CHANGED')
      .map((row) => ({
        id: `ac_${row.id}`,
        kind: 'ACTIVITY' as const,
        at: row.createdAt,
        title: row.action,
        detail: row.metadata,
        actorId: row.userId,
        actorName: row.userId ? nameOf.get(row.userId) ?? null : null,
      })),
  ];

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}
