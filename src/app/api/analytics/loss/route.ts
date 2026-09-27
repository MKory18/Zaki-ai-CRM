import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { getDateRange, type DateFilter } from '@/lib/analytics';
import { summariseLoss, type LossRow } from '@/lib/loss-analysis';

/**
 * GET /api/analytics/loss — why orders died, and which of it cost money.
 *
 * The reading itself is `summariseLoss`, which takes rows and no database.
 * This route's only job is to say what the rows are, and the only part of
 * that worth arguing about is the money.
 *
 * WHAT AN AFTER-SHIPPING LOSS ACTUALLY COST:
 *
 *   the delivery fee on the order — a snapshot taken when it shipped, so it
 *   is what was agreed for that parcel and not what the table says today;
 *
 *   plus the courier's return fee for bringing it back, which lives per
 *   (courier, region) in `delivery_fees`. Read the same way the returns
 *   screen reads it — `returnFee || fee`, because a courier who charges
 *   nothing extra for a return still charged the outbound leg — so the two
 *   never disagree about one invoice;
 *
 *   plus the goods themselves when the parcel comes back damaged, which is
 *   the only case where the product does not go back on the shelf.
 *
 * Nothing is estimated. A fee we do not hold contributes zero and the row
 * still counts, because inventing an average would put a number on the
 * report that no invoice backs.
 */

/** Rows read per request. Past this the report says so rather than lying by omission. */
const MAX_ROWS = 5000;

export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('analytics.view');

    const { searchParams } = new URL(req.url);
    const filter: DateFilter = {
      period: (searchParams.get('period') as DateFilter['period']) || 'all',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    };
    const { start, end } = getDateRange(filter);
    const createdAt = start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } : undefined;

    const where = {
      companyId,
      ...(storeId ? { storeId } : {}),
      ...(createdAt ? { createdAt } : {}),
      OR: [
        { rejectionReason: { not: null } },
        { deliveryFailureReason: { not: null } },
        { returnReason: { not: null } },
      ],
    };

    const [orders, total, fees] = await Promise.all([
      db.order.findMany({
        where,
        select: {
          rejectionReason: true,
          deliveryFailureReason: true,
          returnReason: true,
          deliveryFee: true,
          productCost: true,
          quantity: true,
          regionId: true,
          deliveryProviderId: true,
        },
        take: MAX_ROWS,
      }),
      db.order.count({ where }),
      db.deliveryFee.findMany({
        where: { companyId, isActive: true },
        select: { regionId: true, deliveryProviderId: true, fee: true, returnFee: true },
      }),
    ]);

    // «this courier, this region» — the same key the row itself means.
    const returnFeeOf = new Map(
      fees.map((f) => [`${f.deliveryProviderId}:${f.regionId}`, Number(f.returnFee) || Number(f.fee)])
    );

    const rows: LossRow[] = [];
    const add = (row: LossRow) => {
      const at = rows.find((r) => r.field === row.field && r.reason === row.reason);
      if (at) {
        at.count += row.count;
        at.money += row.money;
      } else {
        rows.push({ ...row });
      }
    };

    for (const o of orders) {
      // Before confirmation, and it is counted whatever else is set: an order
      // rejected on the phone never reached a courier, so the two halves
      // cannot both be true of the same order.
      if (o.rejectionReason) {
        add({ field: 'rejectionReason', reason: o.rejectionReason, count: 1, money: 0 });
        continue;
      }

      const outbound = Number(o.deliveryFee ?? 0);
      const back =
        o.deliveryProviderId && o.regionId
          ? (returnFeeOf.get(`${o.deliveryProviderId}:${o.regionId}`) ?? 0)
          : 0;
      const goods =
        o.returnReason === 'DAMAGED_PRODUCT' ? Number(o.productCost ?? 0) * (o.quantity ?? 1) : 0;

      /**
       * ONE PARCEL, ONE BILL.
       *
       * A failed attempt that ends in a return has both fields set, and
       * charging the fees to each of them would double the money on the
       * report. The return is the later, final fact, so it carries the
       * invoice and the attempt keeps its count — which is what makes
       * «فشل التوصيل × ٩» readable beside «الإرجاع كلّفنا ٥٤».
       */
      if (o.returnReason) {
        add({ field: 'returnReason', reason: o.returnReason, count: 1, money: outbound + back + goods });
        if (o.deliveryFailureReason) {
          add({ field: 'deliveryFailureReason', reason: o.deliveryFailureReason, count: 1, money: 0 });
        }
        continue;
      }
      if (o.deliveryFailureReason) {
        add({ field: 'deliveryFailureReason', reason: o.deliveryFailureReason, count: 1, money: outbound });
      }
    }

    return NextResponse.json({
      ...summariseLoss(rows),
      period: filter.period || 'all',
      // Never a silent cap: a report that quietly dropped rows reads exactly
      // like one that found nothing more.
      scanned: orders.length,
      total,
      truncated: total > orders.length,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
