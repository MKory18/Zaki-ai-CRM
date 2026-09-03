import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { companyId } = await requirePermission('users.manage');
    const { searchParams } = new URL(req.url);

    const search = searchParams.get('q')?.trim();
    const role = searchParams.get('role')?.trim();
    const status = searchParams.get('status')?.trim();
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const whereClause: any = {
      OR: [{ companyId }, { companyId: null }],
    };

    if (search) {
      whereClause.AND = [
        {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
          ],
        },
      ];
    }
    if (role && role !== 'all') whereClause.role = role;
    if (status && status !== 'all') whereClause.status = status;
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt.gte = new Date(dateFrom);
      if (dateTo) whereClause.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const [total, users] = await Promise.all([
      db.user.count({ where: whereClause }),
      db.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          avatar: true,
          phone: true,
          createdAt: true,
          lastLoginAt: true,
          assignedById: true,
          assignedAt: true,
          assignedBy: { select: { name: true } },
          company: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      users,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
