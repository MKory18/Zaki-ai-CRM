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
