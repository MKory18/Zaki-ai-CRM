import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { buildBehaviorScript } from './landing-dynamic';

/**
 * THE SCRIPT THE UPLOADED-HTML PAGE RUNS MUST BE A SCRIPT THAT STARTS.
 *
 * Its validators are regexes written inside a template literal, with FOUR backslashes (`\\s`). The literal
 * turns that into `\s` — a regex for «a backslash, then the letter s» — and one of them, `url\(`, is an
 * opening parenthesis with no close: «Invalid regular expression: Unterminated group». A script with a syntax
 * error does not run AT ALL: no fixed «اطلب الآن» button, no offer selection, no styling attributes — on every
 * page that uses a `data-zaki-*` marker. (`a-pattern-in-a-template-needs-its-backslashes` guards the opposite
 * mistake, a single backslash that the literal swallows.)
 *
 * This runs the script, against a stand-in for the page, and asks it what it did.
 */

type El = {
  attrs: Record<string, string>;
  classes: Set<string>;
  style: Record<string, string>;
  attributes: { name: string; value: string }[];
  getAttribute(n: string): string | null;
  classList: { add(c: string): void };
  style_: { setProperty(k: string, v: string): void };
};

function element(attrs: Record<string, string>): El & { style: Record<string, string> } {
  const classes = new Set<string>();
  const style: Record<string, string> = {};
  return {
    attrs,
    classes,
    style: Object.assign(style, { setProperty: (k: string, v: string) => (style[k] = v) }) as never,
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    getAttribute: (n: string) => attrs[n] ?? null,
    classList: { add: (c: string) => void classes.add(c) },
    style_: { setProperty: (k: string, v: string) => (style[k] = v) },
  } as never;
}

function run(preview: boolean, els: ReturnType<typeof element>[]) {
  const posted: unknown[] = [];
  const listeners: Record<string, (e: unknown) => void> = {};
  const sandbox = {
    document: {
      querySelectorAll: () => els,
      body: {},
      addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
      getElementById: () => null,
    },
    window: { parent: { postMessage: (m: unknown) => posted.push(m) } },
    String,
  };
  const code = buildBehaviorScript(preview).replace(/^<script>|<\/script>$/g, '');
  new vm.Script(code); // a syntax error throws HERE
  vm.runInNewContext(code, sandbox);
  return { posted, listeners };
}

describe('the behaviour script', () => {
  it('is a script that compiles — in the page and in the preview', () => {
    for (const preview of [false, true]) {
      const code = buildBehaviorScript(preview).replace(/^<script>|<\/script>$/g, '');
      expect(() => new vm.Script(code), String(preview)).not.toThrow();
    }
  });

  it('puts a marked button where it was asked to be (position only, from a short list)', () => {
    const a = element({ 'data-zaki-action': 'scroll-order', 'data-zaki-position': 'fixed-bottom' });
    run(false, [a]);
    expect([...a.classes]).toEqual(['zaki-fixed-bottom']);
    const b = element({ 'data-zaki-action': 'order', 'data-zaki-position': 'somewhere-else' });
    run(false, [b]);
    expect([...b.classes]).toEqual([]);
  });

  it('applies a styling attribute only when it passes its rule', () => {
    const ok = element({ 'data-zaki-action': 'order', 'data-zaki-bg': '#b8256e', 'data-zaki-radius': '12px', 'data-zaki-z-index': '50' });
    run(false, [ok]);
    expect(ok.style['background-color']).toBe('#b8256e');
    expect(ok.style['border-radius']).toBe('12px');
    expect(ok.style['z-index']).toBe('50');
  });

  it('NEGATIVE: and refuses a value that smuggles anything — a url(), a script word, a stray brace', () => {
    for (const bad of ['url(https://evil/x.png)', 'javascript:alert(1)', 'j a v a s c r i p t', 'expression(alert(1))', 'red; {}', '<>']) {
      const el = element({ 'data-zaki-action': 'order', 'data-zaki-shadow': bad, 'data-zaki-bg': bad });
      run(false, [el]);
      expect(el.style['box-shadow'], bad).toBeUndefined();
      expect(el.style['background-color'], bad).toBeUndefined();
    }
  });

  it('NEGATIVE: and a colour that is not one, a size with no unit, a z-index too long, are all ignored', () => {
    const el = element({
      'data-zaki-action': 'order',
      'data-zaki-bg': 'notacolour',
      'data-zaki-font-size': '12',
      'data-zaki-z-index': '1234567',
      'data-zaki-width': '50%%',
    });
    run(false, [el]);
    expect(el.style).toEqual(expect.not.objectContaining({ 'background-color': expect.anything() }));
    expect(el.style['font-size']).toBeUndefined();
    expect(el.style['z-index']).toBeUndefined();
    expect(el.style['width']).toBeUndefined();
  });
});
