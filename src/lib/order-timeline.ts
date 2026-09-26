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

/**
 * The history is read by people, so it is written in their words.
 *
 * Every line here used to leak whatever the database happened to store: a
 * note headed "ملاحظة (internal)", a contact attempt reading
 * "محاولة اتصال 1 (PHONE): CONFIRMED", and — worst — an activity whose
 * entire detail was the raw metadata JSON, so the order history showed
 * {"source":"...","intakeMethod":"AI_PASTE"} to whoever opened it.
 */

const STATUS_VALUE_AR: Record<string, string> = {
  NEW: 'جديد', IN_PROGRESS: 'قيد التأكيد', NO_ANSWER: 'لا يرد',
  FOLLOW_UP_REQUIRED: 'يحتاج متابعة', POSTPONED: 'مؤجل', CONFIRMED: 'مؤكد',
  REJECTED: 'مرفوض', CANCELLED: 'ملغى',
  NOT_READY: 'غير جاهز', READY_FOR_SHIPPING: 'جاهز للشحن', PACKING: 'قيد التغليف',
  READY_FOR_PICKUP: 'جاهز للاستلام', SHIPPED: 'مشحون', OUT_FOR_DELIVERY: 'خرج للتوصيل',
  DELIVERED: 'مسلَّم', PARTIALLY_DELIVERED: 'مسلَّم جزئياً', FAILED_DELIVERY: 'فشل التوصيل',
  RETURN_REQUESTED: 'طُلب إرجاعه', RETURNED: 'مرتجع',
  PENDING: 'معلّق', PENDING_COLLECTION: 'لم يُحصَّل', COLLECTED: 'محصَّل',
  PARTIALLY_SETTLED: 'مسوّى جزئياً', SETTLED: 'مسوّى', UNSETTLED: 'غير مسوّى',
  REFUNDED: 'مُسترد', APPROVED: 'موافَق عليه', OPEN: 'مفتوح', CORRECTED: 'تم التصحيح',
  VOIDED: 'مُبطَل',
};

const CLAIM_REASON_AR: Record<string, string> = {
  PULL_NEXT: 'سحب من الطابور',
  MANUAL_CLAIM: 'استلام يدوي',
  ADMIN_OVERRIDE: 'تجاوز إداري',
  AUTO_RELEASE: 'تحرير تلقائي',
  LOCK_EXPIRED: 'انتهت مدة القفل',
  REASSIGNED: 'إعادة إسناد',
};

const CONTACT_METHOD_AR: Record<string, string> = {
  PHONE: 'هاتف', WHATSAPP: 'واتساب', TELEGRAM: 'تلجرام', SMS: 'رسالة نصية', OTHER: 'أخرى',
};

const CONTACT_RESULT_AR: Record<string, string> = {
  CONFIRMED: 'وافق على الطلب', POSTPONED: 'طلب التأجيل', NO_ANSWER: 'لم يرد',
  REJECTED: 'رفض الطلب', CALLBACK_REQUESTED: 'طلب معاودة الاتصال',
  WRONG_NUMBER: 'الرقم خاطئ', BUSY: 'مشغول', UNREACHABLE: 'تعذّر الوصول',
};

const NOTE_KIND_AR: Record<string, string> = {
  internal: 'ملاحظة داخلية', customer: 'ملاحظة من العميل', system: 'ملاحظة النظام',
};

const ISSUE_REASON_AR: Record<string, string> = {
  WRONG_PHONE: 'رقم خاطئ', WRONG_ADDRESS: 'عنوان خاطئ', WRONG_PRODUCT: 'منتج خاطئ',
  MISSING_DATA: 'بيانات ناقصة', DUPLICATE: 'طلب مكرر', OTHER: 'أخرى',
};

const ACTIVITY_AR: Record<string, string> = {
  ORDER_CREATED: 'إنشاء الطلب',
  ORDER_UPDATED: 'تعديل بيانات الطلب',
  CUSTOMER_UPDATED: 'تعديل بيانات العميل',
  MODERATOR_ASSIGNED: 'إسناد مودريتور',
  CALL_MADE: 'اتصال بالعميل',
  NOTE_ADDED: 'إضافة ملاحظة',
  SHIPPING_UPDATED: 'تحديث الشحن',
  PARTIAL_DELIVERY: 'تسليم جزئي',
  COURIER_ASSIGNED: 'إسناد شركة شحن',
  COURIER_TRANSFERRED: 'تحويل بين شركات الشحن',
};

const ar = (table: Record<string, string>, key: string | null | undefined): string =>
  (key && table[key]) || key || '—';

/** The fields of an activity's metadata worth showing, in words. */
const METADATA_AR: Record<string, string> = {
  source: 'المصدر', intakeMethod: 'طريقة الإدخال', createdBy: 'أدخله',
  updatedBy: 'عدّله', callResult: 'نتيجة الاتصال', notes: 'ملاحظات',
  caller: 'المتصل', role: 'الدور', fields: 'الحقول',
};

