import { SPANS, accrueForPeriod, lastClosedSpan } from '../commission-period';
import { db } from '../db';
import { dueDeliveries, deliverOne } from '../apps/events';
import { dueConversions, deliverConversion } from '../conversions/emit';
import type { JobDefinition, JobResult } from './runner';
import { releaseStaleClaims } from '../confirmation-queue';
import { accrueForOrder } from '../commission';
import { proposePenalties, recordProposals } from '../penalty-service';
import { blockingClosing } from '../wallets';
import { adapterFor } from '../couriers';
import { applyCourierEvent } from '../couriers/apply-event';
import { clearMiss, missingHours, recordMiss } from '../couriers/missing-shipment';
import { createNotification } from '../notification';
import { resolveAudience } from '../notification-audience';

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
  BELOW_MINIMUM: 'دون الحد الأدنى لعدد الطلبات',
  NO_TIER: 'خارج شرائح القاعدة',
  NOTHING_EARNED: 'لم تستحق شيئاً',
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
          id: true, name: true, code: true, minorUnit: true, currencyCode: true,
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
  // After the day's deliveries have settled, not at whatever hour the
  // server last restarted at.
  at: '23:00',
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
    let missing = 0;
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
        select: {
          id: true, trackingNumber: true, shippingStatus: true, companyId: true, storeId: true,
          orderNumber: true, trackingMissCount: true, trackingMissingSince: true,
          trackingMissingAlertedAt: true,
        },
        take: 200,
      });
      if (inTransit.length === 0) continue;

      const events = await adapter.fetchEvents(inTransit.map((o) => o.trackingNumber!));
      const byBarcode = new Map(events.map((e) => [e.trackingNumber, e]));

      for (const order of inTransit) {
        const event = byBarcode.get(order.trackingNumber!);

        // NOTHING CAME BACK, OR AN ERROR DID.
        //
        // This used to be a `continue` — the parcel was asked about again
        // in two minutes, and again, for ever, while it sat in SHIPPED and
        // nobody knew. Three misses in a row, with every other barcode in
        // the same sweep answering, is a parcel that is not there.
        if (!event || event.rawStatus === 'ERROR') {
          const outcome = await recordMiss(db, order);
          if (outcome.alertNow) {
            missing++;
            const hours = missingHours(order.trackingMissingSince ?? new Date());
            await createNotification({
              companyId: order.companyId,
              storeId: order.storeId,
              audience: { permission: 'ops.track' },
              type: 'SYSTEM_ALERT',
              title: 'شحنة مفقودة عند شركة الشحن',
              message:
                `الطلب ${order.orderNumber} بباركود ${order.trackingNumber} — ` +
                `${provider.name} لا تعرفه منذ ${hours} ساعة. لم تعد تُستعلَم بصمت.`,
              link: `/ops/tracking?order=${order.id}`,
            });
          }
          continue;
        }

        // It answered, so it is not missing — and a barcode that goes
        // missing, comes back and goes again is two incidents, the second
        // as worth shouting about as the first.
        if (order.trackingMissCount > 0 || order.trackingMissingAlertedAt) {
          await clearMiss(db, order);
        }

        // The same gate the webhook goes through — see couriers/apply-event.
        const outcome = await applyCourierEvent({
          order,
          event,
          courierName: provider.name,
          source: 'POLL',
        });
        if (outcome === 'APPLIED') applied++;
        else if (outcome === 'NOT_AUTO_APPLICABLE') skipped.push(event.rawStatus);
      }
    }

    const notes = [
      applied ? `حُدِّث ${applied} شحنة` : null,
      skipped.length ? `${skipped.length} حالة تحتاج قراراً بشرياً` : null,
      missing ? `${missing} شحنة مفقودة عند الشركة` : null,
    ].filter(Boolean);

    return { processed: applied, detail: notes.join(' · ') || 'لا تحديثات' };
  },
};

/**
 * Postponed orders coming due, surfaced before the date rather than after.
 *
 * To the agent holding the order and this store's confirmation supervisors
 * — the two people the postponed screen shows it to — and linked to that
 * screen. (The old link, /orders?highlight=…, was read by nothing.)
 *
 * Idempotent per order AND date: the message carries both, so an order
 * postponed again to a new date is announced again, and one already
 * announced for this date is not. Legacy rows (no store) count too, so the
 * first run after the per-recipient change does not repeat what was
 * already said.
 */
