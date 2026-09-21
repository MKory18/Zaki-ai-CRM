import { db } from '../db';
import { dueDeliveries, deliverOne } from '../apps/events';
import type { JobDefinition, JobResult } from './runner';
import { releaseStaleClaims } from '../confirmation-queue';
import { accrueForOrder } from '../commission';
import { blockingClosing } from '../wallets';
import { adapterFor, isAutoApplicable } from '../couriers';
import { isValidShippingTransition } from '../shipping-workflow';

/**
 * The scheduled jobs.
 *
 * Each one calls the service that already owns the rule — releaseStaleClaims,
 * accrueForOrder, the courier adapter — rather than restating it. The job's
 * own job is to find the work, hand it over, and count what happened. A rule
 * implemented twice is a rule that will disagree with itself.
 *
 * Every job is idempotent: running it twice does the work once.
 */

/** Why an order earned nobody anything, in words. */
const SKIP_AR: Record<string, string> = {
  NO_RULE: 'بلا قاعدة عمولة تغطّيها',
  RETURNED: 'مرتجعة',
  NOT_DELIVERED: 'غير مسلَّمة',
  ALREADY_ACCRUED: 'محتسَبة مسبقاً',
};

/** Every active store, with the country facts its rules depend on. */
async function activeStores() {
  return db.store.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      companyId: true,
      countryId: true,
      country: {
        select: {
          id: true, name: true, code: true, minorUnit: true,
          workHoursStart: true, workHoursEnd: true, weekendDays: true, timezone: true,
        },
      },
    },
  });
}

/**
 * Claims held with no contact attempt past the business-minute cap go back
 * to the pool. Business-hours aware, so a claim taken at 4pm is not released
 * overnight for sitting through hours nobody was working.
 */
export const releaseClaims: JobDefinition = {
  name: 'release-stale-claims',
  everySeconds: 300,
  description: 'إعادة الطلبات المحجوزة بلا محاولة اتصال إلى المخزن المشترك',
  async run({ now }): Promise<JobResult> {
    let released = 0;
    for (const store of await activeStores()) {
      const count = await db.$transaction((tx) =>
        releaseStaleClaims(
          tx,
          { companyId: store.companyId, storeId: store.id },
          {
            workHoursStart: store.country.workHoursStart,
            workHoursEnd: store.country.workHoursEnd,
            weekendDays: store.country.weekendDays,
            timezone: store.country.timezone,
          },
          now
        )
      );
      released += count;
    }
    return { processed: released, detail: released ? `حُرِّر ${released} طلباً` : 'لا طلبات متأخرة' };
  },
};

/**
 * Commission is earned on delivery. Until this ran on a schedule it only
 * accrued when somebody pressed a button, which meant a month could close
 * with nothing calculated.
 */
export const accrueCommission: JobDefinition = {
  name: 'accrue-commission',
  everySeconds: 86_400,
  description: 'احتساب عمولات الطلبات المسلَّمة',
  async run(): Promise<JobResult> {
    let created = 0;
    const skipped: Record<string, number> = {};

    for (const store of await activeStores()) {
      const orders = await db.order.findMany({
        where: {
          companyId: store.companyId,
          storeId: store.id,
          shippingStatus: 'DELIVERED',
          commissions: { none: {} },
        },
        select: { id: true },
        take: 500,
      });

      for (const order of orders) {
        const result = await db.$transaction((tx) =>
          accrueForOrder(tx, {
            companyId: store.companyId,
            orderId: order.id,
            minorUnit: store.country.minorUnit,
          })
        );
        created += result.created;
        if (result.skipped) skipped[result.skipped] = (skipped[result.skipped] ?? 0) + 1;
      }
    }

    // Say WHY nothing accrued. "No commissions" reads like a quiet day; "112
    // orders have no rule covering them" is someone forgetting to write one.
    const reasons = Object.entries(skipped)
      .map(([reason, count]) => `${count} ${SKIP_AR[reason] ?? reason}`)
      .join(' · ');

    return {
      processed: created,
      detail: created
        ? `احتُسبت ${created} عمولة${reasons ? ` · ${reasons}` : ''}`
        : reasons || 'لا طلبات مسلَّمة بانتظار الاحتساب',
    };
  },
};

/**
 * Asks each integrated courier where its parcels are.
 *
 * A status that would decide whether money is owed is NEVER applied here —
 * isAutoApplicable refuses DELIVERED, RETURNED and CANCELLED, and an
 * unrecognised code maps to null. Those stay a human decision taken against
 * the courier's statement. This job moves parcels along the in-transit
 * states and nothing else.
 */
