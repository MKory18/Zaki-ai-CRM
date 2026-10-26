import { readLimit } from '@/lib/numeric-input';
import { requireSystemToken } from '@/lib/v1/system-token';
import { requestIdOf, v1ErrorResponse, v1Ok } from '@/lib/v1/door';
import {
  PAGE_DEFAULT,
  PAGE_MAX,
  decodeCursor,
  readAttributionPage,
  readSince,
} from '@/lib/v1/attribution';

/**
 * GET /api/v1/orders/attribution?updated_since=…&cursor=…&limit=…
 *
 * «Which ad did each order come from, and what became of it?» — the media
 * buyer's hourly read. `{ items, next_cursor }`; follow `next_cursor` until
 * it is null. Every rule lives in `src/lib/v1/attribution.ts`: the status
 * mapping, the moments, the money, and above all the absence of the
 * customer.
 *
 * Its own scope, `orders.attribution.read`: the replies system holds
 * `orders.read` to ask after ONE order it raised, and must not be able to
 * page through every order the company has because a second system needed
 * to.
 */
export async function GET(req: Request) {
  const requestId = requestIdOf(req);
  try {
    const caller = await requireSystemToken(req, 'orders.attribution.read');
    const { searchParams } = new URL(req.url);

    const since = readSince(searchParams.get('updated_since'));
    const rawCursor = searchParams.get('cursor');
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    const limit = readLimit(searchParams, PAGE_DEFAULT, PAGE_MAX);

    const page = await readAttributionPage({
      companyId: caller.companyId,
      since,
      cursor,
      limit,
      // Where a landing page answers when it has no live domain of its own —
      // the same origin the conversions code builds `event_source_url` from.
      origin: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL,
    });

    return v1Ok(requestId, page);
  } catch (error) {
    return v1ErrorResponse(requestId, error);
  }
}
