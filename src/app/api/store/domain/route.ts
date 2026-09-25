import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { dashboardHosts, forgetHost, validateDomain } from '@/lib/landing-domain';
import { checkDomain, requiredRecords, routingTarget, type DomainCheck } from '@/lib/domain-verify';
import { z } from 'zod';

/**
 * GET   /api/store/domain  — the domain, the records to set, the last check
 * PUT   /api/store/domain  — bind or clear it
 * POST  /api/store/domain  — check it NOW (a real DNS and TLS lookup)
 *
 * Binding keeps the rules the settings screen already enforced: a hostname
 * unique across stores AND landing pages, never one of the dashboard's own.
 * What is new is that binding no longer implies working — the check does,
 * and only a real lookup writes `domainVerifiedAt`.
 */

const bindSchema = z.object({ domain: z.string().trim().max(253) });

const select = {
  id: true, slug: true, domain: true, domainVerifiedAt: true, domainCheck: true, storefrontEnabled: true,
} as const;

function parseCheck(raw: string | null): DomainCheck | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as DomainCheck) : null;
  } catch {
    return null;
  }
}

/** Everything the screen needs, including why it cannot help yet. */
function payload(store: { slug: string; domain: string | null; domainVerifiedAt: Date | null; domainCheck: string | null; storefrontEnabled: boolean }) {
  return {
    domain: store.domain,
    verifiedAt: store.domainVerifiedAt,
    lastCheck: parseCheck(store.domainCheck),
    records: store.domain ? requiredRecords(store.domain) : [],
    // Null means this deployment has not been told where it lives, so the
    // screen says that rather than showing a value that would take the
    // seller's shop off the air.
    target: routingTarget(),
    storefrontEnabled: store.storefrontEnabled,
    publicPath: `/s/${store.slug}`,
  };
}

async function currentStore(storeId: string, companyId: string) {
  return db.store.findFirst({ where: { id: storeId, companyId }, select });
}

export async function GET() {
  try {
    const { storeId, companyId } = await requireContext();
    await requirePermission('storefront.view');
    const store = await currentStore(storeId!, companyId);
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });
    return NextResponse.json(payload(store));
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.domain');

    const parsed = bindSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'نطاق غير صالح' }, { status: 400 });

    const before = await currentStore(storeId!, companyId);
    if (!before) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    const raw = parsed.data.domain.trim();
    if (!raw) {
      await db.store.update({
        where: { id: before.id },
        // Clearing the domain clears what was known about it: a verification
        // that belonged to a hostname this store no longer claims must not
        // be shown against the next one.
        data: { domain: null, domainVerifiedAt: null, domainCheck: null },
      });
      forgetHost(before.domain);
      await logAudit({
        companyId, userId: user.id, action: 'STORE_DOMAIN_CLEARED',
        entity: 'Store', entityId: before.id, previousData: { domain: before.domain },
      });
      const after = await currentStore(before.id, companyId);
      return NextResponse.json(payload(after!));
    }

    const check = validateDomain(raw, dashboardHosts(req));
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    // One host, one owner. The proxy resolves a hostname by asking both
    // tables, so two claims would make its answer depend on read order.
    const [otherStore, page] = await Promise.all([
      db.store.findFirst({ where: { domain: check.domain, id: { not: before.id } }, select: { id: true } }),
      db.landingPage.findFirst({ where: { domain: check.domain }, select: { id: true } }),
    ]);
    if (otherStore) return NextResponse.json({ error: 'هذا النطاق مرتبط بمتجر آخر' }, { status: 409 });
    if (page) return NextResponse.json({ error: 'هذا النطاق مرتبط بصفحة هبوط' }, { status: 409 });

    await db.store.update({
      where: { id: before.id },
      // A new hostname is unverified until it is checked, whatever the old
      // one had earned.
      data: { domain: check.domain, domainVerifiedAt: null, domainCheck: null },
    });
    forgetHost(before.domain);
    forgetHost(check.domain);

    await logAudit({
      companyId, userId: user.id, action: 'STORE_DOMAIN_BOUND',
      entity: 'Store', entityId: before.id,
      previousData: { domain: before.domain }, newData: { domain: check.domain },
    });
    const after = await currentStore(before.id, companyId);
    return NextResponse.json(payload(after!));
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST() {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.domain');

    const store = await currentStore(storeId!, companyId);
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });
    if (!store.domain) return NextResponse.json({ error: 'لا نطاق مرتبط بهذا المتجر' }, { status: 400 });

    // The real lookup. This is the ONLY thing that writes domainVerifiedAt.
    const result = await checkDomain(store.domain);

    await db.store.update({
      where: { id: store.id },
      data: {
        domainCheck: JSON.stringify(result),
        // Verified stamps the moment it passed; a later failure clears it,
        // because a domain that stopped resolving is not verified any more.
        domainVerifiedAt: result.status === 'VERIFIED' ? new Date() : null,
      },
    });
    forgetHost(store.domain);

    await logAudit({
      companyId, userId: user.id, action: 'STORE_DOMAIN_CHECKED',
      entity: 'Store', entityId: store.id,
      newData: { domain: store.domain, status: result.status, ownership: result.ownership, routing: result.routing, ssl: result.ssl },
    });

    const after = await currentStore(store.id, companyId);
    return NextResponse.json(payload(after!));
  } catch (e) {
    return apiErrorResponse(e);
  }
}
