import { describe, expect, it } from 'vitest';
import { repoFile, stripComments, stripTemplates } from '@/lib/guard-source';

/**
 * ONE ELEMENT ANSWERS TO `#zaki-order-form`.
 *
 * Four things in this system reach for that id: the sticky call-to-action
 * (`getElementById`), the raw landing route's «اطلب الآن ↓» anchor, the
 * editor's snippet, and the embedded form script. All four assume it names
 * one element.
 *
 * It named two. `LandingFormBridge` wrapped its child in
 * `<div id="zaki-order-form">` and `OrderForm` rendered
 * `<section id="zaki-order-form">` inside it — so every landing page and
 * every storefront product page this system has ever served carried a
 * duplicate id. `getElementById` returns the first, which was the empty
 * wrapper. Nothing looked wrong, because the wrapper sits exactly where
 * the form does and the scroll landed in the same place.
 *
 * What it did break is anything that reads the element rather than scrolls
 * to it — which is how it was finally found: a check of the form's `dir`
 * read the wrapper's, and the wrapper has none.
 */

const WRITERS = [
  'src/components/landing/OrderForm.tsx',
  'src/components/landing/LandingFormBridge.tsx',
];

/** `id="zaki-order-form"` exactly — not `-element`, `-anchor` or a data flag. */
const WRITES_THE_ID = /id=["'{`]?["']?zaki-order-form["'`]/g;

describe('the order form answers to one id', () => {
  it('is written by exactly one file, and that file is the form', () => {
    const writers = WRITERS.filter((rel) => {
      const src = stripTemplates(stripComments(repoFile(rel)));
      return WRITES_THE_ID.test(src) || /id="zaki-order-form"/.test(src);
    });
    expect(writers).toEqual(['src/components/landing/OrderForm.tsx']);
  });

  it('and the bridge still has a way to scroll to it', () => {
    // The id was the bridge's only other handle on its own box. Taking it
    // away is only safe because the ref was always what scrolled.
    const bridge = repoFile('src/components/landing/LandingFormBridge.tsx');
    expect(bridge).toContain('wrapRef');
    expect(stripComments(bridge)).toContain('wrapRef.current?.scrollIntoView');
    expect(stripComments(bridge)).toContain('<div ref={wrapRef}>');
  });

  it('the form itself still carries it — four things point at it', () => {
    expect(stripComments(repoFile('src/components/landing/OrderForm.tsx')))
      .toContain('id="zaki-order-form"');
  });

  it('the guard can tell the real id from the ones built on it', () => {
    expect('id="zaki-order-form"'.match(/id="zaki-order-form"/)).not.toBeNull();
    expect('id="zaki-order-form-anchor"'.match(/id="zaki-order-form"/)).toBeNull();
    expect('id="zaki-order-form-element"'.match(/id="zaki-order-form"/)).toBeNull();
    expect('<div data-zaki-order-form>'.match(/id="zaki-order-form"/)).toBeNull();
  });
});
