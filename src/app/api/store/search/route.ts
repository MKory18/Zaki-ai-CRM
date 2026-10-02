import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { MAX_SYNONYMS, parseSynonyms, synonymsSchema } from '@/lib/store-search';
import {
  MAX_FIELDS,
  categoryAttributesSchema,
  parseCategoryAttributes,
} from '@/lib/product-attributes';
import { z } from 'zod';

/**
 * GET / PUT  /api/store/search
 *
 * HOW A SHOPPER FINDS THINGS — the two halves of it, in one door.
 *
 * The shop's own words («طنين» ↔ «صفير الأذن») and the questions each
 * category is described by. They are one screen because they answer one
 * question — «how does somebody find the thing they came for» — and
 * splitting them would be two menu entries for one job.
 *
 * THE CATEGORIES ARE COMPANY-WIDE. `Category` hangs off the product and is
 * not store-scoped, which is deliberate and written down in
 * `storefrontCatalog`; a store shows the categories ITS products carry.
 * So the questions are saved against the category, and the permission
 * asked for is the storefront's because the filters are what they feed.
 */

const putSchema = z.object({
  synonyms: synonymsSchema.optional(),
  /** Category id → its questions. Only the ones sent are touched. */
  categories: z.record(z.string().min(1).max(64), categoryAttributesSchema).optional(),
});

export async function GET() {
  try {
    const { storeId, companyId } = await requireContext();
    await requirePermission('storefront.view');

    const store = await db.store.findFirst({
      where: { id: storeId!, companyId },
      select: { id: true, searchSynonyms: true },
    });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    /**
     * ONLY THE CATEGORIES THIS STORE'S PRODUCTS CARRY.
     *
     * The table is company-wide, so listing all of it would offer a seller
     * of one shop the categories of another's shelves to describe — which
     * is the same leak the storefront's own category chips avoid, by the
     * same derivation.
     */
    const rows = await db.product.findMany({
      where: { companyId, storeId: storeId!, categoryId: { not: null } },
      select: { category: { select: { id: true, name: true, attributeSchema: true } } },
      distinct: ['categoryId'],
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      synonyms: parseSynonyms(store.searchSynonyms),
      maxSynonyms: MAX_SYNONYMS,
      maxFields: MAX_FIELDS,
      categories: rows
        .flatMap((r) => (r.category ? [r.category] : []))
        .map((c) => ({ id: c.id, name: c.name, fields: parseCategoryAttributes(c.attributeSchema) })),
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const parsed = putSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' },
        { status: 400 }
      );
    }

    const store = await db.store.findFirst({
      where: { id: storeId!, companyId },
      select: { id: true, searchSynonyms: true },
    });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    const { synonyms, categories } = parsed.data;

    if (synonyms) {
      await db.store.update({
        where: { id: store.id },
        data: { searchSynonyms: JSON.stringify(synonyms) },
      });
      await logAudit({
        companyId,
        userId: user.id,
        action: 'STORE_SEARCH_SYNONYMS_CHANGED',
        entity: 'Store',
        entityId: store.id,
        previousData: { count: parseSynonyms(store.searchSynonyms).length },
        newData: { count: synonyms.length },
      });
    }

    for (const [categoryId, fields] of Object.entries(categories ?? {})) {
      /**
       * SCOPED THROUGH THE PRODUCTS, not by trusting the id.
       *
       * A category id is company-wide, so a seller with two shops could
       * otherwise describe a category none of this shop's products carry —
       * and the description would reach the other shop's filters.
       */
      const belongs = await db.product.findFirst({
        where: { companyId, storeId: storeId!, categoryId },
        select: { id: true },
      });
      if (!belongs) {
        return NextResponse.json(
          { error: 'هذه الفئة ليست بين فئات منتجات هذا المتجر' },
          { status: 404 }
        );
      }

      const before = await db.category.findFirst({
        where: { id: categoryId, companyId },
        select: { id: true, attributeSchema: true },
      });
      if (!before) return NextResponse.json({ error: 'الفئة غير موجودة' }, { status: 404 });

      await db.category.update({
        where: { id: before.id },
        data: { attributeSchema: JSON.stringify(fields) },
      });
      await logAudit({
        companyId,
        userId: user.id,
        action: 'CATEGORY_ATTRIBUTES_CHANGED',
        entity: 'Category',
        entityId: before.id,
        previousData: { fields: parseCategoryAttributes(before.attributeSchema).map((f) => f.key) },
        newData: { fields: fields.map((f) => f.key) },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
