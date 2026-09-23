import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requireContext } from '@/lib/geo-context';
import { findOrCreateCustomer } from '@/lib/customer-identity';
import { can, getPermissionScope, requirePermission } from '@/lib/authorization';
import { normalizePhoneNumber } from '@/lib/phone';
import { logAudit, redactCustomerForAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * Full PII projection for users holding 'customers.view'.
 * Includes contact details, address, notes and order stats.
 */
const FULL_CUSTOMER_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  rawPhone: true,
  altPhone: true,
  address: true,
  city: true,
  country: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
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
};

/**
 * Limited projection for agents holding only 'customers.view_basic'
 * (CONFIRMATION_AGENT / FOLLOW_UP_AGENT): they need name + phone + city
 * to make calls, but must not see address, notes, altPhone or stats.
 */
const BASIC_CUSTOMER_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  rawPhone: true,
  city: true,
  country: true,
};

export async function GET(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();

    // Permission-tiered PII: full data for customers.view, limited
    // call-relevant fields for customers.view_basic, 403 for everyone else.
    const canViewFull = can(user, 'customers.view');
    if (!canViewFull && !can(user, 'customers.view_basic')) {
      return NextResponse.json(
        { error: 'Forbidden: missing required permission customers.view' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('q')?.trim();

    // This store's customers. The stores are separate businesses: one
    // store's complaint about a person is not the other's to read.
    const whereClause: any = { companyId, ...(storeId ? { storeId } : {}) };

    // OWN scope means the customers this person actually brought in: the
    // ones with at least one order they are the moderator of. A customer
    // has no owner column — the relationship lives in the orders — so it is
    // derived here rather than stored, the same way the order state is.
    const scope = getPermissionScope(user, canViewFull ? 'customers.view' : 'customers.view_basic');
    if (scope?.scope === 'OWN') {
      whereClause.orders = { some: { companyId, moderatorId: user.id } };
    }

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
      select: canViewFull ? FULL_CUSTOMER_SELECT : BASIC_CUSTOMER_SELECT,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ customers, limited: !canViewFull });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('customers.create');

    const body = await req.json();
    const { fullName, phone, altPhone, address, city, country, notes } = body;

    if (!fullName || !phone) {
      return NextResponse.json({ error: 'Full Name and Phone Number are required' }, { status: 400 });
    }

    const normalizedPhone = normalizePhoneNumber(phone);

    // Duplicate detection within THIS store — the same person may be a
    // customer of two of them, each with its own record.
    const existing = await db.customer.findFirst({
      where: { companyId, storeId, phone: normalizedPhone },
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
      // Audit redaction: PII-heavy fields (address, altPhone, notes)
      // are stripped before persisting the audit snapshot.
      newData: redactCustomerForAudit(customer),
    });

    return NextResponse.json({ isExisting: false, customer });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
