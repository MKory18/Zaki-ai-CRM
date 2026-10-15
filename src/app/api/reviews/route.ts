import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { readLimit, readPage } from '@/lib/numeric-input';
import { typed } from '@/lib/text-search';
import {
  REVIEW_STATUSES,
  publicReview,
  reviewAverage,
  reviewMode,
  verified,
  type ReviewStatus,
} from '@/lib/product-reviews';

/**
 * THE MODERATION LIST — every rating this store's buyers left.
 *
 * Owner decision D8. It is the screen behind «الآراء», and it shows the
 * three states a review can be in: بانتظار المراجعة · منشور · مخفي. A
 * pending one is a customer's words that nobody has read yet; a hidden one
 * carries the reason it was hidden and who hid it, because moderation whose
 * uses are not recorded is a way to quietly curate an average.
 *
 * SCOPED TO THE STORE, not the company. The store bar above the screen says
 * which shop is being edited, and a review belongs to the shop whose
 * customer wrote it. `requireContext` resolves that store and the geo rules
 * decide whether this user may enter it at all.
 *
 * THE PAGING GOES THROUGH `readPage`, and the search through `typed()`:
 * guards walk this repository for both, and a door that rolls its own is
 * the door that answers 500 to `?page=abc` or finds nothing for a name
 * typed in lowercase.
 */
export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('storefront.view');

    const { searchParams } = new URL(req.url);
    const page = readPage(searchParams);
    const limit = readLimit(searchParams, 25, 100);

    const askedStatus = searchParams.get('status') ?? '';
    const status = (REVIEW_STATUSES as readonly string[]).includes(askedStatus)
      ? (askedStatus as ReviewStatus)
      : null;

    /*
     * WHAT A MODERATOR SEARCHES BY.
     *
     * A first name, a city, and the words themselves — because the reason
     * somebody comes to this screen is usually «somebody told me there is
     * a review mentioning X». `typed()` and not `contains`, so the shift
     * key is not part of the question.
     */
    const term = (searchParams.get('q') ?? '').trim().slice(0, 80);
    const search = term
      ? {
          OR: [
            { firstName: typed(term) },
            { city: typed(term) },
            { text: typed(term) },
            { product: { name: typed(term) } },
          ],
        }
      : {};

    const where = {
      companyId,
      storeId: storeId ?? undefined,
      ...(status ? { status } : {}),
      ...search,
    };

    const [total, rows, counts] = await Promise.all([
      db.productReview.count({ where }),
      db.productReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          productId: true,
          orderId: true,
          rating: true,
          text: true,
          firstName: true,
          city: true,
          source: true,
          status: true,
          consent: true,
          publishedAt: true,
          createdAt: true,
          hiddenReason: true,
          proofImage: true,
          product: { select: { id: true, name: true, reviewMode: true } },
          hiddenBy: { select: { id: true, name: true } },
        },
      }),
      db.productReview.groupBy({
        by: ['status'],
        where: { companyId, storeId: storeId ?? undefined },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      reviews: rows.map((r) => ({
        // The shopper's view, plus the three things only a moderator sees.
        ...publicReview(r),
        productId: r.productId,
        productName: r.product?.name ?? '',
        productReviewMode: reviewMode(r.product?.reviewMode),
        source: r.source,
        status: r.status,
        consent: r.consent,
        // «مشتري مؤكَّد» from the one place that decides it. Never from
        // `source`: a row whose source says «order» and whose order is
        // gone is no longer checkable, and this says so.
        verified: verified(r),
        hiddenReason: r.hiddenReason,
        hiddenByName: r.hiddenBy?.name ?? null,
        /*
         * WHETHER THERE IS A PROOF IMAGE — NOT THE IMAGE.
         *
         * A manual item's proof is a screenshot of somebody's WhatsApp. It
         * is kept so the claim can be checked and it is never sent to a
         * page; a boolean is the whole of what a list needs to say «this
         * one has proof behind it».
         */
        hasProof: Boolean(r.proofImage),
      })),
      // The tabs' numbers, so the screen does not have to count what it
      // has not loaded.
      tally: Object.fromEntries(REVIEW_STATUSES.map((s) => [
        s,
        counts.find((c) => c.status === s)?._count._all ?? 0,
      ])),
      // The average over what is actually SHOWN, which is the number the
      // seller is being asked to stand behind.
      shown: reviewAverage(rows.filter((r) => r.status === 'PUBLISHED' && r.consent)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
