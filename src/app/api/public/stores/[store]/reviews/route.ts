import { NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getStorefront } from '@/lib/storefront';
import { REVIEW_REFUSAL, ratingSubmission, ratingTarget, submitRating } from '@/lib/product-reviews';

/**
 * ONE RATING, FOR ONE DELIVERED ORDER, FROM A SIGNED LINK.
 *
 * POST, and the token is in the BODY. A credential in a query string ends
 * up in the browser's history, the server's access log and the referrer of
 * whatever the customer opens next — the shape of the request is the
 * privacy decision, the same one `/track` makes beside it.
 *
 * ── THE THREE REFUSALS, AND WHY THEY ARE DIFFERENT SENTENCES ──
 *
 * `/track` answers every failure identically, because a stranger can ask it
 * about anybody's order. This door is different: the link is already in the
 * hand of whoever took delivery, and a forged one cannot be made without
 * the installation's secret. So «لقد قيّمت هذا الطلب من قبل» is said out
 * loud, which saves a customer from pressing the button nine more times and
 * tells an attacker nothing they could not already compute.
 *
 * The one pair that is NOT told apart: a bad signature and a valid link for
 * ANOTHER SHOP'S order. Both answer BAD_LINK, because the difference would
 * say «that order exists, elsewhere».
 *
 * ── AND IT IS RATE LIMITED ──
 *
 * Not because a link can be guessed — it is a 128-bit HMAC — but because
 * this door WRITES, and a public door that writes is a door somebody will
 * point a loop at. Two limits, the way `/track` has two: per address, and
 * per shop, so one shop being hammered does not spend the whole node's
 * budget.
 */

interface Ctx {
  params: Promise<{ store: string }>;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** A token, five numbers and six hundred characters of opinion. */
const MAX_BODY_BYTES = 8 * 1024;

const refuse = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status, headers: CORS });

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { store: slug } = await ctx.params;
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) return refuse(REVIEW_REFUSAL.BAD_LINK, 404);

    const ip = getClientIp(req);
    const byIp = rateLimit(`review_ip:${ip}`, 10, 10 * 60_000);
    if (!byIp.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة جدًا. أعد المحاولة بعد ${byIp.retryAfterSec} ثانية` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(byIp.retryAfterSec) } }
      );
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) return refuse('النص أطول من المسموح');

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return refuse(REVIEW_REFUSAL.BAD_LINK);
    }

    const body = (raw ?? {}) as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token.trim().slice(0, 120) : '';
    if (!token) return refuse(REVIEW_REFUSAL.BAD_LINK);

    // A shop that is not open reads as absent, exactly as it does on every
    // other public door.
    const store = await getStorefront(slug);
    if (!store) return refuse(REVIEW_REFUSAL.BAD_LINK, 404);

    const byStore = rateLimit(`review_store:${store.id}`, 60, 10 * 60_000);
    if (!byStore.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة جدًا. أعد المحاولة بعد ${byStore.retryAfterSec} ثانية` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(byStore.retryAfterSec) } }
      );
    }

    /*
     * THE LINK IS CHECKED BEFORE THE BODY IS READ AS A SUBMISSION.
     *
     * Validating the stars first would answer «rating must be 1–5» to
     * somebody holding a link for a shop they do not belong to, which is
     * a word about an order they cannot see.
     */
    const checked = await ratingTarget(token, { id: store.id, companyId: store.companyId });
    if (!checked.ok) {
      return refuse(
        REVIEW_REFUSAL[checked.refusal],
        checked.refusal === 'ALREADY_RATED' ? 409 : 400
      );
    }

    const parsed = ratingSubmission.safeParse(raw);
    if (!parsed.success) {
      // The commonest failure by far is the untouched tick, and it is the
      // one worth naming: everything else in this form has a default.
      return refuse('لازم توافق على النشر قبل الإرسال، والتقييم من 1 إلى 5.');
    }

    const written = await submitRating(checked.target, parsed.data);
    if (!written.ok) {
      return refuse(REVIEW_REFUSAL[written.refusal], written.refusal === 'ALREADY_RATED' ? 409 : 400);
    }

    /*
     * WHAT COMES BACK IS NOT THE REVIEW.
     *
     * It lands PENDING — a customer's words go in front of other customers
     * after somebody has read them — so echoing the row would show the
     * customer their own text as though it were live. One acknowledgement,
     * and the page says plainly that it is read first.
     */
    return NextResponse.json(
      { success: true },
      { headers: { ...CORS, 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('POST /api/public/stores/[store]/reviews', e);
    return NextResponse.json({ error: 'تعذّر إرسال التقييم الآن' }, { status: 500, headers: CORS });
  }
}
