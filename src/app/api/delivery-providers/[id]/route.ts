import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

/**
 * PATCH /api/delivery-providers/[id] — update/activate/deactivate (company-scoped)
 * DELETE /api/delivery-providers/[id] — soft-disable (isActive=false) if unused
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const provider = await db.deliveryProvider.findFirst({ where: { id, companyId } });
    if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

    const body = await req.json();
    const { name, phone, email, address, notes, isActive } = body as {
      name?: string; phone?: string; email?: string; address?: string; notes?: string; isActive?: boolean;
    };

    const updated = await db.deliveryProvider.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {}),
        ...(address !== undefined ? { address: address?.trim() || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
      },
    });

    await logAudit({
      companyId, userId: user.id, action: 'DELIVERY_PROVIDER_UPDATED',
      entity: 'DeliveryProvider', entityId: id,
      previousData: { name: provider.name, isActive: provider.isActive },
      newData: { isActive, by: user.name },
    });

    return NextResponse.json({ success: true, provider: updated });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const provider = await db.deliveryProvider.findFirst({
      where: { id, companyId },
      include: { _count: { select: { orders: true } } },
    });
    if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

    // Soft-disable when in use (preserve history) — never destroy references
    if (provider._count.orders > 0) {
      await db.deliveryProvider.update({ where: { id }, data: { isActive: false } });
      await logAudit({
        companyId, userId: user.id, action: 'DELIVERY_PROVIDER_DEACTIVATED',
        entity: 'DeliveryProvider', entityId: id, newData: { by: user.name },
      });
      return NextResponse.json({ success: true, deactivated: true });
    }

    await db.deliveryProvider.delete({ where: { id } });
    await logAudit({
      companyId, userId: user.id, action: 'DELIVERY_PROVIDER_DELETED',
      entity: 'DeliveryProvider', entityId: id, newData: { name: provider.name, by: user.name },
    });
    return NextResponse.json({ success: true, deleted: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}
