import { describe, expect, it } from 'vitest';
import { dashboardFiles, repoFile, stripComments } from './guard-source';

/**
 * A THUMB IS 44 PIXELS, AND A BUTTON MUST SAY WHAT IT DOES.
 *
 * Both of these were measured in a real browser at 360px rather than
 * reasoned about, and the measuring is what found them: seventeen targets
 * under 44px on the dashboard alone, and thirty-nine icon buttons that a
 * screen reader announced as «زر» and nothing more.
 *
 * WHAT THIS FILE CANNOT CHECK is whether a target is REACHED — that needs a
 * layout, so it needs a browser. What it can check is that the shapes which
 * were fixed stay fixed, and that the next hand-written control does not
 * quietly reintroduce the same three mistakes.
 */

/** A height under 44px, stated with no `md:` twin to say it is the desk's. */
const SHORT = /(?<![\w:-])h-([789]|10)(?![\d.])/;
const TALL = /(?<![\w-])(?:h-11|h-12|h-14|h-16|min-h-11|h-\[4[4-9]px\])/;

/**
 * THE OPENING TAG, WITHOUT TRIPPING OVER AN ARROW FUNCTION.
 *
 * `onClick={() => f(x)}` contains a `>`, so "up to the first `>`" finds the
 * wrong end of the tag and reads the NEXT element's classes. Braces are
 * counted two deep, which covers every handler in this codebase.
 */
const OPENING = /<(?:button|input|select|summary)\b(?:[^<>{}]|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*\/?>/g;

function classesOf(tag: string): string {
  const quoted = /className="([^"]*)"/.exec(tag);
  if (quoted) return quoted[1];
  const tpl = /className=\{`([^`$]*)/.exec(tag);
  return tpl ? tpl[1] : '';
}

describe('a control on a phone', () => {
  it('states a height a thumb can hit, or says which height is the desk’s', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboardFiles()) {
      const body = stripComments(src);
      for (const m of body.matchAll(OPENING)) {
        const cls = classesOf(m[0]);
        if (!cls || TALL.test(cls)) continue;
        const short = SHORT.exec(cls);
        // `md:h-8` alone is fine — that IS the desk's height, and the phone
        // takes the height stated before it.
        if (short && !/md:h-/.test(cls)) {
          const line = body.slice(0, m.index).split('\n').length;
          offenders.push(`${rel}:${line}  ${short[0]}`);
        }
      }
    }
    expect(
      offenders,
      `ارتفاعٌ دون ٤٤ بلا توأمٍ للمكتب (${offenders.length}):\n${offenders.slice(0, 18).join('\n')}`
    ).toEqual([]);
  });

  it('and the two shared components state both heights in one place', () => {
    const button = repoFile('src/components/ui/Button.tsx');
    expect(button).toMatch(/sm:\s*'h-11 md:h-8/);
    expect(button).toMatch(/md:\s*'h-11 md:h-10/);
    const field = repoFile('src/components/ui/Input.tsx');
    expect((field.match(/'h-11 md:h-10 w-full/g) ?? []).length).toBe(2);
  });
});

/**
 * AND THE TRICK THAT DOES NOT WORK ON A CHECKBOX.
 *
 * `.tap-safe` grows a control's hit area with a pseudo-element. A checkbox,
 * a radio and an `<input>` are REPLACED elements: `::before` and `::after`
 * never render on them, so the class is inert there. Twenty-three of them
 * carried it and looked compliant.
 *
 * Reaching 44px around a checkbox takes the <label> wrapper that `Rows`
 * uses — pressing a label toggles the input inside it.
 */
describe('the expanded hit area', () => {
  it('is never asked of an element that cannot draw one', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboardFiles()) {
      const body = stripComments(src);
      for (const m of body.matchAll(/<input\b(?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\/?>/g)) {
        if (m[0].includes('tap-safe')) {
          offenders.push(`${rel}:${body.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(offenders, `tap-safe على عنصرٍ مستبدَل — لا يرسم شيئاً:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the shared table wraps its checkbox in a label instead', () => {
    const rows = repoFile('src/components/ui/Rows.tsx');
    expect(rows, 'لا مساحةَ لمسٍ حول مربّع الاختيار').toMatch(/<label[\s\S]{0,140}h-11 w-11/);
    // And the box says what it selects.
    expect(rows).toContain('اختر السجل');
  });
});

/**
 * AN ICON-ONLY BUTTON HAS A NAME AND A TOOLTIP.
 *
 * The name is for anyone who cannot see that the glyph is a bin; the
 * tooltip is for a mouse that does not recognise it either. `title` alone
 * is not a reliable accessible name — some readers announce it, some
 * ignore it, and none of them should have to guess.
 */
describe('an icon-only button', () => {
  it('carries an aria-label wherever it carries a tooltip', () => {
    const offenders: string[] = [];
    const EL = /(<button\b(?:[^<>{}]|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*>)([\s\S]*?)<\/button>/g;
    const ICON = /<(?:Ri\w+|\w*Icon)\b[^>]*\/?>|<\/\w+>/g;
    const WORD = /[؀-ۿ]{2,}|\b[A-Za-z]{3,}\b/g;
    const NOISE = new Set(['className', 'aria', 'hidden', 'true', 'false', 'span',
      'busy', 'saving', 'loading', 'null', 'undefined']);
    for (const { rel, src } of dashboardFiles()) {
      const body = stripComments(src);
      for (const m of body.matchAll(EL)) {
        const [, tag, inner] = m;
        if (!/title="/.test(tag) || /aria-label/.test(tag)) continue;
        const words = (inner.replace(ICON, ' ').match(WORD) ?? []).filter((w) => !NOISE.has(w));
        if (words.length === 0) {
          offenders.push(`${rel}:${body.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(
      offenders,
      `زرُّ أيقونةٍ بتلميحٍ وبلا اسمٍ يُقرأ (${offenders.length}):\n${offenders.slice(0, 15).join('\n')}`
    ).toEqual([]);
  });

  it('and the shared button makes a tooltip the name, so nobody has to remember', () => {
    const src = repoFile('src/components/ui/Button.tsx');
    expect(src).toContain('aria-label={named}');
    // Only when the button has no words of its own, and never over a name
    // the caller gave on purpose.
    expect(src).toMatch(/wordless/);
    expect(src).toMatch(/props\['aria-label'\]\s*\?\?/);
  });
});
