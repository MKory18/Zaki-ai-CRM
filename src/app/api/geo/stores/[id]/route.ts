import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { firstIssue, storeUpdateSchema } from '@/lib/geo-schemas';
import { validateDomain, forgetHost } from '@/lib/landing-domain';
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
      const clash = await db.store.findFirst({ where: { companyId, slug: parsed.data.slug }, select: { id: true } });
      if (clash) return NextResponse.json({ error: 'هذا المعرّف مستخدم لمتجر آخر' }, { status: 409 });
    }

    // ── The custom domain ──
    // Unique across stores AND against landing pages: the proxy resolves a
    // host by asking both, and two claims on one host would make its answer
    // depend on which table it read first.
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.domain !== undefined) {
      const raw = parsed.data.domain?.trim() ?? '';
      if (!raw) {
        data.domain = null;
      } else {
        const check = validateDomain(raw, req.headers.get('host'));
        if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
        const [otherStore, page] = await Promise.all([
          db.store.findFirst({ where: { domain: check.domain, id: { not: id } }, select: { id: true } }),
          db.landingPage.findFirst({ where: { domain: check.domain }, select: { id: true } }),
        ]);
        if (otherStore || page) {
          return NextResponse.json({ error: 'هذا النطاق مستخدم بالفعل' }, { status: 409 });
        }
        data.domain = check.domain;
      }
      forgetHost(before.domain);
      forgetHost(typeof data.domain === 'string' ? data.domain : null);
    }

    // The theme is stored as JSON, like a landing page's.
    if (parsed.data.theme !== undefined) {
      data.theme = parsed.data.theme ? JSON.stringify(parsed.data.theme) : null;
    }

    // ── The storefront, as it would be after this save ──
    // A store with many products has no front page: turning a Single Product
    // store into one lets go of its page.
    const type = parsed.data.type ?? before.type;
    if (type !== 'SINGLE_PRODUCT' && before.landingPageId) data.landingPageId = null;
    const after = {
      id: before.id,
      companyId,
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
