import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface SheetOffer {
  name: string;
  quantity: number;
  price: number;
}

interface SheetProduct {
  name: string;
  sku: string;
  country?: string;
  currency: string;
  offers?: SheetOffer[];
}

// ─── Products from Google Sheet with offer prices ───
const priced: SheetProduct[] = [
  {
    name: 'مقشر الكرات من المبارك',
    sku: 'MB-SCRUB-01',
    country: 'الأردن',
    currency: 'JOD',
    offers: [
      { name: 'عبوة عدد 1 + توصيل مجاني', quantity: 1, price: 12 },
      { name: 'عبوة عدد 2 + توصيل مجاني', quantity: 2, price: 20 },
      { name: 'عبوة عدد 3 + توصيل مجاني', quantity: 3, price: 25 },
    ],
  },
  {
    name: 'ماسك إصلاح وتقوية الشعر – المبارك 250 جم',
    sku: 'MB-HAIRMASK-02',
    country: 'الأردن',
    currency: 'JOD',
    offers: [
      { name: 'باكبت 250 جم عدد 1 + توصيل مجاني', quantity: 1, price: 10 },
      { name: 'باكبت 250 جم عدد 2 + توصيل مجاني', quantity: 2, price: 18 },
      { name: 'باكبت 250 جم عدد 3 + توصيل مجاني', quantity: 3, price: 25 },
    ],
  },
  {
    name: 'قبعة العلاج بالضوء الأحمر والأزرق لنمو الشعر',
    sku: 'LLLT-CAP-03',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'طاقية عدد 1 + توصيل مجاني', quantity: 1, price: 60 },
      { name: 'طاقية عدد 2 + توصيل مجاني', quantity: 2, price: 100 },
    ],
  },
  {
    name: 'قطرة طنين الأذن Cliarden 20 مل',
    sku: 'EAR-DROP-04',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'عبوة عدد 1 + توصيل مجاني', quantity: 1, price: 20 },
      { name: 'عبوة عدد 2 + توصيل مجاني', quantity: 2, price: 35 },
      { name: 'عبوة عدد 3 + توصيل مجاني', quantity: 3, price: 45 },
    ],
  },
  {
    name: 'كريم إزالة الندبات الألماني الأصلي ALBETCHU 50 مل',
    sku: 'SCAR-DE-05',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'عبوة عدد 1 + توصيل مجاني', quantity: 1, price: 20 },
      { name: 'عبوة عدد 2 + توصيل مجاني', quantity: 2, price: 35 },
      { name: 'عبوة عدد 3 + توصيل مجاني', quantity: 3, price: 45 },
    ],
  },
  {
    name: 'لارجو Largo كريم للرجال 50 جم',
    sku: 'LARGO-06',
    country: 'الأردن',
    currency: 'JOD',
    offers: [
      { name: 'عبوة واحدة + توصيل مجاني', quantity: 1, price: 10 },
      { name: 'عبوة عدد 2 + توصيل مجاني', quantity: 2, price: 18 },
    ],
  },
  {
    name: 'الصابونة الإفريقية African Black Soap 100 جم',
    sku: 'AFR-SOAP-07',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'قطعة عدد 1 + توصيل مجاني', quantity: 1, price: 20 },
      { name: 'قطعة عدد 2 + توصيل مجاني', quantity: 2, price: 35 },
      { name: 'قطعة عدد 3 + توصيل مجاني', quantity: 3, price: 45 },
    ],
  },
  {
    name: 'كريم الفطريات Nail Fungus Hero Care 50 مل',
    sku: 'NAIL-FUN-08',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'عبوة عدد 1 + توصيل مجاني', quantity: 1, price: 20 },
      { name: 'عبوة عدد 2 + توصيل مجاني', quantity: 2, price: 35 },
      { name: 'عبوة عدد 3 + توصيل مجاني', quantity: 3, price: 45 },
    ],
  },
  {
    name: 'ريتشي كولاجين كريم RICHY 50 مل',
    sku: 'RICHY-09',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'عبوة عدد 1 + توصيل مجاني', quantity: 1, price: 20 },
      { name: 'عبوة عدد 2 + توصيل مجاني', quantity: 2, price: 35 },
      { name: 'عبوة عدد 3 + توصيل مجاني', quantity: 3, price: 45 },
    ],
  },
  {
    name: 'ماء الكمأة للعين 20 مل',
    sku: 'TRUFFLE-10',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'عبوة عدد 1 + توصيل مجاني', quantity: 1, price: 15 },
      { name: 'عبوة عدد 2 + عبوة مجاناً + توصيل مجاني', quantity: 3, price: 25 },
    ],
  },
  {
    name: 'كريم حرير VARA لإزالة الشعر 50 مل',
    sku: 'SILK-11',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'عبوة عدد 1 + توصيل مجاني', quantity: 1, price: 20 },
      { name: 'عبوة عدد 2 + توصيل مجاني', quantity: 2, price: 35 },
      { name: 'عبوة عدد 3 + توصيل مجاني', quantity: 3, price: 45 },
    ],
  },
  {
    name: 'كريم بركة لآلام المفاصل 50 مل',
    sku: 'BARAKA-12',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'عبوة عدد 1 + توصيل مجاني', quantity: 1, price: 20 },
      { name: 'عبوة عدد 2 + توصيل مجاني', quantity: 2, price: 35 },
      { name: 'عبوة عدد 3 + توصيل مجاني', quantity: 3, price: 45 },
    ],
  },
  {
    name: 'كريم البواسير 50 مل',
    sku: 'HEMORR-13',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'عبوة عدد 1 + توصيل مجاني', quantity: 1, price: 20 },
      { name: 'عبوة عدد 2 + توصيل مجاني', quantity: 2, price: 35 },
      { name: 'عبوة عدد 3 + توصيل مجاني', quantity: 3, price: 45 },
    ],
  },
  {
    name: 'سليكس',
    sku: 'SLIX-14',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'عبوة عدد 1 + توصيل مجاني', quantity: 1, price: 20 },
      { name: 'عبوة عدد 2 + توصيل مجاني', quantity: 2, price: 35 },
      { name: 'عبوة عدد 3 + توصيل مجاني', quantity: 3, price: 45 },
    ],
  },
  {
    name: 'جل الصراصير',
    sku: 'ROACH-GEL-15',
    country: 'سوريا',
    currency: 'USD',
    offers: [
      { name: 'قطعة بـ 7$ + توصيل مجاني', quantity: 1, price: 7 },
      { name: '3 قطع بـ 15$ + توصيل مجاني', quantity: 3, price: 15 },
    ],
  },
];

