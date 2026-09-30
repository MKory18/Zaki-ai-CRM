import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * «EVERY CONTROL SHOWS A PRESSED STATE.»
 *
 * `system.css` already answers this, and answers it well: every `button`,
 * `[role='button']` and `summary` sinks to `scale(0.97)` in 80ms — «chosen
 * to be felt and not seen», with the note recording that 120ms «read as
 * lag» — and a `prefers-reduced-motion` block turns it off.
 *
 * So the rule is not «add a pressed state». It is: BE ONE OF THOSE THINGS.
 * A click handler on a bare `<div>` or `<img>` gets no sink, no keyboard and
 * no announcement, and no amount of CSS can reach it.
 *
 * Found that way on the product-detail screen, where the gallery's own
 * subtitle reads «اضغط للتكبير»: the large image was a `<div onClick>` and
 * each thumbnail an `<img onClick>`. The one control the words named was
 * the one control that answered nothing. `Card` also took an `onClick` and
 * put it on a div — nothing passed it, so it was a dead capability, and it
 * is gone rather than waiting for a caller.
 *
 * The rows were fixed before this, in `rows-open-by-keyboard`; images and
 * cards were not covered by it.
 */

const root = process.cwd();

function screens(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(relative(root, p).split('\\').join('/'));
    }
  };
  walk(join(root, 'src', 'components'));
  walk(join(root, 'src', 'app'));
  return out;
}

const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Tags the browser already makes pressable, or that CSS reaches. */
const PRESSABLE = new Set(['button', 'summary', 'a', 'input', 'select', 'textarea', 'option', 'label']);

describe('nothing is clickable that cannot be pressed', () => {
  const offenders: string[] = [];
  let clicks = 0;

  for (const file of screens()) {
    // `=>` masked, or the tag matcher stops at the arrow — the trap this
    // repo has now hit three times.
    const src = code(readFileSync(join(root, file), 'utf8')).split('=>').join('\u0000\u0000');
    for (const m of src.matchAll(/<([a-z][\w-]*)((?:[^<>]|\u0000\u0000)*?)\/?>/g)) {
      const tag = m[1];
      const attrs = m[2] ?? '';
      if (!/\bonClick=/.test(attrs)) continue;
      clicks++;
      if (PRESSABLE.has(tag)) continue;
      if (/role=['"]button['"]|role=\{/.test(attrs)) continue;
      /*
       * A FULL-BLEED OVERLAY IS A DISMISS REGION, NOT A CONTROL.
       *
       * `inset-0` on a fixed or absolute layer is the click-away behind a
       * dialog, a drawer or the command palette. It has no label and wants
       * none: the thing it dismisses has its own close button. Matched by
       * its shape rather than by a list of files, so a new dialog's scrim
       * does not have to be added here.
       */
      if (/inset-0/.test(attrs)) continue;
      // `onClick={(e) => e.stopPropagation()}` is a shield over a row, not
      // a control of its own.
      if (/stopPropagation/.test(attrs) && !/tabIndex|onKeyDown/.test(attrs)) continue;

      const line = src.slice(0, m.index!).split('\n').length;
      offenders.push(`${file}:${line}  <${tag} …onClick…>`);
    }
  }

  it('found clicks to check — a sweep over nothing proves nothing', () => {
    expect(screens().length).toBeGreaterThan(150);
    expect(clicks).toBeGreaterThan(50);
  });

  it('and every one of them is on something that answers', () => {
    expect(
      offenders,
      `نقرةٌ على ما لا يُجيب الضغط — ولا لوحةَ مفاتيح تصله:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});

describe('and the pressed state itself', () => {
  const css = readFileSync(join(root, 'src/app/(system)/system.css'), 'utf8');

  it('reaches every button, role=button and summary', () => {
    expect(css).toMatch(/button:not\(:disabled\):active,\s*\[role='button'\]:not\(\[aria-disabled='true'\]\):active,\s*summary:active \{\s*transform: scale\(0\.97\)/);
  });

  it('and is turned off for someone who asked for less motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/:active,[\s\S]{0,160}transform: none/);
  });

  it('and a card is a surface, with no click of its own', () => {
    // `code()`, not the raw file: the note explaining WHY the prop went
    // names it, and a guard that reads its own prose is the trap this repo
    // has now recorded five times.
    const card = code(readFileSync(join(root, 'src/components/ui/Card.tsx'), 'utf8'));
    expect(card, 'عاد الكرتُ يأخذ onClick على div').not.toMatch(/onClick/);
  });
});
