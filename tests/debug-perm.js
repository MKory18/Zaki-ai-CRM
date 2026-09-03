const BASE = 'http://localhost:3000';
const sharp = require('sharp');

async function j(method, url, body, cookie, formData) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(formData ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
    body: formData ? formData : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 100); }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

(async () => {
  // Fresh moderator login
  const mod = await j('POST', '/api/auth/login', { email: 'layla@bioderma.com', password: 'password123' });
  console.log('layla login:', mod.status, mod.data.user?.role, mod.data.user?.status, '| perms:', JSON.stringify(mod.data.user?.permissions));
  const cookie = (mod.setCookie || '').split(';')[0];
  console.log('cookie present:', !!cookie);

  // Who am I according to server?
  const me = await j('GET', '/api/auth/me', null, cookie);
  console.log('me:', me.status, me.data.user?.role, JSON.stringify(me.data.user?.permissions));

  // Get a product
  const admin = await j('POST', '/api/auth/login', { email: 'admin@bioderma.com', password: 'password123' });
  const adminCookie = (admin.setCookie || '').split(';')[0];
  const list = await j('GET', '/api/products', null, adminCookie);
  const productId = list.data.products.find((p) => p.sku.startsWith('MB-'))?.id;
  console.log('target product:', productId);

  // Attempt upload as moderator
  const form = new FormData();
  const buf = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'green' } }).png().toBuffer();
  form.append('files', new Blob([buf], { type: 'image/png' }), 't.png');
  const attempt = await j('POST', `/api/products/${productId}/images`, null, cookie, form);
  console.log('MODERATOR upload attempt:', attempt.status, JSON.stringify(attempt.data).slice(0, 100));
})();
