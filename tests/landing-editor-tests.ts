/**
 * LANDING PAGE EDITOR — sanitizer & pricing regression tests.
 * Usage: npx tsx tests/landing-editor-tests.ts
 */
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' -- ' + extra : ''}`); }
}

async function main() {
  console.log('\n=== 1. HTML SANITIZER ===');
  const { sanitizeLandingHtml, sanitizeLandingCss, parseLandingSettings, applyLandingVariables, LANDING_VARIABLES } = await import('../src/lib/landing-html-sanitize');

  const s1 = sanitizeLandingHtml('<h1>مرحبا</h1><script>alert(1)</script><p>نص</p>');
  ok('script tag removed', !s1.includes('<script') && !s1.includes('alert(1)'));
  ok('safe content preserved', s1.includes('<h1>مرحبا</h1>'));

  const s2 = sanitizeLandingHtml('<div onclick="alert(1)" onerror="x()">t</div>');
  ok('inline on* handlers stripped', !s2.includes('onclick') && !s2.includes('onerror'));

  const s3 = sanitizeLandingHtml('<a href="javascript:alert(1)">x</a>');
  ok('javascript: href neutralized', !s3.toLowerCase().includes('javascript:'));

  const s4 = sanitizeLandingHtml('<a href="JaVaScRiPt:alert(1)">x</a>');
  ok('mixed-case javascript: neutralized', !s4.toLowerCase().includes('javascript:'));

  const s5 = sanitizeLandingHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">');
  ok('data:text/html src neutralized', !s5.toLowerCase().includes('data:text/html'));

  const s6 = sanitizeLandingHtml('<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="y">');
  ok('iframe/object/embed removed', !s6.includes('<iframe') && !s6.includes('<object') && !s6.includes('<embed'));

  const s7 = sanitizeLandingHtml('<meta http-equiv="refresh" content="0;url=https://evil.example"><meta charset="utf-8">');
  ok('meta refresh removed, charset kept', !s7.includes('http-equiv') && s7.includes('charset'));

  const s8 = sanitizeLandingHtml('<form action="https://evil.example/steal"><input></form>');
  ok('form action stripped', !s8.includes('action='));
  ok('form element itself kept', s8.includes('<form'));

  const s9 = sanitizeLandingHtml('<base href="https://evil.example/">');
  ok('base tag removed', !s9.includes('<base'));

  const s10 = sanitizeLandingHtml('<div style="background:url(javascript:alert(1))">x</div>');
  ok('style javascript: stripped', !s10.toLowerCase().includes('javascript:'));

  const s11 = sanitizeLandingHtml('<p>normal <b>bold</b> <img src="https://cdn.example/a.webp"></p>');
  ok('benign markup untouched', s11.includes('<b>bold</b>') && s11.includes('https://cdn.example/a.webp'));

  console.log('\n=== 2. CSS SANITIZER ===');
  const c1 = sanitizeLandingCss('.a { width: expression(alert(1)); color: red; }');
  ok('expression() stripped', !c1.includes('expression'));
  ok('benign css preserved', c1.includes('color: red'));

  const c2 = sanitizeLandingCss('.b { background: url(javascript:alert(1)); }');
  ok('url(javascript:) stripped', !c2.toLowerCase().includes('javascript:'));

  const c3 = sanitizeLandingCss('@import url("https://evil.example/x.css"); .c{color:red}');
  ok('@import stripped', !c3.includes('@import'));
  ok('rules preserved after @import removal', c3.includes('.c{color:red}'));

  const c4 = sanitizeLandingCss('.hero { background: #fff; padding: 40px 20px; }');
  ok('normal css untouched', c4.includes('.hero { background: #fff; padding: 40px 20px; }'));

  console.log('\n=== 3. SETTINGS VALIDATION ===');
  ok('valid settings parsed', JSON.stringify(parseLandingSettings({ width: 'contained', maxWidth: 960, background: '#ffffff', direction: 'rtl', fontFamily: 'Tajawal' })) === JSON.stringify({ width: 'contained', maxWidth: 960, background: '#ffffff', direction: 'rtl', fontFamily: 'Tajawal' }));
  ok('invalid background rejected', parseLandingSettings({ background: 'javascript:alert(1)' })?.background === undefined);
  ok('out-of-range maxWidth clamped out', parseLandingSettings({ maxWidth: 99999 })?.maxWidth === undefined);
  ok('malformed JSON string → null', parseLandingSettings('{bad json') === null);
  ok('null → null', parseLandingSettings(null) === null);

  console.log('\n=== 4. DYNAMIC VARIABLES (whitelist) ===');
  ok('all whitelist keys documented', LANDING_VARIABLES.includes('product.name') && LANDING_VARIABLES.includes('product.image'));
  const v1 = applyLandingVariables('<h1>{{product.name}}</h1><img src="{{product.image}}">', { name: 'بديل الليزر', image: '/x.webp' });
  ok('product.name replaced + escaped', v1.includes('<h1>بديل الليزر</h1>'));
  ok('product.image replaced', v1.includes('src="/x.webp"'));
  const v2 = applyLandingVariables('{{product.name}}', { name: '<script>alert(1)</script>' });
  ok('variable value HTML-escaped (XSS-safe)', !v2.includes('<script>') && v2.includes('&lt;script&gt;'));
  const v3 = applyLandingVariables('{{user.password}} {{system.token}}', { name: 'x' });
  ok('non-whitelisted placeholders untouched', v3 === '{{user.password}} {{system.token}}');
  const v4 = applyLandingVariables('{{ product.name }}', { name: 'ماء' });
  ok('whitespace-tolerant placeholders', v4 === 'ماء');
  ok('price rendered', applyLandingVariables('{{product.price}}', { price: 45 }) === '45');

  console.log(`\n══════════════════════════════`);
  console.log(`PASSED: ${pass}  FAILED: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
export {};
