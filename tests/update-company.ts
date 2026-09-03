import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.company.updateMany({
    data: {
      country: 'سوريا',
      currency: 'USD',
      settings: JSON.stringify({
        defaultShippingCost: 0,
        currencySymbol: '$',
        timezone: 'Asia/Damascus',
        country: 'سوريا',
      }),
    },
  });
  console.log('✅ Company updated to Syria');
  await prisma.$disconnect();
}
main();
