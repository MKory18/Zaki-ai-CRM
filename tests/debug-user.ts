import { db } from '../src/lib/db';
async function main() {
  const u = await db.user.findUnique({ where: { email: 'sara@bioderma.com' }, select: { role: true, status: true } });
  console.log('sara:', JSON.stringify(u));
  const cnt = await db.productImage.count();
  console.log('total images in DB:', cnt);
  await db.$disconnect();
}
main();
