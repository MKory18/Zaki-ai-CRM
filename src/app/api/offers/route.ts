import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

export async function GET() {
  try {
    const { companyId } = await requireCompanyTenant();

    const offers = await db.offer.findMany({
      where: { companyId },
      include: {
        product: {
          select: { id: true, name: true, sku: true, basePrice: true, image: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ offers });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('offers.manage');

    const body = await req.json();
    const { productId, name, quantity, sellingPrice, discount, deliveryIncluded, status } = body;

    if (!productId || !name || !sellingPrice) {
      return NextResponse.json(
        { error: 'Product, Offer Name, and Selling Price are required' },
        { status: 400 }
      );
    }

    // Phase S: tenant-validate the referenced product
    const prodCheck = await db.product.findFirst({ where: { id: productId, companyId } });
    if (!prodCheck) {
      return NextResponse.json({ error: "Product not found in your company" }, { status: 404 });
    }

    const offer = await db.offer.create({
      data: {
        companyId,
        productId,
        name: name.trim(),
        quantity: parseInt(quantity, 10) || 1,
        sellingPrice: parseFloat(sellingPrice),
        discount: parseFloat(discount) || 0,
        deliveryIncluded: deliveryIncluded !== false,
        status: status || 'ACTIVE',
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'OFFER_CREATED',
      entity: 'Offer',
      entityId: offer.id,
      newData: offer,
    });

    return NextResponse.json({ success: true, offer });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
