import { parseOrderText, matchProduct } from '../src/lib/order-parser';
import { db } from '../src/lib/db';

async function test() {
  const text = `الاسم: عبدالله عبدالقادر عبدالعال
الرقم: 0936654998
اسم المحافظة: سووريا
العنوان: بانياس المدينة
الطلب ( المنتج ): كريم علاج فطريات الأظافر
الكمية: 1
السعر: 20$
الملاحظات: -
اسم الصفحة: الشيت`;

  const parsed = parseOrderText(text);
  console.log('=== PARSED ===');
  console.log(JSON.stringify(parsed, null, 2));

  const products = await db.product.findMany({ select: { id: true, name: true, sku: true } });
  const match = matchProduct(parsed.productQuery, products);
  console.log('=== MATCHED PRODUCT ===');
  console.log(match);
  await db.$disconnect();
}

test();
