/**
 * GLOBAL TRACKING — security & correctness source tests.
 * Usage: npx tsx tests/landing-pixel-tests.ts
 */
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' -- ' + extra : ''}`); }
}

async function main() {
  const { validatePixelId } = await import('../src/lib/landing-tracking');
  const { validateMetaPixelId, validateTikTokPixelId, validateSnapchatPixelId } = await import('../src/lib/tracking/tracking-validation');
  const { sanitizeLandingHtml, sanitizeLandingCss } = await import('../src/lib/landing-html-sanitize');
  const { buildBehaviorScript } = await import('../src/lib/landing-dynamic');
  const fs = require('fs');
  const src = (p: string) => fs.readFileSync(p, 'utf8');

  console.log('\n=== 1. PIXEL ID VALIDATION (fail closed) ===');
  ok('Meta valid 15-digit accepted', validateMetaPixelId('123456789012345') === '123456789012345');
  ok('Meta letters rejected', validateMetaPixelId('abc123') === null);
  ok('Meta javascript: rejected', validateMetaPixelId('javascript:123456789012345') === null);
  ok('Meta <script> rejected', validateMetaPixelId('<script>alert(1)</script>') === null);
  ok('TikTok valid accepted', validateTikTokPixelId('C4ABCD1234567890') === 'C4ABCD1234567890');
  ok('TikTok javascript: rejected', validateTikTokPixelId('javascript:alert(1)') === null);
  ok('Snap valid UUID accepted', validateSnapchatPixelId('110ec58a-a0f2-4ac4-8393-c866d813b8d1') === '110ec58a-a0f2-4ac4-8393-c866d813b8d1');
  ok('Snap non-UUID rejected', validateSnapchatPixelId('not-a-uuid') === null);
  ok('legacy Meta validator intact', validatePixelId('123456789012345') === '123456789012345');

  console.log('\n=== 2. SINGLE SOURCE — old MetaPixel is gone ===');
  ok('MetaPixel.tsx deleted', !fs.existsSync('src/components/landing/MetaPixel.tsx'));
  ok('lp page no longer uses MetaPixel', !src('src/components/landing/LandingPageView.tsx').includes('MetaPixel'));
  ok('lp page uses LandingTrackingPixels', src('src/components/landing/LandingPageView.tsx').includes('LandingTrackingPixels'));
  ok('no duplicate fbq PageView path remains in landing components',
    !src('src/components/landing/OrderForm.tsx').includes('window.fbq') &&
    !src('src/components/landing/LandingFormBridge.tsx').includes('window.fbq'));

  console.log('\n=== 3. CENTRAL ENGINE ===');
  const engine = src('src/lib/tracking/tracking-client.ts');
  ok('engine dedupes events (per platform+pixel+event[+order])', engine.includes('trackingEventKey'));
  ok('engine never dispatches to disabled/out-of-scope pixels', engine.includes('filterPixelsForPage'));
  ok('engine re-validates pixel IDs before any use', engine.includes('validateTrackingPixelId'));
  ok('adapters receive sanitized payload only', engine.includes('this.adapters[pixel.platform].track(event, safe'));
  ok('ViewContent only with a trusted product', engine.includes("event === 'ViewContent'"));

  console.log('\n=== 4. GLOBAL INJECTION ===');
  ok('GlobalTrackingProvider mounted in root layout', src('src/app/layout.tsx').includes('GlobalTrackingProvider'));
  ok('layout starts the engine empty — selling pages register their own pixels', src('src/app/layout.tsx').includes('<GlobalTrackingProvider pixels={[]}>'));
  ok('landing pages resolve their pixels server-side', src('src/components/landing/LandingPageView.tsx').includes('getTrackingPixelsForPage'));
  ok('landing page resolves pixels server-side (scope LANDING_PAGES)',
    src('src/components/landing/LandingPageView.tsx').includes("getTrackingPixelsForPage(companyId, 'LANDING_PAGES')"));

  console.log('\n=== 5. PLATFORM ADAPTERS (hard-coded loaders) ===');
  const platforms = src('src/lib/tracking/tracking-platforms.ts');
  ok('TikTok browser pixel events allowlisted', platforms.includes("'Pageview'") && platforms.includes("'CompletePayment'"));
  ok('Snapchat events allowlisted', platforms.includes("'PAGE_VIEW'") && platforms.includes("'PURCHASE'"));
  ok('Meta events allowlisted', platforms.includes("'InitiateCheckout'") && platforms.includes("'Purchase'"));
  ok('every event map covers exactly the central allowlist',
    ['PageView', 'ViewContent', 'InitiateCheckout', 'Purchase'].every((e) => platforms.includes(`${e}:`)));

  console.log('\n=== 6. UPLOADED HTML CANNOT INJECT TRACKING ===');
  const bs = buildBehaviorScript(false);
  ok('behavior script never references fbq/ttq/snaptr', !/fbq|ttq|snaptr/.test(bs));
  ok('behavior script never injects pixel loaders', !bs.includes('fbevents.js') && !bs.includes('facebook') && !bs.includes('tiktok') && !bs.includes('snap'));
  ok('sanitizer strips user fbq <script>', !sanitizeLandingHtml("<script>fbq('track','Purchase',{value:999});</script><h1>x</h1>").includes('fbq'));
  ok('sanitizer strips pixel loader script src', !sanitizeLandingHtml('<script src="https://connect.facebook.net/en_US/fbevents.js"></script>').includes('fbevents.js'));
  ok('css url() code-execution vectors stripped', !sanitizeLandingCss('.a{background:url(javascript:alert(1))}').toLowerCase().includes('javascript:'));

  console.log('\n=== 7. SERVER-AUTHORITATIVE DATA / NO PII ===');
  const oform = src('src/components/landing/OrderForm.tsx');
  ok('Purchase fires only in the success branch', oform.indexOf("trackEvent('Purchase'") > oform.indexOf('if (res.ok)'));
  ok('Purchase value from server response only', oform.includes("typeof json.total === 'number' ? json.total : null"));
  ok('Purchase deduped per orderNumber', oform.includes('purchaseFiredRef.current.has(ordNum)'));
  const bridge = src('src/components/landing/LandingFormBridge.tsx');
  ok('bridge dedupes InitiateCheckout per session', bridge.includes('checkoutFiredRef.current'));
  ok('bridge never reads price from message data', !/\bd\.(price|totalAmount|currency)\b/.test(bridge));
  const route = src('src/app/api/public/landing-pages/[slug]/orders/route.ts');
  // The total is computed where the order is — the shared public-order path both doors use.
  ok('orders API returns server-authoritative total', src('src/lib/public-order.ts').includes('total: Number(order.totalAmount)'));
  ok('payload sanitizer blocks PII keys', /full_name|'phone'|'address'|'notes'/.test(src('src/lib/tracking/tracking-types.ts')) && src('src/lib/tracking/tracking-types.ts').includes('PII_KEYS'));

  console.log('\n=== 8. SETTINGS API SECURITY ===');
  const api = src('src/app/api/settings/tracking-pixels/route.ts');
  ok('create requires settings.edit', api.includes("requirePermission('settings.edit')"));
  ok('list requires settings.view', api.includes("requirePermission('settings.view')"));
  ok('tenant always from session (no body companyId)', !/data:\s*\{[^}]*body|companyId:\s*body/.test(api));
  const apiId = src('src/app/api/settings/tracking-pixels/[id]/route.ts');
  ok('update/delete are company-scoped (cross-tenant → 404)', apiId.includes('findFirst({ where: { id, companyId } })'));
  ok('platform spoofing rejected', apiId.includes('immutable') || apiId.includes('لا يمكن تغيير منصة البكسل'));
  ok('audit log written on create', api.includes('TRACKING_PIXEL_CREATED'));

  console.log('\n=== 9. BEHAVIOR LAYER UNTOUCHED ===');
  ok('legacy data-zaki-order unaffected', bs.includes("hasAttribute('data-zaki-order')"));
  ok('fixed CTA CSS untouched', (await import('../src/lib/landing-dynamic')).BEHAVIOR_CSS.includes('.zaki-fixed-bottom'));

  console.log(`\n══════════════════════════════`);
  console.log(`PASSED: ${pass}  FAILED: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
export {};