export const surfacePostponed: JobDefinition = {
  name: 'surface-postponed',
  everySeconds: 86_400,
  // First thing, so a postponed order is on somebody's desk when they
  // sit down rather than discovered at four in the afternoon.
  at: '08:00',
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
        select: { id: true, orderNumber: true, postponedUntil: true, claimedById: true },
        take: 200,
      });

      if (due.length === 0) continue;

      // Everyone this store's announcements go to, resolved ONCE for the
      // store — supervisors, and every agent holding one of these orders —
      // rather than the full audience lookup again for each of up to two
      // hundred orders.
      const people = await resolveAudience({
        companyId: store.companyId,
        storeId: store.id,
        audience: { userIds: due.map((o) => o.claimedById) },
      });
      const supervisors = await resolveAudience({
        companyId: store.companyId,
        storeId: store.id,
        audience: { permission: 'confirmation.supervise' },
      });
      const byId = new Map(people.map((u) => [u.id, u]));

      for (const order of due) {
        const message = `الطلب ${order.orderNumber} مؤجَّل حتى ${order.postponedUntil?.toISOString().slice(0, 10)}`;
        // Only a PERSONAL row counts as "already told". A row from before
        // stage 17 is history nobody but a supervisor can see, and counting
        // it would leave the agent holding the order never told at all.
        const already = await db.notification.findFirst({
          where: {
            companyId: store.companyId,
            type: 'POSTPONED_DUE',
            message,
            userId: { not: null },
            storeId: store.id,
          },
          select: { id: true },
        });
        if (already) continue;

        const holder = order.claimedById ? byId.get(order.claimedById) : undefined;
        const told = await createNotification({
          companyId: store.companyId,
          storeId: store.id,
          audience: {},
          recipients: holder ? [...supervisors, holder] : supervisors,
          title: 'طلب مؤجَّل حان موعده',
          message,
          type: 'POSTPONED_DUE',
          link: '/confirmation/postponed',
        });
        if (told) notified++;
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
  at: '09:00',
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

      // Once per STORE per day, to whoever receives this store's returns.
      // The check used to be per company, so after the first store nobody
      // else heard about theirs that day.
      if (stale.length > 0) {
        const today = now.toISOString().slice(0, 10);
        const already = await db.notification.findFirst({
          where: {
            companyId: store.companyId,
            storeId: store.id,
            type: 'RETURNS_NOT_RECEIVED',
            createdAt: { gte: new Date(`${today}T00:00:00.000Z`) },
          },
          select: { id: true },
        });
        if (!already) {
          await createNotification({
            companyId: store.companyId,
            storeId: store.id,
            audience: { permission: 'ops.returns' },
            title: 'مرتجعات لم تُستلم',
            message: `${stale.length} مرتجعاً معلناً لم يُستلم فعلياً — أقدمها ${stale[0].orderNumber}`,
            type: 'RETURNS_NOT_RECEIVED',
            link: '/ops/returns',
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
  // Before people leave. A reminder to count the drawer that arrives
  // after everyone has gone home is a reminder about tomorrow.
  at: '16:45',
  description: 'تذكير بالإغلاق اليومي لكل محفظة',
  async run({ now }): Promise<JobResult> {
    const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    let pending = 0;

    // Only wallets that belong to a store. The closing screen lists the
    // wallets of the store you are in, so a reminder about a wallet with no
    // store is one nobody can act on — and it reached every cash-holder in
    // the company, in every country.
    const wallets = await db.wallet.findMany({
      where: { isActive: true, storeId: { not: null } },
      select: { id: true, name: true, companyId: true, storeId: true },
    });

    for (const wallet of wallets) {
      const closing = await db.dailyClosing.findUnique({
        where: { walletId_date: { walletId: wallet.id, date: day } },
        select: { id: true, status: true },
      });
      if (closing?.status === 'APPROVED') continue;

      const blocker = await blockingClosing(db, wallet.id, day);
      pending++;

      // Once per WALLET per day, keyed on the wallet's id carried in the
      // link. Keying on the name failed twice over: «نقد» matched the
      // message of «نقد: فرع», and two wallets may share a name.
      const link = `/finance/closing?wallet=${wallet.id}`;
      const already = await db.notification.findFirst({
        where: {
          companyId: wallet.companyId,
          storeId: wallet.storeId,
          type: 'CLOSING_DUE',
          link,
          createdAt: { gte: day },
        },
        select: { id: true },
      });
      if (already) continue;

      // To whoever counts the cash (finance.cashbox, the closing screen's
      // own gate) and can enter the wallet's store.
      await createNotification({
        companyId: wallet.companyId,
        storeId: wallet.storeId,
        audience: { permission: 'finance.cashbox' },
        title: 'الإغلاق اليومي',
        message: blocker
          ? `${wallet.name}: إغلاق سابق بفرق غير مفسَّر يمنع إغلاق اليوم`
          : `${wallet.name}: لم يُسجَّل جرد اليوم بعد`,
        type: 'CLOSING_DUE',
        link,
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

/**
 * SENDING THE CONVERSIONS THE ORDERS OWE.
 *
 * The other half of the same idea as the job above, to a different kind of
 * receiver. An order reaching a moment the seller marked as a conversion
 * wrote a row; this sends it to Meta.
 *
 * Kept apart from deliver-app-events on purpose. A webhook goes to a server
 * we know nothing about and is allowed to be slow or broken; Meta is one
 * endpoint with its own rate limits, and a shop's own integrations failing
 * must not stop its advertising from being told what it sold.
 */
export const deliverConversions: JobDefinition = {
  name: 'deliver-conversions',
  everySeconds: 60,
  description: 'إرسال التحويلات المخصّصة إلى ميتا',
  async run(): Promise<JobResult> {
    const due = await dueConversions(50);
    if (due.length === 0) return { processed: 0, detail: 'لا تحويلات معلّقة' };

    let ok = 0;
    for (const d of due) {
      // One at a time. Fifty parallel calls is the fastest way to meet
      // Meta's rate limit, and a rate limit costs every shop on this
      // deployment, not only the busy one.
      if (await deliverConversion(d.id)) ok++;
    }
    return { processed: due.length, detail: `أُرسل ${ok} من ${due.length}` };
  },
};


/**
 * Commission that only a closed span can answer.
 *
 * "150 confirmed in a day" is not a fact about any one order, so it cannot
 * be accrued at delivery like the rest. This runs after each span has
 * closed and writes one entry per person per rule, carrying the span it
 * covers and what was counted in it.
 *
 * It always works on the span that has ENDED, never the running one: a
 * figure that the next order changes is not a record of anything. Running
 * twice is safe — the database holds one entry per person, rule and span.
 */
export const accruePeriodCommission: JobDefinition = {
  name: 'accrue-period-commission',
  everySeconds: 3_600,
  description: 'احتساب عمولات الشرائح للفترات المنتهية',
  async run(): Promise<JobResult> {
    let created = 0;
    let amount = 0;
    const skipped: Record<string, number> = {};
    const now = new Date();

    for (const store of await activeStores()) {
      for (const span of SPANS) {
        const { start, end } = lastClosedSpan(span, now);
        const result = await db.$transaction((tx) =>
          accrueForPeriod(tx, {
            companyId: store.companyId,
            storeId: store.id,
            span,
            start,
            end,
            minorUnit: store.country.minorUnit,
            currencyCode: store.country.currencyCode,
          })
        );
        created += result.created;
        amount += result.amount;
        for (const [why, n] of Object.entries(result.skipped)) skipped[why] = (skipped[why] ?? 0) + n;
      }
    }

    const reasons = Object.entries(skipped)
      .map(([reason, count]) => `${count} ${SKIP_AR[reason] ?? reason}`)
      .join(' · ');

    return {
      processed: created,
      detail: created
        ? `احتُسبت ${created} عمولة فترة بمجموع ${amount.toFixed(2)}${reasons ? ` · ${reasons}` : ''}`
        : reasons || 'لا قواعد فترات مستحقة',
    };
  },
};

/**
 * Yesterday's days, read and PROPOSED as deductions. Never applied.
 *
 * Deliberately yesterday and not today: a day still being worked has no
 * departure time, so "left early" would be true of everybody at noon. And
 * deliberately proposals only — this job can be wrong about a funeral, a
 * closed road or a shift swapped by phone, and a human is the part of the
 * system that knows about those.
 */
export const proposePenaltiesJob: JobDefinition = {
  name: 'propose-penalties',
  everySeconds: 86_400,
  // Early, and about YESTERDAY — a day still being worked has no
  // departure time, so everybody would read as having left early.
  at: '07:00',
  description: 'اقتراح خصومات الأمس على التأخير والغياب — بلا اعتماد',
  async run({ now }): Promise<JobResult> {
    let proposed = 0;
    const skipped: string[] = [];

    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);

    for (const store of await activeStores()) {
      if (!store.country) continue;

      const rules = await db.penaltyRule.count({ where: { companyId: store.companyId, isActive: true } });
      if (rules === 0) {
        skipped.push(`${store.id}: لا قواعد`);
        continue;
      }

      const people = await db.user.findMany({
        where: {
          companyId: store.companyId,
          status: 'ACTIVE',
          OR: [{ storeAccess: { some: { storeId: store.id } } }, { storeAccess: { none: {} } }],
        },
        select: { id: true, role: true, shiftStart: true, shiftEnd: true, restDays: true },
      });

      const scope = {
        companyId: store.companyId,
        storeId: store.id,
        start,
        end,
        calendar: {
          workHoursStart: store.country.workHoursStart,
          workHoursEnd: store.country.workHoursEnd,
          weekendDays: store.country.weekendDays,
          timezone: store.country.timezone,
        },
      };

      const proposals = await proposePenalties(
        db,
        scope,
        people.map((p) => ({
          id: p.id,
          role: p.role,
          shift: { shiftStart: p.shiftStart, shiftEnd: p.shiftEnd, restDays: p.restDays },
        }))
      );
      proposed += await recordProposals(db, scope, proposals);
    }

    return {
      processed: proposed,
      detail:
        proposed > 0
          ? `${proposed} خصماً مقترحاً بانتظار القرار — لم يُعتمد شيء`
          : skipped.join(' · ') || 'لا شيء يُقترح',
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
  accruePeriodCommission,
  deliverAppEvents,
  deliverConversions,
  proposePenaltiesJob,
];

export function jobByName(name: string): JobDefinition | undefined {
  return JOBS.find((j) => j.name === name);
}
