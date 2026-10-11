import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { apiErrorResponse } from '@/lib/api-error';
import { ETA_LEVEL_AR, deliveryWindowAr, deliveryWindows, windowWithLevel } from '@/lib/delivery-time';

/**
 * GET /api/orders/eta?regionId=…&address=…
 *
 * HOW LONG THIS ONE WILL TAKE, for the order being typed right now.
 *
 * «لما أدخل طلب بالمدينة والعنوان يعطيني خلال كم الفترة المتوقعة للاستلام».
 * `/api/geo/regions` already carries the governorate's window — it comes
 * with the list, so the sentence appears the moment a governorate is picked
 * and costs no extra call. What it CANNOT carry is the address: the list is
 * governorates, and the address is typed afterwards.
 *
 * So this door answers the finer question, and answers it with the SAME
 * engine: `windowWithLevel` is the one lookup both use, so the sentence
 * never changes its mind between the two.
 *
 * WHY THE ARITHMETIC IS NOT IN THE SCREEN. It cannot be: the day-counts
 * belong to other people's orders, which no order form may read. And a
 * median computed in a browser is a second median — this system has paid
 * for a second copy of a formula more than once.
 *
 * ACCESS. Whoever may create an order may ask how long it will take: the
 * answer is a count of days over the shop's own deliveries, with no
 * customer, no order and no money in it.
 */
export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    const { searchParams } = new URL(req.url);
    const regionId = searchParams.get('regionId')?.trim() || null;
    const address = searchParams.get('address')?.trim() || null;

    /*
     * THE GOVERNORATE'S NAME, because the stored addresses repeat it at the
     * front — «عمّان - عمّان الصويفية» — and the key is the part after it.
     * Read here rather than taken from the query so a caller cannot change
     * which street its address folds to by sending a different name.
     *
     * Scoped to the company's country through the region row itself: an id
     * from another country finds nothing and the answer falls back.
     */
    const region = regionId
      ? await db.region.findFirst({
          where: { id: regionId, country: { stores: { some: { companyId } } } },
          select: { id: true, name: true },
        })
      : null;

    const windows = await deliveryWindows({ companyId, storeId });
    const found = windowWithLevel(
      windows,
      region?.id ?? null,
      address ? { text: address, governorate: region?.name ?? null } : undefined
    );

    if (!found) {
      /*
       * NOTHING IS AN ANSWER, and it is the right one here.
       *
       * Measured on this database when this was written: 26 delivered
       * orders, every one of them with `deliveredAt` within a SECOND of
       * `shippedAt`, and one governorate carrying all of them. There are no
       * real durations to learn yet. Inventing «يومين» out of that would be
       * a promise the shop meets at a customer's door.
       */
      return NextResponse.json({
        window: null,
        ar: null,
        level: null,
        levelAr: null,
        reason: 'لا توجد تسليمات سابقة كافية لتقدير المدّة',
      });
    }

    return NextResponse.json({
      window: found.window,
      ar: deliveryWindowAr(found.window),
      level: found.level,
      levelAr: ETA_LEVEL_AR[found.level],
      reason: null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
