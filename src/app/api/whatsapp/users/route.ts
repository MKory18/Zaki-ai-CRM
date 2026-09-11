/**
 * GET /api/whatsapp/users — assignable employees (same company only) for the
 * assignment dropdown. whatsapp.assign permission. Minimal fields only.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';
import { apiErrorResponse } from '@/lib/api-error';

export async function GET() {
  try {
    await requirePermission('whatsapp.assign');
    const { companyId } = await requireCompanyTenant();
    const users = await db.user.findMany({
      where: { companyId, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ users });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
