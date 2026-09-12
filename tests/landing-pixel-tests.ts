/**
 * META PIXEL (Phase 3) — tracking security & correctness tests.
 * Usage: npx tsx tests/landing-pixel-tests.ts
 */
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' -- ' + extra : ''}`); }
}

async function main() {
  const { validatePixelId, pixelActive, META_PIXEL_EVENTS } = await import('../src/lib/landing-tracking');
  const { sanitizeLandingHtml, sanitizeLandingCss } = await import('../src/lib/landing-html-sanitize');
  const { buildBehaviorScript } = await import('../src/lib/landing-dynamic');
  const fs = require('fs');
  const src = (p: string) => fs.readFileSync(p, 'utf8');

  console.log('\n=== 1. PIXEL ID VALIDATION ===');
  ok('valid 15-digit accepted', validatePixelId('123456789012345') === '123456789012345');
  ok('valid 16-digit accepted', validatePixelId('1234567890123456') === '1234567890123456');
  ok('whitespace trimmed', validatePixelId('  123456789012345  ') === '123456789012345');
  ok('letters rejected', validatePixelId('abc123') === null);
  ok('dashes rejected', validatePixelId('123-456') === null);
  ok('<script> rejected', validatePixelId('<script>alert(1)</script>') === null);
  ok('javascript: rejected', validatePixelId('javascript:123456789012345') === null);
  ok('oversized (>16) rejected', validatePixelId('123456789012345678901234567890') === null);
  ok('empty rejected', validatePixelId('') === null);
  ok('non-string rejected', validatePixelId(null) === null && validatePixelId(undefined) === null);
  ok('14 digits rejected', validatePixelId('12345678901234') === null);

  console.log('\n=== 2. ENABLE/DISABLE GATE ===');
  ok('disabled → null (no Pixel script)', pixelActive(false, '123456789012345') === null);
  ok('enabled + valid → id', pixelActive(true, '123456789012345') === '123456789012345');
  ok('enabled + empty id → null', pixelActive(true, '') === null);
  ok('enabled + invalid id → null (fail closed)', pixelActive(true, 'abc123') === null);
  ok('disabled + valid id → null', pixelActive(true === false, '123456789012345') === null);

  console.log('\n=== 3. EVENTS ARE FIXED (no user-defined) ===');
  ok('exactly the four standard events', JSON.stringify(META_PIXEL_EVENTS) === JSON.stringify(['PageView', 'ViewContent', 'InitiateCheckout', 'Purchase']));

  console.log('\n=== 4. IFRAME CANNOT TOUCH THE PIXEL ===');
  const bs = buildBehaviorScript(false);
  ok('behavior script never references fbq', !bs.includes('fbq'));
  ok('behavior script never injects pixel script', !bs.includes('fbevents.js') && !bs.includes('facebook'));
  ok('sanitizer strips user fbq <script>', !sanitizeLandingHtml("<script>fbq('track','Purchase',{value:999});</script><h1>x</h1>").includes('fbq'));
  ok('sanitizer strips pixel loader script src', !sanitizeLandingHtml('<script src="https://connect.facebook.net/en_US/fbevents.js"></script>').includes('fbevents.js'));
  ok('css url() to code-execution vectors stripped', !sanitizeLandingCss('.a{background:url(javascript:alert(1))}').toLowerCase().includes('javascript:'));
  // custom HTML cannot even reference pixel config
  ok('Pixel ID is not interpolated into behavior script', !bs.includes('metaPixelId') && !bs.includes('123456789012345'));

  console.log('\n=== 5. NO PII IN PIXEL PAYLOADS ===');
  const mp = src('src/components/landing/MetaPixel.tsx');
  const mpPayload = mp.split('payload')[1] || mp;
  ok('MetaPixel payload: content_type/content_ids/content_name/value/currency only',
    mp.includes("content_type: 'product'") && mp.includes('content_ids') && mp.includes('content_name') &&
    !/full_name|phone|address|notes/.test(mp));
  const of = src('src/components/landing/OrderForm.tsx');
  const purchaseCall = of.slice(of.indexOf("track', 'Purchase'"), of.indexOf("track', 'Purchase'") + 260);
  ok('Purchase payload has only value/currency (no PII)', purchaseCall.includes('value:') && purchaseCall.includes('currency:') && !/full_name|phone|address|notes/.test(purchaseCall));
  const bridge = src('src/components/landing/LandingFormBridge.tsx');
  const icSeg = bridge.split('trackInitiateCheckout')[1] || '';
  ok('InitiateCheckout payload: content_type/content_ids (+DB value/currency) only',
    icSeg.includes("content_type: 'product'") && icSeg.includes('content_ids') && !/full_name|phone|address/.test(icSeg));

  console.log('\n=== 6. PURCHASE IS SERVER-CONFIRMED ===');
  const route = src('src/app/api/public/landing-pages/[slug]/orders/route.ts');
  ok('orders API returns server-authoritative total', route.includes('total: Number(order.totalAmount)'));
  ok('orders API returns server-authoritative currency', route.includes('currency: order.currency'));
  ok('Purchase fires only in the success branch', of.includes('if (metaPixelId && json?.orderNumber') && of.indexOf("track', 'Purchase'") > of.indexOf('if (res.ok)'));
  ok('Purchase value from server response only', of.includes("typeof json.total === 'number' ? json.total : null"));
  ok('Purchase currency from server response', of.includes("typeof json.currency === 'string' ? json.currency : currency"));
  ok('Purchase deduped per orderNumber', of.includes('purchaseFiredRef.current.has(ordNum)'));
  ok('failed order (no res.ok) cannot fire Purchase — only success path contains it', (of.match(/track', 'Purchase'/g) || []).length === 1);
  ok('Purchase requires metaPixelId prop (disabled pages never fire)', of.includes('if (metaPixelId && json?.orderNumber'));

  console.log('\n=== 7. INITIATECHECKOUT (bridge, trusted) ===');
  ok('bridge fires InitiateCheckout only when pixelId set', icSeg.includes('if (!pixelId) return'));
  ok('bridge dedupes InitiateCheckout per session', icSeg.includes('checkoutFiredRef.current'));
  ok('bridge InitiateCheckout uses DB offer price', icSeg.includes('payload.value = offer.price'));
  ok('bridge never reads price from message data', !/\bd\.(price|totalAmount|currency)\b/.test(bridge));
  ok('bridge payload content_ids from DB product prop', icSeg.includes('content_ids: product ? [product.id] : []'));

  console.log('\n=== 8. LOADER SECURITY ===');
  ok('loader is client-side only (useEffect, renders null)', mp.includes('useEffect') && mp.includes('return null;'));
  ok('loader re-validates before injecting', mp.includes('validatePixelId(pixelId)'));
  ok('loader fired-once guard (no duplicate PageView)', mp.includes('initialized.current'));

  console.log('\n=== 9. PAGE RENDER RULES ===');
  const page = src('src/app/lp/[slug]/page.tsx');
  ok('public page gates pixel via pixelActive()', page.includes('pixelActive(lp.metaPixelEnabled, lp.metaPixelId)'));
  ok('dashboard/preview never load pixel (component only in /lp page)', !src('src/app/dashboards/crm/landing-pages/[id]/editor/page.tsx').includes('MetaPixel'));

  console.log('\n=== 10. PREVIEW / LEGACY SAFETY ===');
  const previewScript = buildBehaviorScript(true);
  ok('preview behavior script has no pixel events', !previewScript.includes('fbq') && !previewScript.includes('InitiateCheckout'));
  ok('legacy data-zaki-order unaffected', bs.includes("hasAttribute('data-zaki-order')"));
  ok('fixed CTA CSS untouched', (await import('../src/lib/landing-dynamic')).BEHAVIOR_CSS.includes('.zaki-fixed-bottom'));

  console.log(`\n══════════════════════════════`);
  console.log(`PASSED: ${pass}  FAILED: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
export {};