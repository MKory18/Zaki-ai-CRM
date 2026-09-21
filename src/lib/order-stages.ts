import { deriveCoreState, getZone, type StateSource, type Zone } from './order-state';

/**
 * AN ORDER'S JOURNEY, AS FIVE STAGES.
 *
 * The stages are the contract's own work zones — intake, confirmation,
 * warehouse, transit, closed — not a sixth vocabulary invented for a screen.
 * A stage is reached when the order's own timestamps say it was reached, so
 * this is derived exactly like the state and the zone are: nothing here is
 * stored, and nothing can drift out of step with the order.
 *
 * A passed stage is a record of something that happened. It carries the
 * moment and the person, and it is never editable — correcting history by
 * overwriting it is how a system stops being able to answer "what happened".
 */

export type StageKey = 'INTAKE' | 'CONFIRMATION' | 'WAREHOUSE' | 'TRANSIT' | 'CLOSED';
export type StageStatus = 'DONE' | 'CURRENT' | 'PENDING' | 'SKIPPED';

export interface StageFact {
  label: string;
  value: string;
}

export interface Stage {
  key: StageKey;
  title: string;
  status: StageStatus;
  /** When this stage was entered, if it was. */
  at: Date | null;
  who: string | null;
  facts: StageFact[];
}

/** The order of the journey. A stage is DONE once a later one has begun. */
const ORDER: StageKey[] = ['INTAKE', 'CONFIRMATION', 'WAREHOUSE', 'TRANSIT', 'CLOSED'];

const TITLES: Record<StageKey, string> = {
  INTAKE: 'الإدخال',
  CONFIRMATION: 'التأكيد',
  WAREHOUSE: 'التجهيز',
  TRANSIT: 'الشحن',
  CLOSED: 'الإغلاق',
};

/** A zone maps onto the stage of the same name; VOIDED closes the journey. */
function stageOfZone(zone: Zone): StageKey {
  return zone as StageKey;
}

export interface StageSource extends StateSource {
  createdAt: Date | string;
  claimedAt?: Date | string | null;
  confirmedAt?: Date | string | null;
  outForDeliveryAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  returnedAt?: Date | string | null;
  failedAt?: Date | string | null;
  source?: string | null;
  moderator?: { name: string } | null;
  claimer?: { name: string } | null;
  deliveryProvider?: { name: string } | null;
  trackingNumber?: string | null;
  quantity?: number;
  collectedAmount?: number | string | null;
}

const date = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * The five stages for one order.
 *
 * `contactAttempts` and `deliveryAttempts` are counts the caller already has;
 * they are facts of their stage rather than a reason to query again here.
 */
export function orderStages(
  order: StageSource,
  counts: { contactAttempts?: number; deliveryAttempts?: number } = {}
): Stage[] {
  const state = deriveCoreState(order);
  const currentStage = state === 'VOIDED' ? 'CLOSED' : stageOfZone(getZone(state));
  const currentIndex = ORDER.indexOf(currentStage);

  const claimedAt = date(order.claimedAt);
  const confirmedAt = date(order.confirmedAt);
  const shippedAt = date(order.shippedAt as Date | string | null);
  const deliveredAt = date(order.deliveredAt);
  const returnedAt = date(order.returnedAt);

  /** When each stage began, as far as the order's own record shows. */
  const enteredAt: Record<StageKey, Date | null> = {
    INTAKE: date(order.createdAt),
    CONFIRMATION: claimedAt,
    // Confirmation is what releases an order to the warehouse.
    WAREHOUSE: confirmedAt,
    TRANSIT: shippedAt,
    CLOSED: deliveredAt ?? returnedAt ?? date(order.failedAt),
  };

  return ORDER.map((key, index) => {
    let status: StageStatus;
    if (index < currentIndex) {
      // Passed. A stage the order went through without leaving a timestamp
      // was passed over rather than worked — say so instead of inventing one.
      status = enteredAt[key] ? 'DONE' : 'SKIPPED';
    } else if (index === currentIndex) {
      status = 'CURRENT';
    } else {
      status = 'PENDING';
    }

    const facts: StageFact[] = [];
    let who: string | null = null;

    switch (key) {
      case 'INTAKE':
        who = order.moderator?.name ?? null;
        if (order.source) facts.push({ label: 'القناة', value: order.source });
        if (order.quantity) facts.push({ label: 'الكمية', value: String(order.quantity) });
        break;

      case 'CONFIRMATION':
        who = order.claimer?.name ?? null;
        if (counts.contactAttempts) {
          facts.push({ label: 'محاولات التواصل', value: String(counts.contactAttempts) });
        }
        if (confirmedAt) facts.push({ label: 'أُكّد', value: 'نعم' });
        break;

      case 'WAREHOUSE':
        if (order.shippingStatus === 'PACKING') facts.push({ label: 'الحالة', value: 'قيد التغليف' });
        if (order.shippingStatus === 'READY_FOR_PICKUP') facts.push({ label: 'الحالة', value: 'بانتظار المندوب' });
        break;

      case 'TRANSIT':
        if (order.deliveryProvider?.name) facts.push({ label: 'الشركة', value: order.deliveryProvider.name });
        if (order.trackingNumber) facts.push({ label: 'التتبع', value: order.trackingNumber });
        if (counts.deliveryAttempts) {
          facts.push({ label: 'محاولات التوصيل', value: String(counts.deliveryAttempts) });
        }
        break;

      case 'CLOSED': {
        const ending =
          state === 'DELIVERED' ? 'سُلّم'
          : state === 'PARTIALLY_DELIVERED' ? 'سُلّم جزئياً'
          : state === 'RETURNED' ? 'مرتجع'
          : state === 'CANCELLED' ? 'ملغي'
          : state === 'VOIDED' ? 'مُبطَل'
          : null;
        if (ending) facts.push({ label: 'النتيجة', value: ending });
        const collected = Number(order.collectedAmount ?? 0);
        if (collected > 0) facts.push({ label: 'المحصَّل', value: String(collected) });
        break;
      }
    }

    return { key, title: TITLES[key], status, at: enteredAt[key], who, facts };
  });
}
