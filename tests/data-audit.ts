import { db } from '../src/lib/db';

async function audit() {
  const orders = await db.order.findMany({
    include: { customer: { select: { companyId: true } }, product: { select: { companyId: true } } },
  });
  const crossTenant = orders.filter(
    (o) => o.customer.companyId !== o.companyId || o.product.companyId !== o.companyId
  ).length;

  const dupPhones = await db.customer.groupBy({
    by: ['companyId', 'phone'],
    _count: { phone: true },
    having: { phone: { _count: { gt: 1 } } },
  });

  const invalidStatus = await db.order.count({
    where: {
      status: {
        notIn: [
          'NEW', 'CONTACTING', 'NO_ANSWER', 'CONFIRMED', 'POSTPONED', 'REJECTED',
          'READY_FOR_SHIPPING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED',
          'CANCELLED', 'RETURNED', 'FAILED_DELIVERY',
        ],
      },
    },
  });

  const noPrice = await db.product.count({ where: { basePrice: 0 } });
  const totalProducts = await db.product.count();
  const missingEn = await db.product.count({ where: { nameEn: null } });

  console.log('=== DATA INTEGRITY AUDIT ===');
  console.log('total orders:', orders.length);
  console.log('cross-tenant violations:', crossTenant);
  console.log('duplicate customer phones (per company):', dupPhones.length);
  console.log('invalid order statuses:', invalidStatus);
  console.log('products:', totalProducts, '| without price:', noPrice, '| missing English name:', missingEn);

  // Financial sanity: delivered revenue matches
  const delivered = await db.order.findMany({ where: { status: 'DELIVERED' } });
  const revenue = delivered.reduce((s, o) => s + o.totalAmount, 0);
  const cogs = delivered.reduce((s, o) => s + o.estimatedCostOfGoods, 0);
  console.log('delivered revenue:', revenue.toFixed(2), '| COGS:', cogs.toFixed(2), '| gross:', (revenue - cogs).toFixed(2));

  await db.$disconnect();
}
audit();
