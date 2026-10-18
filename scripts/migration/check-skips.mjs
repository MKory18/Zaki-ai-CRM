import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
// status distribution in migrated orders
const dist = await p.order.groupBy({ by: ['confirmationStatus', 'shippingStatus', 'settlementStatus'], _count: true, where: { company: { name: 'صحة بلس' } }, orderBy: { _count: { confirmationStatus: 'desc' } } });
console.log('=== migrated status distribution ===');
for (const d of dist) console.log(d._count, d.confirmationStatus, '/', d.shippingStatus, '/', d.settlementStatus);
// month histogram
const months = await p.$queryRawUnsafe(`SELECT to_char("createdAt",'YYYY-MM') m, count(*) n FROM orders WHERE "companyId"=(SELECT id FROM companies WHERE name='صحة بلس') GROUP BY 1 ORDER BY 1`);
console.log('=== orders by month ===');
for (const r of months) console.log(r.m, r.n);
await p.$disconnect();
