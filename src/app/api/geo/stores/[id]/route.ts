import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { firstIssue, storeUpdateSchema } from '@/lib/geo-schemas';
import { validateDomain, forgetHost, dashboardHosts } from '@/lib/landing-domain';
import { refusalToOpen } from '@/lib/storefront-rules';

/** PATCH /api/geo/stores/:id (geo.manage). countryId is immutable; no DELETE. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');

    const parsed = storeUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

    const before = await db.store.findFirst({ where: { id, companyId } });
    if (!before) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    if (parsed.data.slug && parsed.data.slug !== before.slug) {
      // One public space for every company — see the create route.
      const clash = await db.store.findFirst({ where: { slug: parsed.data.slug, id: { not: id } }, select: { id: true } });
      if (clash) return NextResponse.json({ error: 'هذا المعرّف مستخدم لمتجر آخر' }, { status: 409 });
    }

    // ── The custom domain is NOT written here ──
    //
    // It has one editor: PATCH /api/store/domain, which clears
    // `domainVerifiedAt` whenever the address changes and sets it again
    // only after a real DNS lookup. Writing it here moved the address and
    // left the old verification standing — the dashboard showed a tick for
    // a host nobody had checked, and the customer met an error page.
    //
    // The schema drops it and `.strict()` refuses a body that carries one,
    // so a form still sending it fails loudly instead of half-working.
    const data: Record<string, unknown> = { ...parsed.data };

    // The theme is NOT written here. It has one editor
    // (PATCH /api/store/theme), and `.strict()` on the schema means a body
    // that carries one is refused rather than quietly ignored.

    // ── The storefront, as it would be after this save ──
    // A store with many products has no front page: turning a Single Product
    // store into one lets go of its page.
    const type = parsed.data.type ?? before.type;
    if (type !== 'SINGLE_PRODUCT' && before.landingPageId) data.landingPageId = null;
    const after = {
      id: before.id,
      companyId,
      slug: parsed.data.slug ?? before.slug,
      type,
      status: parsed.data.status ?? before.status,
      landingPageId: type === 'SINGLE_PRODUCT' ? before.landingPageId : null,
    };
    const live = parsed.data.storefrontEnabled ?? before.storefrontEnabled;
    // The same rule as the Single Product screen — checked whenever this save
    // is what makes an open storefront (opened, re-typed, or un-paused).
    // Closing or pausing is always allowed.
    const opens =
      live && after.status === 'ACTIVE' &&
      (!before.storefrontEnabled || type !== before.type || before.status !== 'ACTIVE');
    if (opens) {
      const refusal = await refusalToOpen(after);
      if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });
    }

    const store = await db.store.update({ where: { id }, data });
    await logAudit({
      companyId,
      userId: user.id,
      action: 'STORE_UPDATED',
      entity: 'Store',
      entityId: id,
      previousData: before,
      newData: store,
    });
    return NextResponse.json({ store });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
