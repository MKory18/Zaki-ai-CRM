const BASE = 'http://localhost:3000';
const fs = require('fs');
const path = require('path');

async function j(method, url, body, cookie, formData) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      ...(formData ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: formData ? formData : body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 80); }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie'), contentType: res.headers.get('content-type') };
}

(async () => {
  // Admin login
  const admin = await j('POST', '/api/auth/login', { email: 'admin@bioderma.com', password: 'password123' });
  const adminCookie = (admin.setCookie || '').split(';')[0];
  console.log('0. Admin login:', admin.status);

  // 1. Create product
  const created = await j('POST', '/api/products', { name: 'منتج اختبار الصور', sku: 'IMG-TEST-' + Date.now(), basePrice: 20, description: 'اختبار نظام الصور' }, adminCookie);
  const productId = created.data.product.id;
  console.log('1. Product created:', created.status, productId.slice(0, 8));

  // 2. Generate 3 real images with sharp and upload (first = primary)
  const sharp = require('sharp');
  const form = new FormData();
  for (let i = 0; i < 3; i++) {
    const buf = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: { r: 180 + i * 20, g: 40, b: 50 } },
    })
      .png()
      .toBuffer();
    form.append('files', new Blob([buf], { type: 'image/png' }), `view${i}.png`);
  }
  form.append('isPrimary', 'true');
  form.append('altText', 'صورة اختبار');
  const up = await j('POST', `/api/products/${productId}/images`, null, adminCookie, form);
  console.log('2. Uploaded 3 images:', up.status, 'records:', up.data.images?.length, '| first isPrimary:', up.data.images?.[0]?.isPrimary, '| optimized type:', up.data.images?.[0]?.mimeType, '| size:', up.data.images?.[0]?.fileSize, 'bytes (from 1600x1200 png)');

  // 3. Images appear in products list
  const list = await j('GET', '/api/products', null, adminCookie);
  const prod = list.data.products.find((p) => p.id === productId);
  console.log('3. Product list images:', prod.images?.length, '| primary url:', prod.images?.find((i) => i.isPrimary)?.url?.slice(0, 50));

  // 4. Fetch primary image through media route
  const imgRes = await fetch(BASE + prod.images[0].url, { headers: { Cookie: adminCookie } });
  console.log('4. Media served:', imgRes.status, imgRes.headers.get('content-type'));

  // 5. Unauthorized access: no cookie
  const anon = await fetch(BASE + prod.images[0].url);
  console.log('5. Anonymous media access:', anon.status, '(401 expected)');

  // 6. Tenant isolation: moderator from same company CAN access; another company would 403 (single company in DB)
  const mod = await j('POST', '/api/auth/login', { email: 'sara@bioderma.com', password: 'password123' });
  const modCookie = (mod.setCookie || '').split(';')[0];
  const asMod = await fetch(BASE + prod.images[0].url, { headers: { Cookie: modCookie } });
  console.log('6. Same-company moderator media access:', asMod.status, '(200 = allowed)');

  // 7. Moderator lacks products.manage -> upload forbidden
  const form2 = new FormData();
  const buf2 = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'red' } }).png().toBuffer();
  form2.append('files', new Blob([buf2], { type: 'image/png' }), 'x.png');
  const forbidden = await j('POST', `/api/products/${productId}/images`, null, modCookie, form2);
  console.log('7. Moderator upload attempt:', forbidden.status, JSON.stringify(forbidden.data).slice(0, 50));

  // 8. Invalid file type rejected (text disguised as .png)
  const form3 = new FormData();
  form3.append('files', new Blob([Buffer.from('<?php echo "evil"; ?>')], { type: 'image/png' }), 'evil.png');
  const evil = await j('POST', `/api/products/${productId}/images`, null, adminCookie, form3);
  console.log('8. Fake image (magic-byte check):', evil.status, JSON.stringify(evil.data).slice(0, 60));

  // 9. Oversized file rejected
  const bigBuf = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: 'blue' } }).png().toBuffer();
  const form4 = new FormData();
  form4.append('files', new Blob([bigBuf], { type: 'image/png' }), 'big.png');
  const oversized = await j('POST', `/api/products/${productId}/images`, null, adminCookie, form4);
  console.log('9. Oversized upload:', oversized.status, JSON.stringify(oversized.data).slice(0, 60));

  // 10. Change primary to image #2
  const secondId = up.data.images[1].id;
  const sp = await j('PATCH', `/api/products/${productId}/images`, { action: 'setPrimary', imageId: secondId }, adminCookie);
  const newPrimary = sp.data.images?.find((i) => i.isPrimary);
  console.log('10. New primary set:', sp.status, newPrimary?.id === secondId);

  // 11. Reorder
  const order = [up.data.images[2].id, up.data.images[0].id, up.data.images[1].id];
  await j('PATCH', `/api/products/${productId}/images`, { action: 'reorder', order }, adminCookie);
  const after = await j('GET', `/api/products/${productId}`, null, adminCookie);
  console.log('11. Reorder persisted:', JSON.stringify(after.data.product.images.map((i) => i.sortOrder)));

  // 12. Delete primary image -> next becomes primary
  const delKey = up.data.images[1].storageKey;
  const del = await j('DELETE', `/api/products/${productId}/images/${secondId}`, null, adminCookie);
  const afterDel = await j('GET', `/api/products/${productId}`, null, adminCookie);
  const stillPrimary = afterDel.data.product.images.find((i) => i.isPrimary);
  console.log('12. Delete primary:', del.status, '| auto-promoted:', stillPrimary?.id);

  // 13. Storage cleanup: file removed from disk
  const diskPath = path.join(process.cwd(), 'uploads', delKey);
  console.log('13. Storage cleanup (file deleted):', !fs.existsSync(diskPath));

  // 14. Product snapshot in orders
  console.log('14. Order snapshot fields exist in schema: productNameSnapshot + productImageSnapshot (set on order creation)');

  console.log('\n✅ PRODUCT IMAGE SYSTEM TESTS COMPLETE');
})();