// ─── Remaining products from the sheet (names only, offers added later) ───
const catalog: string[] = [
  'جهاز البديكير الكهربائى للقدم',
  'ورق الزبدة Baking Paper',
  'لمامة الوبر',
  'منظم الشنط (بيتعلق على الباب)',
  'مثبت الباب المطاطى',
  'عصارة الليمون',
  'منظم الأحذية',
  'المج الحرارى (طقم)',
  'ماكينة الخياطة المحمولة',
  'جهاز تدليك الرقبة الكهربائى',
  'جهاز تدليك الكتف الكهربائى',
  'مسن السكاكين الكهربائى',
  'حذاء الشتاء',
  'مزيل الزيوت العنيدة',
  'حامل ومحرك الأثاث',
  'أكياس حفظ الطعام',
  'أصغر حلاقة فى العالم',
  'عجانة هولمكس الألمانية',
  'كروت الأطفال التعليمية',
  'ماكينة القهوة الأنتيكا',
  'غسالة الملابس المحمولة',
  'مريلة المطبخ المقاومة للمياه',
  'جهاز التدليك والاسترخاء',
  'معطر المرحاض',
  'فوط المايكروفايبر',
  'أداة تنظيف الأذن',
  'منظم الأسلاك الكهربائية',
  'الخلاط الكهربائى المحمول',
  'جهاز القياس الذكى',
  'هاتف أنتيكا',
  'حجامة جهاز التدليك',
  'جهاز تنظيف الفواكه والخضار',
  'مجموعة Enzo للشعر',
  'جهاز تدليك الوجه والرقبة',
  'ماكينة حلاقة للرجال ماركة GW',
  'جهاز تدليك الرقبة والجسم',
  'جهاز تخسيس الجسم',
  'جهاز تدليك كهربائي لكامل الجسم',
  'راديو أنتيكا',
  'مج القهوة والخلاط الحرارى',
  'فرشاة القطط',
  'جهاز تمارين البطن',
  'سلة مهملات ذكية',
  'مكواة بخار محمولة',
  'بطانية كهربائية حجم كبير',
  'الكتاب الإلكترونى للأطفال',
  'ماكينة قهوة إسبريسو سوكانى',
  'خلاط سوكانى 4×1',
  'هاند بليندر سوكانى',
  'حافظة طعام كهربائى',
  'مضخة مياه فورية',
  'سماعة القرآن الكريم',
  'ممحاة إزالة الشعر',
  'لمبات ليد بالريموت',
  'ماكينة تحضير القهوة التركى',
  'سماعة الأذن',
  'ماكينة القهوة سنوفير',
  'جهاز النوم والاسترخاء',
  'جهاز قياس الضغط الرقمى',
  'مصباح ديكور',
  'مرطب هواء صغير',
  'قطاعة الخضار اليدوية متعددة الوظائف',
  'خيط مائى للاسنان',
  'جهاز شفاط اللبن الكهربائى',
  'طاولة الرسم للأطفال',
  'سلاقة البيض الكهربائية',
  'مساحة مثلث',
  'ماكينة الفشار',
  'خلاط ناشيونال ضد الكسر',
  'لمبات ليد بالإضاءة',
  'جهاز مساج للقدم',
  'تناية رموش كهربائية',
  'بوتى سلم للأطفال',
  'مضرب صلصة كهربائى',
  'جهاز تمارين الفخذين',
  'جهاز مساج الرقبة المصغر',
  'وسادة تدليك الجسم',
  'ممسحة الزجاج المغناطيسية',
  'سماعات الرأس البلوتوث',
  'فرشاة المرحاض بحاملها',
  'رقبة طبية',
  'ماكينة لف ورق العنب',
  'كرسى قابل للطى للتخييم',
  'قطاعة خضروات',
  'آلة صنع السمبوسة',
];

