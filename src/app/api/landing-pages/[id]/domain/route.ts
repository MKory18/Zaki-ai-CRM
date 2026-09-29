import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { forgetHost } from '@/lib/landing-domain';
import { checkDomain, requiredRecords, routingTarget } from '@/lib/domain-verify';
import { publicPath } from '@/lib/public-address';

/**
 * A LANDING PAGE'S OWN DOMAIN — THE HALF THAT WAS MISSING.
 *
 * The page could already take a custom domain: the editor accepted one, it
 * was validated, checked for a clash against every store and every other
 * page, and the proxy served it. What did not exist was ANY WAY TO KNOW
 * WHETHER IT WORKED.
 *
 *   - `LandingPage.domainVerifiedAt` was written to `null` in three places
 *     and to a date in none. Nothing could ever set it.
 *   - The screen told the seller to «point an A or CNAME record at this
 *     server» and never said WHICH VALUE — a step nobody can carry out.
 *   - And it printed `https://<domain>` in success green the moment the field
 *     was saved, which is the screen telling them the page is reachable while
 *     every customer gets an error.
 *
 * So this is the store's domain machinery, reused rather than rebuilt:
 * `requiredRecords` for what to create, `checkDomain` for a REAL DNS and TLS
 * lookup. Binding stays where it was (PATCH /api/landing-pages/:id, with all
 * its clash rules); this endpoint only says what the records are and whether
 * they are there.
 *
 * WHAT THIS DOES NOT DO, AND WHY. The store keeps its last check in
 * `Store.domainCheck`; `LandingPage` has no such column, so a page's check is
 * returned live to whoever asked for it and not stored. Across a reload the
 * screen shows the one durable fact — verified, and when — and offers the
 * button again. That is the honest shape of it without a migration.
 */

const select = {
  id: true, slug: true, domain: true, domainVerifiedAt: true, isPublished: true,
} as const;

type Page = { id: string; slug: string; domain: string | null; domainVerifiedAt: Date | null; isPublished: boolean };

function payload(page: Page) {
  return {
    domain: page.domain,
    verifiedAt: page.domainVerifiedAt,
    isPublished: page.isPublished,
    records: page.domain ? requiredRecords(page.domain) : [],
    // Null means this deployment has not been told where it lives, so the
    // screen says exactly that instead of inventing a value that would send
    // the seller's traffic nowhere.
    target: routingTarget(),
    publicPath: publicPath({ kind: 'lp', slug: page.slug }),
  };
}

/** This company's page, in the store the dashboard is standing in. */
async function currentPage(id: string, companyId: string, storeId: string) {
  return db.landingPage.findFirst({ where: { id, companyId, storeId }, select });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.view');
    const { id } = await ctx.params;
    const page = await currentPage(id, companyId, storeId);
    if (!page) return NextResponse.json({ error: 'صفحة الهبوط غير موجودة' }, { status: 404 });
    return NextResponse.json(payload(page));
  } catch (e) {
    return apiErrorResponse(e);
  }
}

/** Check it NOW. The only thing in the system that can verify a page's domain. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId, storeId } = await requireContext();
    // Same permission that binds the domain: whoever may move the address
    // may ask whether it arrived.
    await requirePermission('landing_pages.edit');
    const { id } = await ctx.params;

    const page = await currentPage(id, companyId, storeId);
    if (!page) return NextResponse.json({ error: 'صفحة الهبوط غير موجودة' }, { status: 404 });
    if (!page.domain) return NextResponse.json({ error: 'لا نطاق مرتبط بهذه الصفحة' }, { status: 400 });

    const result = await checkDomain(page.domain);

    await db.landingPage.update({
      where: { id: page.id },
      // Verified stamps the moment it passed; anything less clears it,
      // because a domain that stopped resolving is not verified any more.
      data: { domainVerifiedAt: result.status === 'VERIFIED' ? new Date() : null },
    });
    // The proxy remembers host → page for a minute, and the person pressing
    // this button is watching.
    forgetHost(page.domain);

    await logAudit({
      companyId, userId: user.id, action: 'LANDING_PAGE_DOMAIN_CHECKED',
      entity: 'LandingPage', entityId: page.id,
      newData: { domain: page.domain, status: result.status, ownership: result.ownership, routing: result.routing, ssl: result.ssl },
    });

    const after = await currentPage(page.id, companyId, storeId);
    return NextResponse.json({ ...payload(after!), lastCheck: result });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
