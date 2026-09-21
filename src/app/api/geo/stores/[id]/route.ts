import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { firstIssue, storeUpdateSchema } from '@/lib/geo-schemas';
import { validateDomain, forgetHost } from '@/lib/landing-domain';

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
        const check = validateDomain(raw);
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
