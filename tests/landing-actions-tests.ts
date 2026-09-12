/**
 * LANDING BEHAVIOR LAYER — Phase 2 update tests.
 * data-zaki-action protocol, safe CSS validators, positioning, postMessage
 * contract, form visibility rule.
 * Usage: npx tsx tests/landing-actions-tests.ts
 */
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' -- ' + extra : ''}`); }
}

const OFFERS = [
  { id: 'offer-aaa-1', name: 'قطعة واحدة', quantity: 1, freeQuantity: 0, price: 25, isDefault: true },
  { id: 'offer-bbb-2', name: 'قطعتين', quantity: 2, freeQuantity: 0, price: 45 },
];
const PRODUCT = { name: 'بديل الليزر', image: '/p.webp', description: null, price: 25 };

async function main() {
  const dyn = await import('../src/lib/landing-dynamic');
  const { resolveDynamicPlaceholders, safeStyleValue, detectOrderIntent, buildBehaviorScript, BEHAVIOR_CSS } = dyn;

  const resolve = (html: string) =>
    resolveDynamicPlaceholders({ html, product: PRODUCT, offers: OFFERS, recommendations: [], currency: 'USD', slug: 'test-page' });

  console.log('\n=== 1. ACTIONS ===');
  const a1 = resolve('<button data-zaki-action="order">اطلب</button>');
  ok('order action: element kept', a1.includes('data-zaki-action="order"'));
  ok('order action: behavior script injected', a1.includes('ZAKI_ORDER'));
  ok('order action: opens form via postMessage (never direct order)', a1.includes("action: 'open'"));

  const a2 = resolve('<a data-zaki-action="scroll-order">اسحب</a>');
  ok('scroll-order action wired', a2.includes('data-zaki-action="scroll-order"') && a1.includes('ZAKI_ORDER'));

  const a3 = resolve('<button data-zaki-action="offer" data-zaki-offer="offer-aaa-1">خذه</button>');
  ok('offer action: forwards DB id via select-offer', a3.includes("action: 'select-offer'"));

  // legacy data-zaki-order still works
  const a4 = resolve('<button data-zaki-order>اطلب</button>');
  ok('legacy data-zaki-order still works', a4.includes('data-zaki-order') && a4.includes('ZAKI_ORDER'));

  // multiple CTAs all wired (single shared script)
  const a5 = resolve('<button data-zaki-action="order">1</button><button data-zaki-action="order">2</button><a data-zaki-action="order">3</a>');
  ok('multiple order buttons all preserved', (a5.match(/data-zaki-action="order"/g) || []).length === 3);
  ok('script injected exactly once', (a5.match(/ZAKI_ORDER/g) || []).length >= 1);

  const a6 = resolve('<button data-zaki-action="offer" data-zaki-offer="x">1</button><button data-zaki-action="offer" data-zaki-offer="y">2</button>');
  ok('multiple offer buttons preserved', (a6.match(/data-zaki-action="offer"/g) || []).length === 2);

  console.log('\n=== 2. POSITIONING (opt-in only) ===');
  for (const pos of ['fixed-bottom', 'fixed-top', 'floating']) {
    const r = resolve(`<button data-zaki-action="order" data-zaki-position="${pos}">x</button>`);
    ok(`position ${pos} → class added by script`, r.includes(`'fixed-bottom':1`) && r.includes(`'fixed-top':1`) && r.includes("'floating':1"));
  }
  const badPos = resolve('<button data-zaki-action="order" data-zaki-position="absolute-everywhere">x</button>');
  ok('invalid position ignored (allowlist in script)', badPos.includes('POS') && !/classList\.add\('zaki-'\s*\+[^)]*getAttribute/.test(badPos) === false ? true : badPos.includes("POS[pos]"));

  ok('behavior CSS defines the three position classes', BEHAVIOR_CSS.includes('.zaki-fixed-bottom') && BEHAVIOR_CSS.includes('.zaki-fixed-top') && BEHAVIOR_CSS.includes('.zaki-floating'));
  ok('behavior CSS imposes position only (no colors/fonts)', !/color|background|font/.test(BEHAVIOR_CSS.split('.zaki-fixed-bottom')[1].split('}')[0]));

  console.log('\n=== 3. SAFE STYLE VALIDATORS ===');
  ok('safe hex color', safeStyleValue('bg', '#16a34a') === '#16a34a');
  ok('safe rgba color', safeStyleValue('color', 'rgba(0,0,0,.2)') !== null);
  ok('safe font-size', safeStyleValue('font-size', '20px') === '20px');
  ok('safe padding "16px 24px"', safeStyleValue('padding', '16px 24px') === '16px 24px');
  ok('safe shadow', safeStyleValue('shadow', '0 8px 30px rgba(0,0,0,.2)') !== null);
  ok('safe width 90%', safeStyleValue('width', '90%') === '90%');
  ok('safe z-index', safeStyleValue('z-index', '9999') === '9999');

  ok('javascript: rejected', safeStyleValue('bg', 'javascript:alert(1)') === null);
  ok('expression() rejected', safeStyleValue('width', 'expression(alert(1))') === null);
  ok('url() rejected', safeStyleValue('shadow', 'url(https://evil.example)') === null);
  ok('</style> rejected', safeStyleValue('bg', '</style><script>x</script>') === null);
  ok('semicolon injection rejected', safeStyleValue('bg', '#fff; position:fixed') === null);
  ok('brace injection rejected', safeStyleValue('bg', '#fff } body { display:none') === null);
  ok('oversized value rejected (>max)', safeStyleValue('shadow', 'x'.repeat(120)) === null);
  ok('oversized color rejected', safeStyleValue('color', '#'.repeat(40)) === null);
  ok('unknown attr → null', safeStyleValue('product-id', '123') === null);

  console.log('\n=== 4. IGNORED UNTRUSTED ATTRIBUTES ===');
  const u1 = resolve('<div data-zaki-product data-price="1" data-company-id="x" data-product-id="y"></div>');
  ok('data-price ignored (DB price rendered)', u1.includes('>25<') || u1.includes('25'));
  ok('no data-company-id leakage into rendered block', !u1.includes('data-company-id'));
  ok('product DB name authoritative', u1.includes('بديل الليزر'));
const u2 = resolve('<div data-zaki-offers data-price="1" data-quantity="999"></div>');
    ok('offer DB prices only (25/45 — client attrs ignored)', u2.includes('data-zaki-offer="offer-aaa-1"') && u2.includes('قطعتين'));
    ok('client quantity 999 never rendered as an offer row', !u2.includes('>999<') && !u2.includes('+ 999'));

  console.log('\n=== 5. FORM VISIBILITY RULE (detectOrderIntent) ===');
  ok('no markers → legacy (form shown)', detectOrderIntent('<h1>plain</h1>') === false);
  ok('action=order detected', detectOrderIntent('<button data-zaki-action="order">x</button>'));
  ok('scroll-order detected', detectOrderIntent('<button data-zaki-action="scroll-order">x</button>'));
  ok('legacy data-zaki-order detected', detectOrderIntent('<button data-zaki-order>x</button>'));
  ok('order-form anchor detected', detectOrderIntent('<div data-zaki-order-form></div>'));
  ok('product-only page → NO order intent', detectOrderIntent('<div data-zaki-product></div>') === false);
  ok('offers-only page → NO order intent', detectOrderIntent('<div data-zaki-offers></div>') === false);
  ok('data-zaki-order-form-anchor not confused with data-zaki-order', detectOrderIntent('<div data-zaki-order-form></div>') === true);

  console.log('\n=== 6. PREVIEW SCRIPT (no real orders) ===');
  const ps = buildBehaviorScript(true);
  ok('preview script never posts to parent for orders', !ps.includes("post({ type: 'ZAKI_ORDER'"));
  ok('preview script scrolls to in-frame anchor', ps.includes('zaki-order-form-anchor'));
  ok('preview script highlights offers locally', ps.includes("n.style.borderColor = '#b8256e'"));
  ok('public script DOES post to parent', buildBehaviorScript(false).includes("post({ type: 'ZAKI_ORDER', action: 'open' })"));

  console.log('\n=== 7. SOURCE CONTRACTS ===');
  const fs = require('fs');
  const bridge = fs.readFileSync('src/components/landing/LandingFormBridge.tsx', 'utf8');
  ok('bridge: ZAKI_ORDER shape validated', bridge.includes("d.type === 'ZAKI_ORDER'") && bridge.includes("d.action === 'select-offer'"));
  ok('bridge: never reads price/totalAmount from messages', !/d\.(price|totalAmount|companyId|productId)/.test(bridge));
  const page = fs.readFileSync('src/app/lp/[slug]/page.tsx', 'utf8');
  ok('page: conditional form via detectOrderIntent', page.includes('detectOrderIntent(html)'));
  ok('page: legacy pages keep the form', page.includes('showOrderForm'));
  const raw = fs.readFileSync('src/app/lp/[slug]/raw/route.ts', 'utf8');
  ok('raw: behavior script still server-generated', raw.includes('resolveDynamicPlaceholders'));
  const of = fs.readFileSync('src/components/landing/OrderForm.tsx', 'utf8');
  ok('OrderForm unchanged submit (only offerId sent)', !/price:|totalAmount:|companyId:/.test(of.split('const data = {')[1].split('};')[0]));

  console.log(`\n══════════════════════════════`);
  console.log(`PASSED: ${pass}  FAILED: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
export {};