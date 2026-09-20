import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { roundMinor } from '@/lib/money';

/**
 * GET /api/control/discount-alerts — what was given away, and by whom.
 *
 * A confirmation agent can discount to save a sale. One discount is a
 * judgement call; the same agent discounting every order is a pattern, and a
 * pattern is only visible when the discounts are read together.
 *
 * So this returns two things: the orders carrying a discount, and a summary
 * per person. The percentage is computed here — the screen renders numbers,
 * it does not derive them.
 *
 * Nothing is approved or reversed here. It is a place to look, and the
 * correction happens on the order itself.
 */

/** Above this share of the order, a discount is called out rather than listed. */
const NOTABLE_SHARE = 0.15;

export async function GET(req: Request) {
  try {
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('control.discount_alerts');

    const q = new URL(req.url).searchParams;
    const days = Math.min(Math.max(Number(q.get('days') ?? 30), 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await db.order.findMany({
      where: {
        companyId,
        storeId,
        discountAmount: { gt: 0 },
        createdAt: { gte: since },
      },
      orderBy: { discountAmount: 'desc' },
      take: 300,
      select: {
        id: true, orderNumber: true, merchantRef: true, createdAt: true,
        discountAmount: true, totalAmount: true, sellingPrice: true, currency: true,
        confirmationStatus: true, shippingStatus: true,
        customer: { select: { fullName: true } },
        moderator: { select: { id: true, name: true } },
        confirmer: { select: { id: true, name: true } },
      },
    });

    const rows = orders.map((o) => {
      const discount = Number(o.discountAmount);
      // Against what the order would have been before the discount.
      const gross = Number(o.totalAmount) + discount;
      const share = gross > 0 ? discount / gross : 0;
      // Whoever confirmed it is who granted it; the moderator is the fallback.
      const by = o.confirmer ?? o.moderator;

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        merchantRef: o.merchantRef,
        createdAt: o.createdAt,
        customerName: o.customer?.fullName ?? null,
        discount: roundMinor(discount, country.minorUnit),
        total: roundMinor(Number(o.totalAmount), country.minorUnit),
        share: Math.round(share * 1000) / 10, // one decimal place, as a percentage
        notable: share >= NOTABLE_SHARE,
        currency: o.currency,
        byId: by?.id ?? null,
        byName: by?.name ?? null,
        confirmationStatus: o.confirmationStatus,
        shippingStatus: o.shippingStatus,
      };
    });

    // Per person, so a habit shows up as a habit.
    const byPerson = new Map<string, { id: string | null; name: string; orders: number; total: number; biggestShare: number }>();
    for (const row of rows) {
      const key = row.byId ?? 'unknown';
      const entry = byPerson.get(key) ?? {
        id: row.byId,
        name: row.byName ?? 'غير محدَّد',
        orders: 0,
        total: 0,
        biggestShare: 0,
      };
      entry.orders++;
      entry.total = roundMinor(entry.total + row.discount, country.minorUnit);
      entry.biggestShare = Math.max(entry.biggestShare, row.share);
      byPerson.set(key, entry);
    }

    return NextResponse.json({
      days,
      currency: country.currencyCode,
      notableThreshold: NOTABLE_SHARE * 100,
      totals: {
        orders: rows.length,
        discount: roundMinor(rows.reduce((sum, r) => sum + r.discount, 0), country.minorUnit),
        notable: rows.filter((r) => r.notable).length,
      },
      byPerson: [...byPerson.values()].sort((a, b) => b.total - a.total),
      orders: rows,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