async function main() {
  console.log('🌱 Seeding SALESFLOW with Google Sheet catalog (المبارك)...');

  await prisma.aiDailySummary.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.orderActivity.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.productionBatch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  const company = await prisma.company.create({
    data: {
      name: 'المبارك ستور — Al Mubarak Store',
      currency: 'JOD',
      country: 'الأردن',
      settings: JSON.stringify({ defaultShippingCost: 0, currencySymbol: 'د.أ', timezone: 'Asia/Amman' }),
    },
  });
  console.log('✅ Company:', company.name);

  const passwordHash = await bcrypt.hash('password123', 10);

  await prisma.user.create({
    data: { email: 'superadmin@salesflow.io', name: 'Platform Super Admin', passwordHash, role: 'SUPER_ADMIN', status: 'ACTIVE' },
  });

  await prisma.user.create({
    data: {
      companyId: company.id, email: 'admin@bioderma.com', name: 'مدير المتجر (Admin)',
      passwordHash, role: 'COMPANY_ADMIN', status: 'ACTIVE',
    },
  });

  await prisma.user.create({
    data: {
      companyId: company.id, email: 'manager@bioderma.com', name: 'مدير المبيعات',
      passwordHash, role: 'MANAGER', status: 'ACTIVE',
    },
  });

  await prisma.user.create({
    data: {
      companyId: company.id, email: 'finance@bioderma.com', name: 'المحاسب',
      passwordHash, role: 'ACCOUNTANT', status: 'ACTIVE',
    },
  });

  await prisma.user.create({
    data: {
      companyId: company.id, email: 'shipping@bioderma.com', name: 'مدير الشحن والتوصيل',
      passwordHash, role: 'DELIVERY_MANAGER', status: 'ACTIVE',
    },
  });

  const modsData = [
    { email: 'sara@bioderma.com', name: 'سارة محمود', phone: '+962 790 000 001', commissionRate: 5 },
    { email: 'omar@bioderma.com', name: 'عمر خالد', phone: '+962 790 000 002', commissionRate: 5 },
    { email: 'layla@bioderma.com', name: 'ليلى حسن', phone: '+962 790 000 003', commissionRate: 5 },
  ];
  for (const m of modsData) {
    await prisma.user.create({
      data: { companyId: company.id, ...m, passwordHash, role: 'MODERATOR', status: 'ACTIVE' },
    });
  }
  console.log('✅ Users & roles created');

  // Products + offers
  let batchNo = 1;
  for (const p of priced) {
    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        name: p.name,
        sku: p.sku,
        description: `منتج من كتالوج المبارك — ${p.country ?? 'متوفر'}`,
        basePrice: p.offers?.[0]?.price ?? 0,
        status: 'ACTIVE',
      },
    });

    for (const o of p.offers ?? []) {
      await prisma.offer.create({
        data: {
          companyId: company.id,
          productId: product.id,
          name: `${o.name} — ${o.price} ${p.currency === 'JOD' ? 'دنانير' : 'دولار'}`,
          quantity: o.quantity,
          sellingPrice: o.price,
          discount: 0,
          deliveryIncluded: true,
          status: 'ACTIVE',
        },
      });
    }

    // Give each priced product a production batch with cost ~35% of base price
    const qty = 500;
    const unitCost = Number((p.offers?.[0]?.price ?? 10) * 0.35);
    const totalCost = Number((unitCost * qty).toFixed(2));
    const batch = await prisma.productionBatch.create({
      data: {
        companyId: company.id,
        productId: product.id,
        batchNumber: `BATCH-${String(batchNo).padStart(3, '0')}`,
        quantityProduced: qty,
        quantitySold: 0,
        quantityRemaining: qty,
        manufacturingCost: Number((totalCost * 0.5).toFixed(2)),
        packagingCost: Number((totalCost * 0.2).toFixed(2)),
        rawMaterialCost: Number((totalCost * 0.3).toFixed(2)),
        otherCosts: 0,
        totalProductionCost: totalCost,
        costPerUnit: unitCost,
        status: 'COMPLETED',
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        companyId: company.id,
        productId: product.id,
        batchId: batch.id,
        type: 'PRODUCTION',
        quantity: qty,
        balanceAfter: qty,
        referenceId: batch.id,
        reason: `Batch ${batch.batchNumber}`,
      },
    });
    batchNo++;
  }

  for (const name of catalog) {
    const sku = 'MB-' + Buffer.from(name).toString('hex').slice(0, 6).toUpperCase() + '-' + (batchNo++);
    await prisma.product.create({
      data: {
        companyId: company.id,
        name,
        sku,
        description: 'منتج من كتالوج المبارك',
        basePrice: 0,
        status: 'ACTIVE',
      },
    });
  }
  console.log(`✅ ${priced.length} priced products + ${catalog.length} catalog products created with offers & batches`);

  // A few demo customers/orders for the dashboard
  const modSara = await prisma.user.findFirst({ where: { email: 'sara@bioderma.com' } });
  const modOmar = await prisma.user.findFirst({ where: { email: 'omar@bioderma.com' } });

  const cust1 = await prisma.customer.create({
    data: {
      companyId: company.id, fullName: 'أحمد المغني', phone: '07980921745', rawPhone: '07980921745',
      address: 'الفردوس - شارع 14', city: 'عمّان', country: 'الأردن',
      totalOrders: 1, deliveredOrders: 1, totalPurchaseValue: 12,
    },
  });

  const scrub = await prisma.product.findFirst({ where: { sku: 'MB-SCRUB-01' } });
  const scrubOffer = await prisma.offer.findFirst({ where: { productId: scrub!.id, quantity: 1 } });

  const order1 = await prisma.order.create({
    data: {
      companyId: company.id, orderNumber: 'ORD-2026-0001',
      customerId: cust1.id, productId: scrub!.id, offerId: scrubOffer!.id,
      quantity: 1, sellingPrice: 12, shippingCost: 0, totalAmount: 12,
      currency: 'JOD', moderatorId: modSara!.id,
      moderatorCommission: Number((12 * 0.05).toFixed(2)),
      estimatedCostOfGoods: Number((12 * 0.35).toFixed(2)),
      status: 'DELIVERED', source: 'Facebook Ads',
      confirmedAt: new Date('2026-09-01T10:00:00Z'),
      shippedAt: new Date('2026-09-01T14:00:00Z'),
      deliveredAt: new Date('2026-09-02T16:00:00Z'),
    },
  });
  await prisma.callLog.create({
    data: { companyId: company.id, orderId: order1.id, moderatorId: modSara!.id, result: 'CONFIRMED', notes: 'الزبون أكد الطلب والتوصيل مجاني.' },
  });
  await prisma.orderActivity.create({
    data: { companyId: company.id, orderId: order1.id, userId: modSara!.id, action: 'STATUS_CHANGED', previousStatus: 'SHIPPED', newStatus: 'DELIVERED' },
  });

  const scarProd = await prisma.product.findFirst({ where: { sku: 'SCAR-DE-05' } });
  const scarOffer = await prisma.offer.findFirst({ where: { productId: scarProd!.id, quantity: 2 } });
  const cust2 = await prisma.customer.create({
    data: {
      companyId: company.id, fullName: 'محمد طارق', phone: '07901234567', rawPhone: '07901234567',
      address: 'تلاع العلي', city: 'عمّان', country: 'الأردن', totalOrders: 1,
    },
  });
  await prisma.order.create({
    data: {
      companyId: company.id, orderNumber: 'ORD-2026-0002',
      customerId: cust2.id, productId: scarProd!.id, offerId: scarOffer!.id,
      quantity: 2, sellingPrice: 35, shippingCost: 0, totalAmount: 35,
      currency: 'USD', moderatorId: modOmar!.id,
      moderatorCommission: Number((35 * 0.05).toFixed(2)),
      estimatedCostOfGoods: Number((35 * 0.35).toFixed(2)),
      status: 'CONFIRMED', source: 'TikTok',
      confirmedAt: new Date(),
    },
  });

  await prisma.notification.createMany({
    data: [
      { companyId: company.id, userId: modSara!.id, title: 'طلب جديد', message: 'لديك طلب جديد بحاجة إلى متابعة.', type: 'ORDER_NEW', link: '/orders' },
      { companyId: company.id, title: 'تنبيه مخزون', message: 'مقشر الكرات من المبارك — 500 قطعة متوفرة.', type: 'LOW_STOCK', isRead: true, link: '/inventory' },
    ],
  });

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
