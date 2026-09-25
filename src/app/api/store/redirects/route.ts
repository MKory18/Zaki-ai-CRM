import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';
import {
  forgetRedirects,
  isSelfRedirect,
  mayClaimFrom,
  redirectCreateSchema,
} from '@/lib/store-redirects';

/**
 * GET  /api/store/redirects  — this shop's, suggestions first
 * POST /api/store/redirects  — add one by hand
 *
 * The store is the one the SESSION is in. A `from` path is checked against
 * what this shop actually owns (mayClaimFrom): the public space is shared,
 * so without that a shop could forward another company's live address to
 * its own and take their paid traffic.
 */

const select = {
  id: true, from: true, to: true, kind: true, hits: true,
  isActive: true, suggested: true, createdAt: true,
} as const;

export async function GET() {
  try {
    const { storeId, companyId } = await requireContext();
    await requirePermission('storefront.view');

    const store = await db.store.findFirst({ where: { id: storeId!, companyId }, select: { id: true, slug: true } });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    const redirects = await db.storeRedirect.findMany({
      where: { storeId: store.id, companyId },
      // Suggestions first: they are the ones waiting on a decision, and a
      // decision not taken is an advertisement still landing on a 404.
      orderBy: [{ suggested: 'desc' }, { createdAt: 'desc' }],
      select,
    });
    return NextResponse.json({ storeSlug: store.slug, redirects });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const parsed = redirectCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error), errorAr: zodMessage(parsed.error) }, { status: 400 });
    }

    const store = await db.store.findFirst({
      where: { id: storeId!, companyId },
      select: { id: true, slug: true, companyId: true },
    });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    if (isSelfRedirect(parsed.data.from, parsed.data.to)) {
      return NextResponse.json(
        { error: 'المسار يحوّل إلى نفسه — هذه حلقة لا تنتهي في المتصفح', code: 'SELF_REDIRECT' },
        { status: 400 }
      );
    }

    const claim = await mayClaimFrom(parsed.data.from, store);
    if (!claim.ok) return NextResponse.json({ error: claim.error, code: 'NOT_YOURS' }, { status: 403 });

    const clash = await db.storeRedirect.findFirst({
      where: { storeId: store.id, from: parsed.data.from },
      select: { id: true },
    });
    if (clash) return NextResponse.json({ error: 'هذا المسار القديم له تحويل بالفعل' }, { status: 409 });

    const redirect = await db.storeRedirect.create({
      data: { ...parsed.data, companyId, storeId: store.id, suggested: false },
      select,
    });
    forgetRedirects();

    await logAudit({
      companyId, userId: user.id, action: 'STORE_REDIRECT_CREATED',
      entity: 'StoreRedirect', entityId: redirect.id, newData: redirect,
    });
    return NextResponse.json({ redirect }, { status: 201 });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
