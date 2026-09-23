import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/landing-pages/[id]/duplicate — a second page from a first.
 *
 * A seller builds one page that converts and then wants it again for the
 * next product, or a variant to test against. Rebuilding it by hand is how
 * a working page gets copied wrong.
 *
 * WHAT IS COPIED is everything that makes the page look and behave as it
 * does: the sections, the HTML, the CSS, the theme, the page settings, the
 * product it sells and its recommendation list.
 *
 * WHAT IS NOT is everything that belongs to the original ALONE:
 *
 *   slug, domain      A hostname belongs to whoever proved it, and two
 *                     pages answering one address makes the proxy's answer
 *                     depend on which row it read first.
 *   isPublished       A copy goes live when somebody decides it should,
 *                     not by inheriting a decision made about another page.
 *   views, orders,    These are the ORIGINAL's results. Carrying them over
 *   upsell counters   would credit the copy with sales it never made and
 *                     make both pages' numbers a lie.
 *   the Meta Pixel    A pixel is an account's measurement of one funnel.
 *                     Duplicating it silently merges two funnels into one
 *                     set of figures — the same reason the contract says a
 *                     cloned store never carries pixels.
 *
 * The orders stay with the original too: they are what actually happened,
 * on the page they happened on.
 */

/**
 * "عرض المنتج" → "(نسخة)" → "(نسخة 2)" → "(نسخة 3)" …
 *
 * The suffix is stripped from the source first. Copying a copy used to
 * produce «صفحة (نسخة) (نسخة)», and the one after that would have grown a
 * third — a name nobody can read at a glance, which is the whole job of a
 * name in a list.
 */
export function copyName(original: string, taken: Set<string>): string {
  const base = original.replace(/\s*\(نسخة(\s+\d+)?\)\s*$/u, '').trim() || original;
  const candidate = (n: number) => (n === 1 ? `${base} (نسخة)` : `${base} (نسخة ${n})`);
  for (let n = 1; n < 100; n++) {
    const tryName = candidate(n);
    if (!taken.has(tryName)) return tryName.slice(0, 120);
  }
  return `${base} (${Date.now()})`.slice(0, 120);
}

/** A slug nobody else holds. The copy needs its own address. */
async function freeSlug(companyId: string, from: string): Promise<string> {
  const base = from.replace(/-copy(-\d+)?$/, '').slice(0, 50);
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? `${base}-copy` : `${base}-copy-${n}`;
    // Slugs are checked across every company: the public URL is one space.
    const taken = await db.landingPage.findFirst({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 60);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();
    // Duplicating IS creating a page — same permission, not a weaker one.
    await requirePermission('landing_pages.create');

    const source = await db.landingPage.findFirst({
      where: { id, companyId, ...(storeId ? { storeId } : {}) },
      include: {
        recommendations: { select: { productId: true, sortOrder: true, isActive: true } },
      },
    });
    if (!source) return NextResponse.json({ error: 'الصفحة غير موجودة' }, { status: 404 });

    const names = new Set(
      (await db.landingPage.findMany({ where: { companyId }, select: { name: true } })).map((p) => p.name)
    );

    // One transaction: a page whose recommendations half-copied is a page
    // that looks finished and sells the wrong add-ons.
    const copy = await db.$transaction(async (tx) => {
      const created = await tx.landingPage.create({
        data: {
          companyId,
          storeId: source.storeId,
          name: copyName(source.name, names),
          slug: await freeSlug(companyId, source.slug),
          // ── the page itself ──
          htmlContent: source.htmlContent,
          cssContent: source.cssContent,
          pageSettings: source.pageSettings,
          builderMode: source.builderMode,
          theme: source.theme,
          sections: source.sections,
          productId: source.productId,
          // ── deliberately NOT inherited ──
          domain: null,
          domainVerifiedAt: null,
          isPublished: false,
          metaPixelId: null,
          metaPixelEnabled: false,
          createdById: user.id,
        },
      });

      if (source.recommendations.length > 0) {
        await tx.landingPageRecommendation.createMany({
          data: source.recommendations.map((r) => ({
            landingPageId: created.id,
            productId: r.productId,
            sortOrder: r.sortOrder,
            isActive: r.isActive,
          })),
        });
      }

      return created;
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'LANDING_PAGE_DUPLICATED',
      entity: 'LandingPage',
      entityId: copy.id,
      newData: { from: source.name, to: copy.name, slug: copy.slug, recommendations: source.recommendations.length },
    });

    return NextResponse.json(
      {
        page: { id: copy.id, name: copy.name, slug: copy.slug, isPublished: copy.isPublished },
        message: `نُسخت باسم «${copy.name}» — غير منشورة، وبلا نطاق ولا بكسل ولا أرقام الأصل.`,
      },
      { status: 201 }
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
