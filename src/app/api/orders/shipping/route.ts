import { NextResponse } from 'next/server';
import { requireContext } from '@/lib/geo-context';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * GET /api/orders/shipping — CLOSED (410), and why it is closed rather than
 * fixed.
 *
 * It was the shipping queues before the shipping screens existed. Nothing
 * calls it now: «الشحن الجديد», «الدفعات» and «التتبّع» each read their own
 * door under `/api/ops/*`. What it still did was answer anyone holding
 * `orders.view` with every queue's customers — names, phones, addresses —
 * narrowed to their own orders only for three role NAMES, so a custom role
 * built from the same keys read everything.
 *
 * Fixing a door nobody walks through would mean keeping a second copy of
 * the shipping rules in step with the first for ever. So it answers 410 with
 * where to go, and the git history keeps what it was. The sub-route
 * `/api/orders/shipping/performance` is a different door and still works.
 */
export async function GET() {
  try {
    await requireContext();
    return NextResponse.json(
      {
        error: 'هالباب انسكّر — طوابير الشحن بشاشات الشحن الجديد والدفعات والتتبّع.',
        errorAr: 'هالباب انسكّر — طوابير الشحن بشاشات الشحن الجديد والدفعات والتتبّع.',
        code: 'GONE',
      },
      { status: 410 }
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