export const syncCourierStatus: JobDefinition = {
  name: 'sync-courier-status',
  everySeconds: 120,
  description: 'تحديث حالات الشحنات من شركات الشحن المرتبطة',
  async run(): Promise<JobResult> {
    const providers = await db.deliveryProvider.findMany({
      where: { isActive: true, apiEnabled: true },
      select: { id: true, code: true, name: true, apiEnabled: true, companyId: true },
    });

    let applied = 0;
    const skipped: string[] = [];

    for (const provider of providers) {
      const adapter = adapterFor(provider);
      if (!adapter.automated) continue;

      const inTransit = await db.order.findMany({
        where: {
          companyId: provider.companyId,
          deliveryProviderId: provider.id,
          trackingNumber: { not: null },
          shippingStatus: { in: ['READY_FOR_PICKUP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY'] },
        },
        select: { id: true, trackingNumber: true, shippingStatus: true, companyId: true },
        take: 200,
      });
      if (inTransit.length === 0) continue;

      const events = await adapter.fetchEvents(inTransit.map((o) => o.trackingNumber!));
      const byBarcode = new Map(events.map((e) => [e.trackingNumber, e]));

      for (const order of inTransit) {
        const event = byBarcode.get(order.trackingNumber!);
        if (!event) continue;

        if (!isAutoApplicable(event)) {
          if (event.status) skipped.push(event.rawStatus);
          continue;
        }
        if (event.status === order.shippingStatus) continue;
        // Go through the transition machine; never write the column blind.
        if (!isValidShippingTransition(order.shippingStatus, event.status!)) continue;

        await db.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: { shippingStatus: event.status!, version: { increment: 1 } },
          });
          await tx.orderActivity.create({
            data: {
              companyId: order.companyId,
              orderId: order.id,
              userId: null, // the courier's feed, not a person
              action: 'COURIER_STATUS_SYNCED',
              newStatus: event.status!,
              metadata: JSON.stringify({ courier: provider.name, rawStatus: event.rawStatus, note: event.note }),
            },
          });
        });
        applied++;
      }
    }

    return {
      processed: applied,
      detail: skipped.length
        ? `حُدِّث ${applied} · ${skipped.length} حالة تحتاج قراراً بشرياً`
        : applied
          ? `حُدِّث ${applied} شحنة`
          : 'لا تحديثات',
    };
  },
};

/**
 * Postponed orders coming due, surfaced before the date rather than after.
 * Idempotent: the notification carries the order id, and one already sent
 * for that order and date is not sent again.
 */
export const surfacePostponed: JobDefinition = {
  name: 'surface-postponed',
  everySeconds: 86_400,
  description: 'تنبيه بالطلبات المؤجَّلة التي حان موعدها',
  async run({ now }): Promise<JobResult> {
    const horizon = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    let notified = 0;

    for (const store of await activeStores()) {
      const due = await db.order.findMany({
        where: {
          companyId: store.companyId,
          storeId: store.id,
          confirmationStatus: 'POSTPONED',
          postponedUntil: { not: null, lte: horizon },
        },
        select: { id: true, orderNumber: true, postponedUntil: true },
        take: 200,
      });

      for (const order of due) {
        const link = `/orders?highlight=${order.id}`;
        const already = await db.notification.findFirst({
          where: { companyId: store.companyId, type: 'POSTPONED_DUE', link },
          select: { id: true },
        });
        if (already) continue;

        await db.notification.create({
          data: {
            companyId: store.companyId,
            userId: null,
            title: 'طلب مؤجَّل حان موعده',
            message: `الطلب ${order.orderNumber} مؤجَّل حتى ${order.postponedUntil?.toISOString().slice(0, 10)}`,
            type: 'POSTPONED_DUE',
            link,
          },
        });
        notified++;
      }
    }

    return { processed: notified, detail: notified ? `${notified} طلباً مؤجَّلاً حان موعده` : 'لا مؤجَّلات مستحقة' };
  },
};

/**
 * Returns announced by the courier but never physically received, oldest
 * first. A parcel that is "returned" on paper and absent from the shelf is
 * stock we think we have and do not.
 */
