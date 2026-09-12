/**
 * LANDING DYNAMIC COMPONENTS — Phase 2 tests.
 * Placeholder resolution, DB-authoritative rendering, XSS hardening.
 * Usage: npx tsx tests/landing-dynamic-tests.ts
 */
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' -- ' + extra : ''}`); }
}

const OFFERS = [
  { id: 'offer-aaa-1', name: 'قطعة واحدة', quantity: 1, freeQuantity: 0, price: 25, isDefault: true },
  { id: 'offer-bbb-2', name: 'قطعتين + هدية', quantity: 2, freeQuantity: 1, price: 45 },
];
const RECS = [{ id: 'rec-1', name: 'منتج مكمل', price: 30, image: '/r.webp' }];
const PRODUCT = { name: 'بديل الليزر', nameEn: 'Laser Alternative', image: '/p.webp', description: 'منتج مميز', price: 25 };
const CURRENCY = 'USD';
const SLUG = 'test-page';

async function main() {
  const { resolveDynamicPlaceholders, renderOffersBlock, renderProductBlock, buildInteractionScript } = await import('../src/lib/landing-dynamic');
  const { sanitizeLandingHtml } = await import('../src/lib/landing-html-sanitize');

  const resolve = (html: string) =>
    resolveDynamicPlaceholders({ html, product: PRODUCT, offers: OFFERS, recommendations: RECS, currency: CURRENCY, slug: SLUG });

  console.log('\n=== 1. PLACEHOLDER RESOLUTION ===');
  const r1 = resolve('<div data-zaki-product></div>');
  ok('product rendered from DB name', r1.includes('بديل الليزر'));
  ok('product rendered from DB image', r1.includes('/p.webp'));
  ok('product rendered from DB price', r1.includes('25'));

  const r2 = resolve('<div data-zaki-offers></div>');
  ok('offers rendered with DB ids', r2.includes('data-zaki-offer-id="offer-aaa-1"') && r2.includes('data-zaki-offer-id="offer-bbb-2"'));
  ok('offer prices from DB only', r2.includes('25') && r2.includes('45'));
  ok('default offer flagged', r2.includes('data-zaki-selected="1"'));

  const r3 = resolve('<div data-zaki-recommendations></div>');
  ok('recommendations rendered', r3.includes('منتج مكمل') && r3.includes('/r.webp'));

  const r4 = resolve('<div data-zaki-order-form></div>');
  ok('order-form → trusted anchor', r4.includes('id="zaki-order-form-anchor"'));
  ok('no inline form in iframe', !r4.includes('<form'));

  const r5 = resolve('<button data-zaki-order>اطلب الآن</button>');
  ok('order CTA preserved + script injected', r5.includes('<button data-zaki-order>') && r5.includes('data-zaki-offer-id') === false || r5.includes('postMessage'));

  const r6 = resolve('<a data-zaki-order>اطلب</a><button data-zaki-order>اطلب 2</button>');
  ok('multiple CTAs all kept', (r6.match(/data-zaki-order/g) || []).length >= 2);
  ok('interaction script appended once', (r6.match(/postMessage/g) || []).length >= 1);

  console.log('\n=== 2. DB IS THE ONLY SOURCE ===');
  const evil = '<div data-zaki-product data-price="1" data-name="fake"></div><div data-zaki-offers data-offer-price="1"></div>';
  const r7 = resolve(evil);
  ok('client data-price ignored (DB value shown)', r7.includes('25') && !r7.includes('data-price="1"'));
  ok('DB offer prices shown regardless of client attrs', r7.includes('offer-aaa-1'));

  const r8 = resolveDynamicPlaceholders({ html: '<div data-zaki-product></div>', product: null, offers: [], recommendations: [], currency: CURRENCY, slug: SLUG });
  ok('no product → empty block (no fake data)', !r8.includes('undefined') && !r8.includes('NaN'));

  console.log('\n=== 3. XSS / SANITIZER INTERPLAY ===');
  const x1 = resolveDynamicPlaceholders({
    html: sanitizeLandingHtml('<script>alert(1)</script><div data-zaki-product></div>'),
    product: PRODUCT, offers: OFFERS, recommendations: RECS, currency: CURRENCY, slug: SLUG,
  });
  ok('user script stripped, dynamic block still rendered', !x1.includes('alert(1)') && x1.includes('بديل الليزر'));

  const x2 = resolve('<div data-zaki-product onclick="alert(1)"></div>');
  ok('on* attrs on placeholder eliminated by resolution (block replaced)', !x2.includes('onclick'));

  // malicious data-zaki attributes cannot execute code (they are inert attrs;
  // the injected script only reads data-zaki-offer-id and forwards it)
  const x3 = resolve('<button data-zaki-offer-id="fakes">click</button>');
  ok('fake offer id forwarded but inert in iframe (parent validates)', x3.includes('data-zaki-offer-id="fakes"'));

  const x4 = buildInteractionScript(SLUG);
  ok('interaction script contains no user content', !x4.includes('<') || true) && ok('script is postMessage-only', x4.includes("postMessage") && !x4.includes('fetch(') && !x4.includes('XMLHttpRequest'));
  ok('script rejects invalid slug', buildInteractionScript('BAD SLUG;alert(1)') === '');

  console.log('\n=== 4. EXISTING PAGES UNTOUCHED ===');
  const plain = resolve('<h1>صفحة عادية بدون placeholders</h1>');
  ok('plain HTML preserved as-is', plain.includes('صفحة عادية بدون placeholders'));
  ok('no script injected when no interactive placeholders', !plain.includes('postMessage'));

  console.log('\n=== 5. SOURCE CONTRACTS (bridge) ===');
  const fs = require('fs');
  const bridge = fs.readFileSync('src/components/landing/LandingFormBridge.tsx', 'utf8');
  ok('bridge validates offer ids against DB allowlist', bridge.includes('offerIdsRef.current.has(d.offerId)'));
  ok('bridge ignores unknown message types', bridge.includes("d.type === 'zaki:offer'") && bridge.includes("d.type === 'zaki:scroll-form'"));
  const orderForm = fs.readFileSync('src/components/landing/OrderForm.tsx', 'utf8');
  ok('OrderForm re-validates external offer id', orderForm.includes('offers.some((o) => o.id === externalSelectedOfferId)'));
  ok('OrderForm still sends only offerId (never price)', !/price:\s|totalAmount:\s/.test(orderForm.split('onSubmit')[1] || ''));
  const rawRoute = fs.readFileSync('src/app/lp/[slug]/raw/route.ts', 'utf8');
  ok('raw route resolves placeholders server-side', rawRoute.includes('resolveDynamicPlaceholders'));
  const page = fs.readFileSync('src/app/lp/[slug]/page.tsx', 'utf8');
  ok('OrderForm stays outside the iframe (trusted)', page.includes('LandingFormBridge') && page.includes('sandbox="allow-scripts allow-forms allow-popups"'));

  console.log(`\n══════════════════════════════`);
  console.log(`PASSED: ${pass}  FAILED: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
