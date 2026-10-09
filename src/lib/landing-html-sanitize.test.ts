import { describe, expect, it } from 'vitest';
import { sanitizeLandingHtml } from './landing-html-sanitize';

/**
 * AN EVENT HANDLER IS REMOVED WHEREVER A PARSER WOULD SEE ONE.
 *
 * The rule matched `\son…=` — a handler after whitespace — so `<svg/onload=>`
 * and `<img src="x"onerror=>`, both real handlers to a browser, came back
 * untouched and ran as script in the uploaded page.
 */

const noHandler = (html: string) => !/on[a-z]+\s*=/i.test(html);

describe('inline event handlers', () => {
  it('after whitespace, as before', () => {
    expect(noHandler(sanitizeLandingHtml('<div onclick="x()">a</div>'))).toBe(true);
  });

  it('after a slash', () => {
    const out = sanitizeLandingHtml('<svg/onload=fetch("/api/x",{method:"PATCH"})><img/src="x"/onerror=alert(1)>');
    expect(noHandler(out)).toBe(true);
  });

  it('straight after a quoted value', () => {
    expect(noHandler(sanitizeLandingHtml(`<img src="x"onerror=alert(1)><a href='#'onmouseover='y()'>a</a>`))).toBe(true);
  });

  it('when removing one would splice two halves into a new one', () => {
    expect(noHandler(sanitizeLandingHtml('<img src=x /ononerror=error=alert(1)>'))).toBe(true);
  });

  it('leaves ordinary attributes and text alone', () => {
    const out = sanitizeLandingHtml('<p class="note" data-zaki-action="order">online offer</p>');
    expect(out).toContain('class="note"');
    expect(out).toContain('data-zaki-action="order"');
    expect(out).toContain('online offer');
  });
});

/**
 * AND THE TAG THE WHOLE FUNCTION EXISTS FOR.
 *
 * The file's own header lists `<script>` first among what it removes, and
 * nothing here asserted it — five tests, all about `on…=` handlers. The
 * gap was found while deleting `/api/public/landing-pages/[slug]/form.js`,
 * a public endpoint that served a bootstrap script for uploaded HTML to
 * load: it could have no consumer precisely BECAUSE this strip runs at
 * save time. A claim that lets a public endpoint be deleted should not
 * rest on reading the regex.
 */
describe('script tags', () => {
  const noScript = (html: string) => !/<\s*\/?\s*script/i.test(html);

  it('removes a plain block, content and all', () => {
    const out = sanitizeLandingHtml('<p>a</p><script>alert(1)</script><p>b</p>');
    expect(noScript(out)).toBe(true);
    expect(out).not.toContain('alert(1)');
    // And the page around it survives — this strips, it does not refuse.
    expect(out).toContain('<p>a</p>');
    expect(out).toContain('<p>b</p>');
  });

  it('removes one that only loads a src, which is the shape that mattered', () => {
    // Exactly what `form.js` would have needed in an uploaded page.
    const out = sanitizeLandingHtml(
      '<div id="zaki-order-form"></div><script src="/api/public/landing-pages/x/form.js"></script>'
    );
    expect(noScript(out)).toBe(true);
    expect(out).not.toContain('form.js');
    expect(out).toContain('id="zaki-order-form"');
  });

  it('is not fooled by case, spacing or attributes', () => {
    for (const bad of [
      '<SCRIPT>alert(1)</SCRIPT>',
      '<script type="text/javascript">alert(1)</script >',
      '<script\ndefer\nsrc="x.js"></script>',
      '<script >alert(1)</script>',
    ]) {
      expect(noScript(sanitizeLandingHtml(bad)), bad).toBe(true);
    }
  });

  it('and leaves no stray half of one behind', () => {
    // A lone opening or closing tag is still a parser instruction.
    expect(noScript(sanitizeLandingHtml('<p>a</p><script src="x.js">'))).toBe(true);
    expect(noScript(sanitizeLandingHtml('</script><p>a</p>'))).toBe(true);
  });

  it('and the word «script» in ordinary text is not a tag', () => {
    // A strip that eats prose is a strip people switch off.
    const out = sanitizeLandingHtml('<p>اكتب لنا النص script وسنرد عليك</p>');
    expect(out).toContain('اكتب لنا النص script وسنرد عليك');
  });
});

describe('the other active content the header promises to remove', () => {
  it('drops iframes, objects and embeds', () => {
    const out = sanitizeLandingHtml(
      '<iframe src="https://evil"></iframe><object data="x"></object><embed src="y">'
    );
    expect(out).not.toMatch(/<\s*iframe/i);
    expect(out).not.toMatch(/<\s*object/i);
    expect(out).not.toMatch(/<\s*embed/i);
  });

  it('neutralises a javascript: URL wherever it is written', () => {
    const out = sanitizeLandingHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript\s*:/i);
  });
});

