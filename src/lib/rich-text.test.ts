import { describe, it, expect } from 'vitest';
import { sanitizeRich, richToText, isRich, richTextCss, MARK_COLORS, MARK_SIZES, MAX_RICH_LENGTH } from './rich-text';

/**
 * THE VALUE GOES STRAIGHT INTO A PUBLIC PAGE.
 *
 * Which is why the allowlist is walked by hand rather than swept with a
 * regex: a pattern that strips `<script>` strips the ones it recognises,
 * and this has to be right about the ones it does not. Everything below is
 * a thing that must NOT survive.
 */

describe('what survives', () => {
  it('keeps plain text exactly as it is', () => {
    expect(sanitizeRich('عرض خاص لفترة محدودة')).toBe('عرض خاص لفترة محدودة');
  });

  it('keeps the marks the toolbar makes', () => {
    expect(sanitizeRich('عرض <b>خاص</b>')).toBe('عرض <b>خاص</b>');
    expect(sanitizeRich('<i>مائل</i> <u>تحته خط</u> <s>مشطوب</s> <mark>مظلل</mark>')).toBe(
      '<i>مائل</i> <u>تحته خط</u> <s>مشطوب</s> <mark>مظلل</mark>'
    );
  });

  it('keeps a span carrying a colour, a size and a font', () => {
    const v = '<span data-c="3" data-s="l" data-f="cairo">كلمة</span>';
    expect(sanitizeRich(v)).toBe(v);
  });

  it('keeps an uploaded font reference', () => {
    expect(sanitizeRich('<span data-f="u:thmanyah-sans">x</span>')).toContain('data-f="u:thmanyah-sans"');
  });
});

describe('what does not', () => {
  it('drops a script tag and keeps only what was between them', () => {
    // Dropping the tag rather than escaping it: the commonest way markup
    // reaches this field is a paste from a word processor, and a seller
    // pasting a paragraph wants the paragraph. Nothing executes either way.
    const out = sanitizeRich('hi<script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('&lt;script');
    expect(out).toBe('hialert(1)');
  });

  it('refuses an event handler, and the tag carrying it', () => {
    const out = sanitizeRich('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out.toLowerCase()).not.toContain('onerror');
  });

  it('refuses an event handler on a tag it does allow', () => {
    const out = sanitizeRich('<b onclick="alert(1)">x</b>');
    expect(out).toBe('<b>x</b>');
    expect(out.toLowerCase()).not.toContain('onclick');
  });

  it('refuses a style attribute — the whole point of storing indexes', () => {
    const out = sanitizeRich('<span style="background:url(javascript:alert(1))" data-c="3">x</span>');
    expect(out).not.toContain('style');
    expect(out).toContain('data-c="3"');
  });

  it('refuses a colour, size or font that is not on the list', () => {
    expect(sanitizeRich('<span data-c="99">x</span>')).toBe('x');
    expect(sanitizeRich('<span data-s="huge">x</span>')).toBe('x');
    expect(sanitizeRich('<span data-f="Comic Sans">x</span>')).toBe('x');
    expect(sanitizeRich('<span data-f="u:../../etc">x</span>')).toBe('x');
  });

  it('refuses an anchor, because a link inside a headline is not formatting', () => {
    const out = sanitizeRich('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('<a');
    expect(out).toContain('x');
  });

  it('refuses an iframe, an object and a form', () => {
    for (const tag of ['iframe', 'object', 'embed', 'form', 'input', 'svg', 'math']) {
      const out = sanitizeRich(`<${tag} src="x">y</${tag}>`);
      expect(out.toLowerCase(), tag).not.toContain(`<${tag}`);
    }
  });
});

describe('malformed input', () => {
  it('closes what was left open', () => {
    expect(sanitizeRich('<b>bold')).toBe('<b>bold</b>');
    expect(sanitizeRich('<b><i>x')).toBe('<b><i>x</i></b>');
  });

  it('untangles crossed tags rather than emitting them crossed', () => {
    // `<b><i></b>` closes the i as well, because emitting it as written
    // would leave the rest of the page inside an italic nobody opened.
    const out = sanitizeRich('<b><i>x</b>y');
    expect(out).toBe('<b><i>x</i></b>y');
  });

  it('ignores a closing tag that was never opened', () => {
    expect(sanitizeRich('x</b>y')).toBe('xy');
  });

  it('treats a lone angle bracket as a character', () => {
    expect(sanitizeRich('5 < 7')).toBe('5 &lt; 7');
    expect(sanitizeRich('a <b')).toBe('a &lt;b');
  });

  it('stops nesting somewhere', () => {
    const deep = '<b>'.repeat(50) + 'x' + '</b>'.repeat(50);
    const out = sanitizeRich(deep);
    expect((out.match(/<b>/g) || []).length).toBeLessThanOrEqual(6);
    expect(out).toContain('x');
  });

  it('caps the length, so one field cannot become the page', () => {
    const out = sanitizeRich('a'.repeat(MAX_RICH_LENGTH + 500));
    expect(out.length).toBeLessThanOrEqual(MAX_RICH_LENGTH);
  });

  it('never throws, on anything', () => {
    for (const v of ['<', '>', '</', '<<<>>>', '<span', '<span data-c=', '<b ', '', null, undefined]) {
      expect(() => sanitizeRich(v as string), String(v)).not.toThrow();
    }
  });

  it('is stable: sanitising twice changes nothing', () => {
    // It has to be, because it runs on save AND on render. It was not:
    // `a <b` became `a &lt;b` and then `a &amp;lt;b`, so a seller watched
    // their own text grow gibberish a little more with every save.
    for (const v of [
      '<b>x</b>', 'a <b', '5 < 7', 'a & b', 'a &amp; b', '&lt;',
      '<span data-c="3">x</span>', '<script>x</script>', '<b><i>x</b>y',
    ]) {
      const once = sanitizeRich(v);
      expect(sanitizeRich(once), v).toBe(once);
      expect(sanitizeRich(sanitizeRich(once)), v).toBe(once);
    }
  });
});

describe('reading it back as words', () => {
  it('drops the marks', () => {
    expect(richToText('<b>عرض</b> <span data-c="3">خاص</span>')).toBe('عرض خاص');
  });

  it('turns a break into a space rather than joining two words', () => {
    expect(richToText('سطر<br>آخر')).toBe('سطر آخر');
  });

  it('gives back the characters an escape stood for', () => {
    expect(richToText('5 &lt; 7')).toBe('5 < 7');
  });
});

describe('telling the two apart', () => {
  it('knows plain text from marked-up text', () => {
    expect(isRich('عرض خاص')).toBe(false);
    expect(isRich('5 &lt; 7')).toBe(false);
    expect(isRich('<b>x</b>')).toBe(true);
    expect(isRich('')).toBe(false);
    expect(isRich(null)).toBe(false);
  });
});

describe('the stylesheet', () => {
  it('has a rule for every swatch and every size the toolbar offers', () => {
    const css = richTextCss();
    for (const c of MARK_COLORS) expect(css, c.key).toContain(`[data-c="${c.key}"]`);
    for (const s of MARK_SIZES) expect(css, s.key).toContain(`[data-s="${s.key}"]`);
  });

  it('sizes relatively, so a phone still gets phone-sized text', () => {
    for (const s of MARK_SIZES) expect(s.em, s.key).toMatch(/em$/);
  });
});
