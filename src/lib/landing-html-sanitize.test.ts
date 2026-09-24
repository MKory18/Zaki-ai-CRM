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
