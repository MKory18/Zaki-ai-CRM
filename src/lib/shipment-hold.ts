import { hasLeftWarehouse, type StateSource } from './order-state';

/**
 * DOES POSTPONING A SHIPMENT PUT ITS GOODS BACK ON SALE?
 *
 * The owner ruled that it does: «ما زال الزبون يريده؟ الغيها ك خيار، وما
 * تحجز رصيد الا بعد ما اشيلو من التأجيل وارجعو لانشاء شحنة». A postponement
 * used to reserve the units for the whole of its length, so a hopeful
 * three-week date took stock off the shelf that a customer ready to buy
 * today could not be sold — and the person pressing the button had not
 * spoken to anybody.
 *
 * ── EXCEPT WHEN THE PARCEL IS ALREADY OUT ──
 *
 * Releasing a reservation says «these units are on the shelf again». Once
 * the waybill is printed or the parcel is standing on the pickup shelf, they
 * are not: they are packed, addressed, and physically gone from the pile
 * anybody else can be sold from. Freeing them there would not return stock,
 * it would INVENT it — the same defect `stock-consumption` records about
 * putting back units that never left, seen from the other end.
 *
 * `hasLeftWarehouse` is the existing line for exactly this question — «may
 * these units be counted available again» — and it is the one used, not a
 * second reading of the same statuses.
 *
 * Pure, so the rule can be read and tested without a database, and so the
 * route cannot hold a second opinion about it.
 */
export interface HoldReservation {
  /** True when the units go back on sale for the length of the postponement. */
  releases: boolean;
  /** One sentence, for the person who pressed the button. */
  why: string;
}

export function holdReservation(order: StateSource): HoldReservation {
  if (hasLeftWarehouse(order)) {
    return {
      releases: false,
      why: 'الطرد خرج من المستودع — بضاعتُه مُعبَّأةٌ باسم هذا الطلب ولا تعود للبيع بالتأجيل',
    };
  }
  return {
    releases: true,
    why: 'بضاعتُه تعود للبيع خلال التأجيل، وتُحجَز من جديد حين تُبنى الشحنة',
  };
}
