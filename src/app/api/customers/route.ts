import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';
import { normalizePhoneNumber } from '@/lib/phone';
import { logAudit } from '@/lib/audit';

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('q')?.trim();

    const whereClause: any = { companyId };
    if (search) {
      const normalizedSearch = normalizePhoneNumber(search);
      whereClause.OR = [
        { fullName: { contains: search } },
        { phone: { contains: normalizedSearch || search } },
        { rawPhone: { contains: search } },
        { city: { contains: search } },
      ];
    }

    const customers = await db.customer.findMany({
      where: whereClause,
      include: {
        orders: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            status: true,
            createdAt: true,
            product: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ customers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('customers.create');

    const body = await req.json();
    const { fullName, phone, altPhone, address, city, country, notes } = body;

    if (!fullName || !phone) {
      return NextResponse.json({ error: 'Full Name and Phone Number are required' }, { status: 400 });
    }

    const normalizedPhone = normalizePhoneNumber(phone);

    // Duplicate detection based on normalized phone
    const existing = await db.customer.findUnique({
      where: {
        companyId_phone: {
          companyId,
          phone: normalizedPhone,
        },
      },
      include: {
        orders: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
    });

    if (existing) {
      return NextResponse.json({
        isExisting: true,
        message: 'Customer already exists. Reusing profile to prevent duplication.',
        customer: existing,
      });
    }

    const customer = await db.customer.create({
      data: {
        companyId,
        fullName: fullName.trim(),
        phone: normalizedPhone,
        rawPhone: phone.trim(),
        altPhone: altPhone ? altPhone.trim() : null,
        address: address?.trim() || '',
        city: city?.trim() || 'Cairo',
        country: country?.trim() || 'Egypt',
        notes: notes?.trim() || null,
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CUSTOMER_CREATED',
      entity: 'Customer',
      entityId: customer.id,
      newData: customer,
    });

    return NextResponse.json({ isExisting: false, customer });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
