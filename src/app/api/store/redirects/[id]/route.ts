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
  redirectUpdateSchema,
} from '@/lib/store-redirects';

/**
 * PATCH  /api/store/redirects/:id  — edit, turn on or off, or ACCEPT a
 *                                    suggestion (suggested → false)
 * DELETE /api/store/redirects/:id  — dismiss it entirely
 *
 * Accepting is what makes a suggestion forward traffic: until then the
 * proxy ignores it, so a rename never silently changes where a live address
 * goes.
 */

const select = {
  id: true, from: true, to: true, kind: true, hits: true,
  isActive: true, suggested: true, createdAt: true,
} as const;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const before = await db.storeRedirect.findFirst({ where: { id, storeId: storeId!, companyId }, select });
    if (!before) return NextResponse.json({ error: 'التحويل غير موجود' }, { status: 404 });

    const body = await req.json().catch(() => null);
    // `accept` is the one field that is not part of the redirect itself: it
    // is the seller saying yes to a suggestion.
    const accept = body && typeof body === 'object' && (body as { accept?: unknown }).accept === true;
    const rest = { ...(body as Record<string, unknown>) };
    delete rest.accept;

    const parsed = redirectUpdateSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error), errorAr: zodMessage(parsed.error) }, { status: 400 });
    }

    const from = parsed.data.from ?? before.from;
    const to = parsed.data.to ?? before.to;
    if (isSelfRedirect(from, to)) {
      return NextResponse.json(
        { error: 'المسار يحوّل إلى نفسه — هذه حلقة لا تنتهي في المتصفح', code: 'SELF_REDIRECT' },
        { status: 400 }
      );
    }

    if (parsed.data.from && parsed.data.from !== before.from) {
      const store = await db.store.findFirst({
        where: { id: storeId!, companyId },
        select: { id: true, slug: true, companyId: true },
      });
      if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });
      const claim = await mayClaimFrom(parsed.data.from, store);
      if (!claim.ok) return NextResponse.json({ error: claim.error, code: 'NOT_YOURS' }, { status: 403 });

      const clash = await db.storeRedirect.findFirst({
        where: { storeId: store.id, from: parsed.data.from, id: { not: id } },
        select: { id: true },
      });
      if (clash) return NextResponse.json({ error: 'هذا المسار القديم له تحويل بالفعل' }, { status: 409 });
    }

    const redirect = await db.storeRedirect.update({
      where: { id },
      data: { ...parsed.data, ...(accept ? { suggested: false } : {}) },
      select,
    });
    forgetRedirects();

    await logAudit({
      companyId, userId: user.id,
      action: accept ? 'STORE_REDIRECT_ACCEPTED' : 'STORE_REDIRECT_UPDATED',
      entity: 'StoreRedirect', entityId: id, previousData: before, newData: redirect,
    });
    return NextResponse.json({ redirect });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const before = await db.storeRedirect.findFirst({ where: { id, storeId: storeId!, companyId }, select });
    if (!before) return NextResponse.json({ error: 'التحويل غير موجود' }, { status: 404 });

    await db.storeRedirect.delete({ where: { id } });
    forgetRedirects();

    await logAudit({
      companyId, userId: user.id,
      action: before.suggested ? 'STORE_REDIRECT_DISMISSED' : 'STORE_REDIRECT_DELETED',
      entity: 'StoreRedirect', entityId: id, previousData: before,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
