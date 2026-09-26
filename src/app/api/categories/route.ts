import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { can } from '@/lib/authorization';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';

const nameSchema = z.object({
  name: z.string().trim().min(2, 'اسم التصنيف قصير جداً').max(60, 'اسم التصنيف طويل جداً'),
  nameEn: z.string().trim().max(60).optional().nullable(),
});

/**
 * CATEGORIES — and why there were none.
 *
 * This file read them and nothing wrote them: the comment here said «Phase
 * 6 adds full CRUD» and Phase 6 never came. Measured on the dev database:
 * 114 products, 0 categories, 0 products categorised.
 *
 * That is not a cosmetic gap. `products.list` narrows by `categoryId` for
 * anyone whose permission is scoped to categories — so «this person sees
 * only the skincare line» is a setting the permissions screen offers, the
 * service enforces, and NOBODY COULD EVER CONFIGURE, because the list it
 * picks from is always empty. A capability that cannot be reached is
 * indistinguishable from a broken one.
 *
 * Writing is gated on `products.edit` rather than a new permission key:
 * naming the shelves is part of arranging the shelves, and inventing a
 * key would mean a grant somebody has to remember before any of this
 * works.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    if (!can(user, 'categories.view') && !can(user, 'roles.edit') && !can(user, 'users.edit')) {
      return NextResponse.json(
        { error: 'Forbidden: missing required permission categories.view' },
        { status: 403 }
      );
    }
    if (!user.companyId) {
      return NextResponse.json({ categories: [] });
    }
    const categories = await db.category.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true, nameEn: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ categories });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

/** Whoever may arrange the products may name the shelves. */
async function editor() {
  const user = await requireAuth();
  if (!can(user, 'products.edit')) {
    return { error: NextResponse.json({ error: 'Forbidden: missing products.edit' }, { status: 403 }) };
  }
  if (!user.companyId) {
    return { error: NextResponse.json({ error: 'لا شركة في السياق' }, { status: 400 }) };
  }
  return { user, companyId: user.companyId };
}

/** POST /api/categories — create one. */
export async function POST(req: Request) {
  try {
    const gate = await editor();
    if ('error' in gate) return gate.error;
    const parsed = nameSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'اسم غير صالح' }, { status: 400 });
    }

    // `@@unique([companyId, name])` already forbids a duplicate; saying so
    // plainly beats a constraint error a person cannot read.
    const clash = await db.category.findFirst({
      where: { companyId: gate.companyId, name: parsed.data.name },
      select: { id: true },
    });
    if (clash) return NextResponse.json({ error: 'يوجد تصنيف بهذا الاسم' }, { status: 409 });

    const category = await db.category.create({
      data: { companyId: gate.companyId, name: parsed.data.name, nameEn: parsed.data.nameEn || null },
      select: { id: true, name: true, nameEn: true },
    });
    await logAudit({
      companyId: gate.companyId, userId: gate.user.id, action: 'CATEGORY_CREATED',
      entity: 'Category', entityId: category.id, newData: { name: category.name },
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

/** PATCH /api/categories?id= — rename one. */
export async function PATCH(req: Request) {
  try {
    const gate = await editor();
    if ('error' in gate) return gate.error;
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 });
    const parsed = nameSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'اسم غير صالح' }, { status: 400 });
    }

    const before = await db.category.findFirst({
      where: { id, companyId: gate.companyId },
      select: { id: true, name: true },
    });
    if (!before) return NextResponse.json({ error: 'لا تصنيف بهذا المعرّف' }, { status: 404 });

    const category = await db.category.update({
      where: { id },
      data: { name: parsed.data.name, nameEn: parsed.data.nameEn || null },
      select: { id: true, name: true, nameEn: true },
    });
    await logAudit({
      companyId: gate.companyId, userId: gate.user.id, action: 'CATEGORY_RENAMED',
      entity: 'Category', entityId: id,
      previousData: { name: before.name }, newData: { name: category.name },
    });
    return NextResponse.json({ category });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

/**
 * DELETE /api/categories?id= — only an empty one.
 *
 * Refused while products still point at it, and the count is in the
 * message. Detaching them silently would be the quiet kind of damage:
 * anyone whose permission is scoped to categories would stop seeing
 * those products, with nothing on any screen explaining why.
 */
export async function DELETE(req: Request) {
  try {
    const gate = await editor();
    if ('error' in gate) return gate.error;
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 });

    const category = await db.category.findFirst({
      where: { id, companyId: gate.companyId },
      select: { id: true, name: true, _count: { select: { products: true } } },
    });
    if (!category) return NextResponse.json({ error: 'لا تصنيف بهذا المعرّف' }, { status: 404 });
    if (category._count.products > 0) {
      return NextResponse.json(
        { error: `${category._count.products} منتجاً في هذا التصنيف — انقلها أوّلاً` },
        { status: 409 }
      );
    }

    await db.category.delete({ where: { id } });
    await logAudit({
      companyId: gate.companyId, userId: gate.user.id, action: 'CATEGORY_DELETED',
      entity: 'Category', entityId: id, previousData: { name: category.name },
    });
    return NextResponse.json({ deleted: true });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
