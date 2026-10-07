import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { validateSlug, conversionRate } from '@/lib/landing-pages';
import { standDownRedirectsTo } from '@/lib/store-redirects';
import { buildTemplate } from '@/lib/page-templates';
import { LANDING_STRUCTURES } from '@/lib/landing-structures';
import { DIALECTS, structureToSections } from '@/lib/landing-structure';
import { newSection } from '@/lib/landing-sections';
import { STORE_TEMPLATES } from '@/lib/store-templates';
import { skinToLandingTheme } from '@/lib/store-skin';
import { zodMessage } from '@/lib/zod-message';
import { readLimit, readPage } from '@/lib/numeric-input';

export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.view');

    const { searchParams } = new URL(req.url);
    /*
     * `0aea050` NAMED THIS DOOR AS ONE THAT «ALREADY GOT IT RIGHT». IT HALF DID.
     *
     * The page number was clamped and the `NaN` was caught, but the page SIZE
     * had no lower bound, and the two combine. Measured against this database:
     *
     *   · `?limit=0`         → `take: 0`, which Prisma accepts: an empty list
     *     of landing pages where 44 exist, and `totalPages: Math.ceil(44/0)`
     *     = **Infinity** published beside it — the very figure `0aea050`
     *     removed from five other paths;
     *   · `?limit=-5`        → `take: -5`, which Prisma ALSO accepts and
     *     reads as «the last five», so page one showed the five oldest pages
     *     in reverse order;
     *   · `?page=2&limit=-5` → `skip: -5`, and that one Prisma refuses:
     *     «Invalid value for skip argument: Value can only be positive,
     *     found: -5» → `PrismaClientUnknownRequestError` → **HTTP 500
     *     «حدث خطأ داخلي»**, the same crash a bad page number used to cause.
     *
     * So this is not the third semantic `products/route.ts` has — it is the
     * same semantic, read incompletely. It shares the reader now.
     */
    const page = readPage(searchParams);
    const limit = readLimit(searchParams, 50, 100);

    const [total, pages] = await Promise.all([
      db.landingPage.count({ where: { companyId, storeId } }),
      db.landingPage.findMany({
        where: { companyId, storeId },
        include: {
          product: { select: { id: true, name: true, basePrice: true, image: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      landingPages: pages.map((p) => ({
        ...p,
        conversionRate: conversionRate(p.viewsCount, p.ordersCount),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.create');

    const schema = z.object({
      name: z.string().trim().min(2).max(100),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .max(60)
        .regex(/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/, 'الرابط (slug) غير صالح: أحرف إنجليزية صغيرة وأرقام وشرطات فقط'),
      productId: z.string().min(10).max(64).optional().nullable(),
      htmlContent: z.string().max(2 * 1024 * 1024).optional().nullable(),
      /**
       * Which shape of page to start from.
       *
       * Asked at CREATION, which is the only moment it is free. Choosing a
       * template afterwards replaces the page, so it has to warn about
       * losing work — here there is no work yet to lose.
       */
      template: z.string().trim().max(40).optional(),
      /**
       * THE OTHER WAY TO START A PAGE: بنية × مظهر.
       *
       * `template` is one of the fifteen page shapes, and each carries its
       * own colours — a structure and a skin welded together. A persuasion
       * STRUCTURE carries no colour at all, so it is paired with a skin
       * here and the two are chosen separately: any structure with any
       * skin.
       *
       * Both are optional and the route keeps working exactly as it did
       * for every caller that sends neither.
       */
      structure: z.string().trim().max(40).optional(),
      skin: z.string().trim().max(40).optional(),
      /**
       * THE WORDS THE SELLER WROTE WHILE CHOOSING THE STRUCTURE.
       *
       * «تعبئة خانات النص» is the fourth step of creating a page, and
       * until this existed it was a step whose output was thrown away:
       * the route built the sections with an EMPTY copy map, so a seller
       * who filled six fields in the dialog opened the editor onto six
       * empty blocks and had to write them again.
       *
       * Keyed by slot and then by dialect, which is the shape the slot
       * contract already uses — one page can hold the same headline in
       * Levantine and in Egyptian, and `copyIn` picks per visitor.
       *
       * UNKNOWN SLOT KEYS ARE IGNORED rather than refused: a stale dialog
       * sending a key the structure no longer has should still create the
       * page with the keys that do exist. The cap is 600, the largest
       * `max` any slot is allowed to declare.
       */
      copy: z
        .record(z.string().trim().max(40), z.partialRecord(z.enum(DIALECTS), z.string().max(600)))
        .optional(),
      /** Which dialect the copy above was written in. */
      dialect: z.enum(DIALECTS).optional(),
    });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const { name, slug, productId, htmlContent, template, structure, skin, copy, dialect } = parsed.data;

    const slugCheck = validateSlug(slug);
    if (!slugCheck.valid) return NextResponse.json({ error: slugCheck.error }, { status: 400 });
    // The public address /lp/<slug> is ONE space for every company: the
    // order a page takes is looked up by its slug, so a second company's
    // page with the same slug could receive the first one's customers.
    if (await db.landingPage.findFirst({ where: { slug }, select: { id: true } })) {
      return NextResponse.json({ error: 'هذا الرابط (slug) مستخدم بالفعل — اختر رابطاً آخر' }, { status: 409 });
    }

    if (productId) {
      // THIS store's product: a page sells what its own store stocks.
      const product = await db.product.findFirst({ where: { id: productId, companyId, storeId } });
      if (!product) return NextResponse.json({ error: 'المنتج ليس من منتجات هذا المتجر' }, { status: 404 });
    }

    /**
     * THE PAGE'S STARTING POINT — from a structure and a skin, or from one
     * of the fifteen page shapes.
     *
     * A STRUCTURE IS REFUSED WHEN IT IS NOT KNOWN; a page shape is not.
     * That asymmetry is deliberate: `template` has had an unknown-key
     * fallback since it was written, and a caller sending a stale key gets
     * a usable page rather than an error — the page is what the seller
     * asked for and the shape is a starting point. A STRUCTURE is the
     * story: silently giving somebody «المشكلة ← الحل» when they asked for
     * «العرض أولاً» hands them a page whose first screen contradicts the
     * ad that will point at it.
     */
    let built: { sections: unknown; theme: unknown };
    if (structure) {
      const chosen = LANDING_STRUCTURES.find((x) => x.id === structure);
      if (!chosen) return NextResponse.json({ error: 'بنية غير معروفة' }, { status: 404 });
      const wearing = skin ? STORE_TEMPLATES.find((x) => x.id === skin) : undefined;
      if (skin && !wearing) return NextResponse.json({ error: 'قالب غير معروف' }, { status: 404 });
      built = {
        // The seller's own words, in the dialect they wrote them in. An
        // unwritten slot keeps the library's seed, so a page created
        // without filling the dialog is the story's outline — which is
        // what a structure is before anybody writes it.
        sections: structureToSections(chosen, copy ?? {}, dialect ?? 'msa', newSection),
        // The look, from the skin — or the library's default when none was
        // named, because a structure has no colours to fall back to.
        theme: wearing ? skinToLandingTheme(wearing) : buildTemplate('blank').theme,
      };
    } else {
      // COPY WITHOUT A STRUCTURE IS REFUSED, NOT DROPPED. The fifteen page
      // shapes have no text slots, so there is nowhere for these words to
      // land — and accepting them silently would create a page the seller
      // believes they wrote and then finds empty. The one thing worse than
      // an error here is no error.
      if (copy && Object.keys(copy).length > 0) {
        return NextResponse.json(
          { error: 'خانات النصّ تُرسَل مع بنية إقناع — الأشكال الجاهزة لا تحمل خانات' },
          { status: 400 }
        );
      }
      // An unknown key falls back to something usable rather than failing:
      // the page is what the seller asked for, the template is a starting
      // point, and refusing to create the page over it would be the wrong
      // thing to be strict about.
      built = buildTemplate(template || 'classic');
    }

    try {
      const lp = await db.landingPage.create({
        data: {
          companyId,
          storeId,
          name: name.trim(),
          slug,
          productId: productId || null,
          htmlContent: htmlContent?.slice(0, 2 * 1024 * 1024) || null,
          // A new page starts in the block builder with a real page already
          // in it — an empty canvas is not a starting point, it is a second
          // task. A page created FROM uploaded HTML stays an HTML page.
          builderMode: htmlContent ? 'HTML' : 'BLOCKS',
          // The template's own colour and typeface as well as its blocks —
          // a template that only set the order would be the same page
          // fifteen times.
          theme: htmlContent ? null : JSON.stringify(built.theme),
          sections: htmlContent ? null : JSON.stringify(built.sections),
          createdById: user.id,
        },
      });
      // A LIVE PAGE ALWAYS BEATS A REDIRECT. A slug can be free today
      // because a redirect forwards away from it; the moment a page takes
      // that address, the redirect would shadow the page it now names and
      // the new page would be unreachable from its own link.
      await standDownRedirectsTo(lp.slug);
      return NextResponse.json({ success: true, landingPage: lp }, { status: 201 });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return NextResponse.json({ error: 'هذا الرابط (slug) مستخدم بالفعل — اختر رابطاً آخر' }, { status: 409 });
      }
      throw e;
    }
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}