export const staleReturns: JobDefinition = {
  name: 'stale-returns',
  everySeconds: 86_400,
  description: 'تنبيه بالمرتجعات المعلنة ولم تُستلم فعلياً',
  async run({ now }): Promise<JobResult> {
    const threshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    let flagged = 0;

    for (const store of await activeStores()) {
      const stale = await db.order.findMany({
        where: {
          companyId: store.companyId,
          storeId: store.id,
          shippingStatus: { in: ['RETURN_REQUESTED', 'RETURNED'] },
          returnReceipt: null,
          updatedAt: { lte: threshold },
        },
        orderBy: { updatedAt: 'asc' },
        select: { id: true, orderNumber: true },
        take: 100,
      });
      flagged += stale.length;

      if (stale.length > 0) {
        const link = '/ops/returns';
        const today = now.toISOString().slice(0, 10);
        const already = await db.notification.findFirst({
          where: { companyId: store.companyId, type: 'RETURNS_NOT_RECEIVED', createdAt: { gte: new Date(`${today}T00:00:00.000Z`) } },
          select: { id: true },
        });
        if (!already) {
          await db.notification.create({
            data: {
              companyId: store.companyId,
              userId: null,
              title: 'مرتجعات لم تُستلم',
              message: `${stale.length} مرتجعاً معلناً لم يُستلم فعلياً — أقدمها ${stale[0].orderNumber}`,
              type: 'RETURNS_NOT_RECEIVED',
              link,
            },
          });
        }
      }
    }

    return { processed: flagged, detail: flagged ? `${flagged} مرتجعاً بانتظار الاستلام` : 'لا مرتجعات عالقة' };
  },
};

/**
 * Reminds that a wallet's day has not been counted, and says plainly when an
 * earlier unexplained difference is blocking today's close.
 */
export const closingReminder: JobDefinition = {
  name: 'closing-reminder',
  everySeconds: 86_400,
  description: 'تذكير بالإغلاق اليومي لكل محفظة',
  async run({ now }): Promise<JobResult> {
    const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    let pending = 0;

    const wallets = await db.wallet.findMany({
      where: { isActive: true },
      select: { id: true, name: true, companyId: true },
    });

    for (const wallet of wallets) {
      const closing = await db.dailyClosing.findUnique({
        where: { walletId_date: { walletId: wallet.id, date: day } },
        select: { id: true, status: true },
      });
      if (closing?.status === 'APPROVED') continue;

      const blocker = await blockingClosing(db, wallet.id, day);
      pending++;

      const link = '/finance/closing';
      const already = await db.notification.findFirst({
        where: { companyId: wallet.companyId, type: 'CLOSING_DUE', link, createdAt: { gte: day } },
        select: { id: true },
      });
      if (already) continue;

      await db.notification.create({
        data: {
          companyId: wallet.companyId,
          userId: null,
          title: 'الإغلاق اليومي',
          message: blocker
            ? `${wallet.name}: إغلاق سابق بفرق غير مفسَّر يمنع إغلاق اليوم`
            : `${wallet.name}: لم يُسجَّل جرد اليوم بعد`,
          type: 'CLOSING_DUE',
          link,
        },
      });
    }

    return { processed: pending, detail: pending ? `${pending} محفظة بانتظار الإغلاق` : 'كل المحافظ مغلقة' };
  },
};


/**
 * Telling apps what happened.
 *
 * Delivery is never inline with the event: an order must not fail to save
 * because somebody's server is down. The row is written when it happens and
 * sent from here, so a developer's outage costs them a delay and costs the
 * seller nothing.
 */
export const deliverAppEvents: JobDefinition = {
  name: 'deliver-app-events',
  everySeconds: 60,
  description: 'إرسال أحداث الطلبات إلى التطبيقات المثبَّتة',
  async run(): Promise<JobResult> {
    const due = await dueDeliveries(50);
    if (due.length === 0) return { processed: 0, detail: 'لا إشعارات معلّقة' };

    let ok = 0;
    for (const d of due) {
      // One at a time: fifty parallel requests to fifty unknown servers is
      // a good way to exhaust this process's sockets on somebody else's
      // slow endpoint.
      if (await deliverOne(d.id)) ok++;
    }
    return {
      processed: due.length,
      detail: `أُرسل ${ok} من ${due.length}`,
    };
  },
};

export const JOBS: JobDefinition[] = [
  syncCourierStatus,
  releaseClaims,
  surfacePostponed,
  staleReturns,
  closingReminder,
  accrueCommission,
  deliverAppEvents,
];

export function jobByName(name: string): JobDefinition | undefined {
  return JOBS.find((j) => j.name === name);
}