/**
 * REMOVING A TAG CAN BUILD A NEW ONE — THE LESSON STEP 3 ALREADY KNEW.
 *
 * The handler strip loops «so removing one handler cannot splice two
 * fragments into a new one». That is a property of REMOVAL, not of
 * handlers, and the tag strips above it ran once each. MEASURED against
 * the single pass:
 *
 *   <scr<script>ipt>alert(1)</scr<script>ipt>  →  <script>alert(1)</script>
 *   <obj<object></object>ect data="x">         →  <object data="x">
 *
 * The first is a working script tag written into the database as
 * sanitized. The sandbox and the CSP remain the primary boundary — an
 * opaque origin cannot reach ours — but `allow-scripts` and
 * `allow-popups` are granted, and the page this becomes is where a
 * customer types their phone number and address.
 *
 * `<object>` carried a second hole: a pair rule and no lone-tag rule,
 * where `<iframe>` has both, so the spliced `<object …>` matched nothing.
 */
describe('a tag spliced out of two halves', () => {
  const noActive = (html: string) =>
    !/<\s*\/?\s*(script|iframe|object|embed|base)\b/i.test(html);

  it('does not leave a script behind', () => {
    const out = sanitizeLandingHtml('<scr<script>ipt>alert(1)</scr<script>ipt>');
    expect(out, 'نصفان التحما بعد الحذف فصارا وسماً عاملاً').not.toContain('<script>');
    expect(noActive(out)).toBe(true);
  });

  it('nor an object, which also had no lone-tag rule of its own', () => {
    const out = sanitizeLandingHtml('<obj<object></object>ect data="x">');
    expect(out).not.toContain('<object');
    expect(noActive(out)).toBe(true);
  });

  it('nor an iframe, an embed or a base', () => {
    for (const bad of [
      '<ifr<iframe></iframe>ame src="https://evil">',
      '<emb<embed>ed src="x">',
      '<ba<base>se href="https://evil/">',
    ]) {
      expect(noActive(sanitizeLandingHtml(bad)), bad).toBe(true);
    }
  });

  it('and keeps going until nothing changes, however deep the nesting', () => {
    // Three layers: one pass fixes none of it, two fix part.
    const out = sanitizeLandingHtml('<scr<scr<script></script>ipt></script>ipt>alert(1)');
    expect(noActive(out)).toBe(true);
  });

  it('while ordinary markup around it is untouched', () => {
    const out = sanitizeLandingHtml('<p class="a">نص</p><scr<script>ipt>x</script><p>ب</p>');
    expect(out).toContain('<p class="a">نص</p>');
    expect(out).toContain('<p>ب</p>');
    expect(noActive(out)).toBe(true);
  });
});

/**
 * A SCHEME WRITTEN AS CHARACTER REFERENCES IS STILL THAT SCHEME.
 *
 * The scheme test tolerates whitespace between the letters — the old
 * trick — and did not tolerate the letters being written as `&#106;`,
 * which a browser decodes before it reads the URL. MEASURED: both
 * `&#106;avascript:alert(1)` and `&#x6a;avascript:alert(1)` came back
 * untouched in an `href`.
 */
describe('a javascript: URL hidden in character references', () => {
  const dead = (html: string) => /href="#"/.test(html);

  it('is neutralised in decimal, hex and zero-padded form', () => {
    for (const bad of [
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<a href="&#x6a;avascript:alert(1)">x</a>',
      '<a href="&#0000106;avascript:alert(1)">x</a>',
      '<a href="&#106avascript:alert(1)">x</a>', // the semicolon is optional
    ]) {
      expect(dead(sanitizeLandingHtml(bad)), bad).toBe(true);
    }
  });

  it('and so is the plain form, which already worked', () => {
    expect(dead(sanitizeLandingHtml('<a href="javascript:alert(1)">x</a>'))).toBe(true);
    expect(dead(sanitizeLandingHtml('<a href="java\tscript:alert(1)">x</a>'))).toBe(true);
  });

  it('but an ordinary entity in an ordinary attribute is left exactly as written', () => {
    /*
     * The decode judges the value and is never written back. A sanitizer
     * that rewrites what it approves corrupts ordinary pages — `&amp;` in
     * a query string, `&#1575;` in a title.
     */
    const out = sanitizeLandingHtml('<a href="/x?a=1&amp;b=2" title="&#1575;">x</a>');
    expect(out).toContain('href="/x?a=1&amp;b=2"');
    expect(out).toContain('title="&#1575;"');
  });
});
