import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { can } from '@/lib/authorization';

/**
 * GET /api/categories — lightweight tenant category list (id, name) for
 * permission scope pickers (Phase 6 adds full CRUD). Requires categories.view,
 * roles.edit, or users.edit (per-user override scope pickers).
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