const FIELD_AR: Record<string, string> = {
  customerName: 'اسم العميل', customerPhone: 'رقم الهاتف', customerAddress: 'العنوان',
  regionId: 'المحافظة', sellingPrice: 'السعر', quantity: 'الكمية',
  discountAmount: 'الخصم', shippingCost: 'أجرة الشحن', productId: 'المنتج',
};

/**
 * Metadata as a sentence, never as JSON. Anything the tables above do not
 * name is dropped rather than dumped: a key nobody wrote a label for is a
 * key nobody meant to show.
 */
function readableMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(metadata as Record<string, unknown>)) {
    const label = METADATA_AR[key];
    if (!label || raw === null || raw === undefined || raw === '') continue;
    const value = Array.isArray(raw)
      ? raw.map((v) => (typeof v === 'string' ? ar(FIELD_AR, v) : String(v))).join('، ')
      : typeof raw === 'boolean'
        ? (raw ? 'نعم' : 'لا')
        : String(raw);
    if (value.trim()) parts.push(`${label}: ${value}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export async function orderTimeline(tx: Tx, orderId: string): Promise<TimelineEvent[]> {
  const [statusLogs, claims, contacts, callLogs, deliveries, notes, activities, changeRequests, issues] = await Promise.all([
    tx.orderStatusLog.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    tx.orderClaimHistory.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    tx.orderContactAttempt.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    tx.callLog.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
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
  for (const row of callLogs) if (row.moderatorId) actorIds.add(row.moderatorId);
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
      title: `${STATUS_TYPE[row.statusType] ?? row.statusType}: ${ar(STATUS_VALUE_AR, row.previousValue)} ← ${ar(STATUS_VALUE_AR, row.newValue)}`,
      detail: row.note,
      actorId: row.changedById,
      actorName: nameOf.get(row.changedById) ?? null,
    })),
    ...claims.map((row) => ({
      id: `cl_${row.id}`,
      kind: 'OWNERSHIP' as const,
      at: row.createdAt,
      title: CLAIM_LABEL[row.action] ?? row.action,
      detail: row.reason ? ar(CLAIM_REASON_AR, row.reason) : null,
      actorId: row.userId,
      actorName: nameOf.get(row.userId) ?? null,
    })),
    ...contacts.map((row) => ({
      id: `ct_${row.id}`,
      kind: 'CONTACT' as const,
      at: row.createdAt,
      title: `محاولة اتصال ${row.attemptNumber} عبر ${ar(CONTACT_METHOD_AR, row.contactMethod)} — ${ar(CONTACT_RESULT_AR, row.result)}`,
      detail: row.note,
      actorId: row.employeeId,
      actorName: nameOf.get(row.employeeId) ?? null,
    })),
    ...callLogs.map((row) => ({
      id: `cg_${row.id}`,
      kind: 'CONTACT' as const,
      at: row.callDate ?? row.createdAt,
      title: `مكالمة — ${ar(CONTACT_RESULT_AR, row.result)}`,
      detail: row.notes,
      actorId: row.moderatorId,
      actorName: row.moderatorId ? nameOf.get(row.moderatorId) ?? null : null,
    })),
    ...deliveries.map((row) => ({
      id: `dl_${row.id}`,
      kind: 'DELIVERY' as const,
      at: row.createdAt,
      title: `محاولة توصيل ${row.attemptNumber} — ${ar(STATUS_VALUE_AR, row.result)}`,
      detail: row.failureReason ?? row.note,
      actorId: row.deliveryAgentId,
      actorName: null,
    })),
    ...notes.map((row) => ({
      id: `nt_${row.id}`,
      kind: 'NOTE' as const,
      at: row.createdAt,
      title: ar(NOTE_KIND_AR, row.kind),
      detail: row.body,
      actorId: row.authorId,
      actorName: row.authorId ? nameOf.get(row.authorId) ?? null : null,
    })),
    ...changeRequests.map((row) => ({
      id: `cr_${row.id}`,
      kind: 'CHANGE_REQUEST' as const,
      at: row.createdAt,
      title: `طلب تعديل — ${ar(STATUS_VALUE_AR, row.status)}`,
      detail: row.reason,
      actorId: row.requestedById,
      actorName: nameOf.get(row.requestedById) ?? null,
    })),
    ...issues.map((row) => ({
      id: `is_${row.id}`,
      kind: 'ISSUE' as const,
      at: row.createdAt,
      title: `إشكال إدخال: ${ar(ISSUE_REASON_AR, row.reason)} — ${ar(STATUS_VALUE_AR, row.status)}`,
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
        title: ar(ACTIVITY_AR, row.action),
        detail: readableMetadata(row.metadata),
        actorId: row.userId,
        actorName: row.userId ? nameOf.get(row.userId) ?? null : null,
      })),
  ];

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}
