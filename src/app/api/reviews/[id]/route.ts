import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { HIDE_REASONS, hideReview, publishReview } from '@/lib/product-reviews';

/**
 * PUBLISH IT, OR HIDE IT AND SAY WHY.
 *
 * Owner decision D8. Two acts on one review, one route, and NEITHER OF THEM
 * IS A DELETE. A review is a customer's words; the shop may decline to show
 * them and may not make them never have existed — which is also what makes
 * the audit trail worth reading.
 *
 * `storefront.manage` and not `.view`: deciding what a shopper sees is a
 * different authority from looking at the list.
 *
 * THE SERVICE DOES THE WORK AND THE WRITING. `publishReview` and
 * `hideReview` hold the rules — consent is the customer's and not the
 * moderator's, a hide costs a reason, both land in the audit log, and
 * publishing asks whether this product has earned its automatic source. A
 * route that reimplemented any of that would be a second place deciding it.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish') }),
  z.object({
    action: z.literal('hide'),
    /**
     * ONE OF THREE, AND THERE IS NO «OTHER».
     *
     * «hide only for abuse, personal data or off-topic». A free-text reason
     * would be a delete button with a text box: whatever the moderator
     * typed, the review would be gone and the average would move. The note
     * beside it is the detail, not the reason.
     */
    reason: z.enum(HIDE_REASONS),
    note: z.string().max(300).optional(),
  }),
]);

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('storefront.manage');
    const { id } = await ctx.params;

    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'الإخفاء لازمه سبب: إساءة أو بيانات شخصية أو خارج الموضوع.' },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'publish') {
      const done = await publishReview({ companyId, reviewId: id, userId: user.id });
      if (!done.ok) {
        /*
         * «لم يوافق صاحبه على النشر» and not «غير موجود».
         *
         * A moderator pressing «نشر» and watching nothing happen would
         * conclude the screen is broken. The missing half is the
         * CUSTOMER's consent, it is not the moderator's to supply, and
         * saying so is the only useful answer.
         */
        return NextResponse.json(
          { error: 'ما بينشر: إما المراجعة غير موجودة أو صاحبها ما وافق على النشر.' },
          { status: 400 }
        );
      }
      // `switched` is true when this publish took the product over the
      // five-verified floor. The screen says so, because a page that
      // changed what it shows without telling the seller is a page they
      // stop trusting.
      return NextResponse.json({ success: true, switchedToAuto: done.switched });
    }

    const done = await hideReview({
      companyId,
      reviewId: id,
      userId: user.id,
      reason: parsed.data.reason,
      note: parsed.data.note,
    });
    if (!done.ok) return NextResponse.json({ error: done.error ?? 'تعذّر الإخفاء' }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
