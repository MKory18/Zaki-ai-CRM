import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { parseSections, landingSectionsSchema } from '@/lib/landing-sections';
import { parseStoreTheme } from '@/lib/store-theme';
import { cartBarApplies } from '@/lib/store-theme';
import { z } from 'zod';

/**
 * THE SHOP'S HOME PAGE.
 *
 * Built from the SAME blocks a landing page is built from, saved in the same
 * shape, and drawn by the same renderer. There is one page builder in this
 * system; a second would be two block libraries to keep in step, and they
 * would drift.
 *
 * SAVE, PREVIEW, PUBLISH ARE THREE ACTS. Saving writes the draft. Previewing
 * reads the draft. Publishing copies the draft to live, and live is the only
 * thing a shopper ever sees. One column would have made every save a publish,
 * which is how a half-finished page reaches a customer.
 *
 * A SINGLE PRODUCT STORE HAS NO HOME PAGE TO BUILD. Its front IS a landing
 * page — the one the seller picked — with every block, pixel and offer that
 * page has. Building a second one here would be the duplication the contract
 * forbids, so this answers with where that page is instead.
 */

const saveSchema = z.object({ sections: landingSectionsSchema });

const select = {
  id: true, slug: true, name: true, type: true, theme: true, logo: true, supportPhone: true,
  homeDraft: true, homeLive: true, homePublishedAt: true, landingPageId: true, storefrontEnabled: true,
  country: { select: { currencyCode: true } },
} as const;

async function load(storeId: string, companyId: string) {
  return db.store.findFirst({ where: { id: storeId, companyId }, select });
}

type StoreRow = NonNullable<Awaited<ReturnType<typeof load>>>;

function payload(store: StoreRow) {
  const draft = parseSections(store.homeDraft);
  const live = parseSections(store.homeLive);
  return {
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      type: store.type,
      logo: store.logo,
      supportPhone: store.supportPhone,
      storefrontEnabled: store.storefrontEnabled,
      // A Single Product store is sent to its own page rather than offered a
      // second builder for a home page it does not have.
      singleProduct: !cartBarApplies(store.type),
      landingPageId: store.landingPageId,
      currency: store.country?.currencyCode ?? '',
    },
    theme: parseStoreTheme(store.theme),
    draft,
    live,
    publishedAt: store.homePublishedAt,
    // What "publish" would change, so the confirmation can say it.
    hasUnpublished: JSON.stringify(draft) !== JSON.stringify(live),
  };
}

export async function GET() {
  try {
    const { storeId, companyId } = await requireContext();
    await requirePermission('storefront.view');
    const store = await load(storeId!, companyId);
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });
    return NextResponse.json(payload(store));
  } catch (e) {
    return apiErrorResponse(e);
  }
}

/** Save the draft. Never touches what a shopper sees. */
export async function PUT(req: Request) {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const store = await load(storeId!, companyId);
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });
    if (!cartBarApplies(store.type)) {
      return NextResponse.json(
        { error: 'متجر Single Product واجهته صفحة الهبوط المرتبطة به — تُصمَّم من صفحات الهبوط', code: 'SINGLE_PRODUCT' },
        { status: 409 }
      );
    }

    const parsed = saveSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'تعذّر قراءة الأقسام' }, { status: 400 });

    await db.store.update({
      where: { id: store.id },
      data: { homeDraft: JSON.stringify(parsed.data.sections) },
    });

    await logAudit({
      companyId, userId: user.id, action: 'STORE_HOME_SAVED',
      entity: 'Store', entityId: store.id,
      newData: { sections: parsed.data.sections.length },
    });

    const after = await load(store.id, companyId);
    return NextResponse.json(payload(after!));
  } catch (e) {
    return apiErrorResponse(e);
  }
}

/**
 * Publish: the draft becomes what the shop shows.
 *
 * Its own permission, because releasing to customers is a different
 * authority from designing — a shop can have someone who prepares and
 * someone who decides it goes out.
 */
export async function POST() {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.publish');

    const store = await load(storeId!, companyId);
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });
    if (!cartBarApplies(store.type)) {
      return NextResponse.json(
        { error: 'متجر Single Product واجهته صفحة الهبوط المرتبطة به', code: 'SINGLE_PRODUCT' },
        { status: 409 }
      );
    }

    await db.store.update({
      where: { id: store.id },
      // The draft as it stands, copied across. Publishing an empty draft is
      // allowed and means "go back to the product list" — a seller must be
      // able to undo a home page they no longer want.
      data: { homeLive: store.homeDraft, homePublishedAt: new Date() },
    });

    await logAudit({
      companyId, userId: user.id, action: 'STORE_HOME_PUBLISHED',
      entity: 'Store', entityId: store.id,
      previousData: { live: store.homeLive },
      newData: { live: store.homeDraft },
    });

    const after = await load(store.id, companyId);
    return NextResponse.json(payload(after!));
  } catch (e) {
    return apiErrorResponse(e);
  }
}
