import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// English names for the 15 priced catalog products (SKU -> nameEn)
const EN: Record<string, string> = {
  'MB-SCRUB-01': 'Al-Mubarak Body Scrub Balls',
  'MB-HAIRMASK-02': 'Al-Mubarak Hair Repair & Strengthening Mask 250g',
  'LLLT-CAP-03': 'Red & Blue Light Therapy Hair Growth Cap (LLLT)',
  'EAR-DROP-04': 'Cliarden Ear Drops for Tinnitus Relief 20ml',
  'SCAR-DE-05': 'Original German ALBETCHU Scar Removal Cream 50ml',
  'LARGO-06': 'Largo Men Cream 50g',
  'AFR-SOAP-07': 'African Black Soap 100g',
  'NAIL-FUN-08': 'Nail Fungus Hero Care Cream 50ml',
  'RICHY-09': 'RICHY Hyaluronic Acid & Collagen Cream 50ml',
  'TRUFFLE-10': 'Truffle Water Eye Drops 20ml',
  'SILK-11': 'VARA Silk Hair Removal Cream 50ml',
  'BARAKA-12': 'Baraka Joint & Muscle Relief Cream 50ml',
  'HEMORR-13': 'Hemorrhoid Treatment Cream 50ml',
  'SLIX-14': 'Slix',
  'ROACH-GEL-15': 'Cockroach Gel Bait',
};

async function main() {
  let n = 0;
  for (const [sku, nameEn] of Object.entries(EN)) {
    const res = await prisma.product.updateMany({ where: { sku }, data: { nameEn } });
    n += res.count;
  }
  console.log(`✅ English names set for ${n} products`);
  await prisma.$disconnect();
}
main();
