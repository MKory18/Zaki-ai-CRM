import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { PAGE_TEMPLATES, buildTemplate } from '@/lib/page-templates';
import { parseSections } from '@/lib/landing-sections';
import { cartBarApplies, parseStoreTheme } from '@/lib/store-theme';
import { exportTemplate, importTemplate, templateDisposition } from '@/lib/store-template-file';
import { z } from 'zod';

/**
 * GET  /api/store/templates            — the gallery, and this shop's own look
 * GET  /api/store/templates?export=1   — that look as a file
 * POST /api/store/templates            — install one, from the gallery or a file
 *
 * INSTALLING WRITES THE DRAFT, NEVER WHAT IS LIVE. A template is a starting
 * point, and a seller must be able to try one, look at it, and walk away.
 * Publishing stays the one act a customer feels.
 */

const applySchema = z.union([
  z.object({ source: z.literal('builtin'), key: z.string().trim().min(1).max(40) }),
  z.object({ source: z.literal('file'), file: z.unknown() }),
]);

const select = {
  id: true, name: true, type: true, theme: true, homeDraft: true,
} as const;

export async function GET(req: Request) {
  try {
    const { storeId, companyId } = await requireContext();
    await requirePermission('storefront.view');

    const store = await db.store.findFirst({ where: { id: storeId!, companyId }, select });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    if (new URL(req.url).searchParams.get('export') === '1') {
      const file = exportTemplate({
        name: store.name,
        theme: parseStoreTheme(store.theme),
        sections: parseSections(store.homeDraft),
      });
      return new NextResponse(JSON.stringify(file, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': templateDisposition(store.name),
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({
      // The gallery's cards: enough to choose by, and no page built until
      // one is asked for.
      templates: PAGE_TEMPLATES.map((t) => ({ key: t.key, label: t.label, hint: t.hint, swatch: t.swatch })),
      singleProduct: !cartBarApplies(store.type),
      storeName: store.name,
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const store = await db.store.findFirst({ where: { id: storeId!, companyId }, select });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });
    if (!cartBarApplies(store.type)) {
      return NextResponse.json(
        { error: 'متجر Single Product واجهته صفحة الهبوط المرتبطة به — القوالب تُثبَّت من هناك', code: 'SINGLE_PRODUCT' },
        { status: 409 }
      );
    }

    const parsed = applySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'طلب غير مفهوم' }, { status: 400 });

    let theme;
    let sections;
    let label: string;

    const request = parsed.data;
    if (request.source === 'builtin') {
      const known = PAGE_TEMPLATES.find((t) => t.key === request.key);
      // buildTemplate falls back to the last template for an unknown key,
      // which would install something the seller did not pick.
      if (!known) return NextResponse.json({ error: 'قالب غير معروف' }, { status: 404 });
      const built = buildTemplate(known.key);
      // The store theme keeps everything the landing theme has no opinion
      // about — the header, the checkout, the footer's copyright — so a
      // template changes the look without emptying the shop's settings.
      theme = { ...parseStoreTheme(store.theme), ...built.theme };
      sections = built.sections;
      label = known.label;
    } else {
      const imported = importTemplate(request.file);
      if (!imported.ok) return NextResponse.json({ error: imported.error, code: 'BAD_TEMPLATE' }, { status: 400 });
      theme = imported.theme;
      sections = imported.sections;
      label = imported.name || 'قالب مستورد';
    }

    await db.store.update({
      where: { id: store.id },
      // Draft only. A template is a starting point, and the seller looks at
      // it before any customer does.
      data: { theme: JSON.stringify(theme), homeDraft: JSON.stringify(sections) },
    });

    await logAudit({
      companyId, userId: user.id, action: 'STORE_TEMPLATE_INSTALLED',
      entity: 'Store', entityId: store.id,
      newData: { source: request.source, template: label, sections: sections.length },
    });

    return NextResponse.json({ theme, sections, installed: label });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
