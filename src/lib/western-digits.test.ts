import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * ONE SYSTEM OF DIGITS, ON EVERY SCREEN.
 *
 * The dashboard printed its money as ١٬٢٣٤٫٥ while the table beside it
 * printed 1,234.5 — on one screen, in one glance. That is not a stylistic
 * preference: a person scanning a column for a number cannot scan two
 * alphabets of numerals at once, and the barcode, the phone number and the
 * tracking reference on the same row are Latin whatever anybody prefers.
 *
 * `ar-EG` is the direct cause: it renders Arabic-Indic. Bare `ar` is worse —
 * it happens to render Latin in this build's ICU, so it is correct by luck
 * and changes with the platform. `ar-u-nu-latn` says it out loud: Arabic
 * locale, Latin numbering. The month names stay Arabic.
 *
 * THE SECOND HALF OF THIS FILE IS THE MORE IMPORTANT ONE. A sweep that
 * converts Arabic-Indic digits to Latin must not walk into a REGEX: this
 * codebase has two character classes made of those very digits — the phone
 * normaliser and the Telegram parser — and flattening either one breaks a
 * thing no screen would show. Both were broken exactly that way, and this
 * is the guard that was missing.
 */

const SKIP = [
  '/components/landing/', '/components/public/', '/components/store/',
  '/app/(public)/', '/app/lp/', '/app/s/',
];

function sources(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if ((p.endsWith('.ts') || p.endsWith('.tsx')) && !p.includes('.test.')) {
        const rel = `/${relative(process.cwd(), p).split('\\').join('/')}`;
        if (!SKIP.some((s) => rel.includes(s))) out.push({ rel, src: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  return out;
}

/** Comments are prose about the system, not output from it. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const INDIC = /[\u0660-\u0669\u06F0-\u06F9]/;

describe('the digits a person reads', () => {
  it('are never Arabic-Indic in anything the screen can show', () => {
    const offenders: string[] = [];
    for (const { rel, src } of sources()) {
      for (const [i, line] of code(src).split('\n').entries()) {
        // The two character classes that MUST keep them: they exist to
        // accept what an Arabic keyboard types and turn it into 0-9.
        if (/\[[^\]]*\u0660-\u0669/.test(line) || /\[[^\]]*\u06F0-\u06F9/.test(line)) continue;
        if (INDIC.test(line)) offenders.push(`${rel}:${i + 1}`);
      }
    }
    expect(offenders, `أرقام هندية في نصٍّ يُعرض:\n${offenders.slice(0, 15).join('\n')}`).toEqual([]);
  });

  it('and no formatter asks a locale that would produce them', () => {
    const offenders: string[] = [];
    for (const { rel, src } of sources()) {
      for (const m of code(src).matchAll(
        /(?:toLocaleString|toLocaleDateString|toLocaleTimeString|Intl\.(?:NumberFormat|DateTimeFormat))\(\s*'(ar[^']*)'/g
      )) {
        // `ar-u-nu-latn` is the one Arabic locale that states its numbering.
        if (m[1] !== 'ar-u-nu-latn') offenders.push(`${rel}: '${m[1]}'`);
      }
    }
    expect(offenders, `لغة تُخرج أرقاماً هندية:\n${offenders.join('\n')}`).toEqual([]);
  });
});

/**
 * THE GUARD ON THE SWEEP.
 */
describe('the two places that must keep Arabic-Indic digits', () => {
  it('the phone normaliser still recognises what an Arabic keyboard types', async () => {
    const { toLatinDigits } = await import('./latin-digits');
    expect(toLatinDigits('٠٧٩٠١٢٣٤٥٦')).toBe('0790123456');
    expect(toLatinDigits('۰۷۹۰')).toBe('0790');
    // And it leaves Latin alone rather than running it through the same
    // arithmetic, which is precisely how it was broken.
    expect(toLatinDigits('0790123456')).toBe('0790123456');
    expect(toLatinDigits('SY-2026-0148')).toBe('SY-2026-0148');
  });

  it('and the Telegram parser still reads a quantity typed in either system', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/telegram/parser.ts'), 'utf8');
    const m = /quantity:\s*\/([^\n]*)\//.exec(src);
    expect(m, 'اختفى نمط الكمية').toBeTruthy();
    expect(m![1], 'المحلّل لم يعد يقبل الأرقام الهندية من رسالة تيليغرام').toMatch(/\u0660-\u0669/);
    expect(m![1], 'ولا اللاتينية').toMatch(/0-9/);
  });
});

/**
 * NOTHING THAT BREAKS THE JOINING OF ARABIC LETTERS.
 *
 * The stylesheet forces `letter-spacing: 0` and `text-transform: none` on
 * Arabic, so a class added in a hurry cannot do damage. This refuses the
 * class anyway: a utility with no effect is a utility that misleads the
 * next person who reads the line and believes it.
 */
describe('Arabic text', () => {
  const ARABIC = /[؀-ۿ]/;

  it('never carries letter-spacing or uppercase', () => {
    const offenders: string[] = [];
    for (const { rel, src } of sources()) {
      for (const [i, line] of src.split('\n').entries()) {
        if (!ARABIC.test(line)) continue;
        // The English tagline is Latin and says so.
        if (line.includes('lang="en"')) continue;
        // Inside a class string only: `/api/settings/tracking-pixels/` is a
        // route, and reading it as a utility reports a file that is fine.
        for (const m of line.matchAll(/class[nN]ame=\{?[`"']([^`"']*)[`"']/g)) {
          if (/(?<![\w-])tracking-(?!normal\b)/.test(m[1]) || /(?<![\w-])uppercase(?![\w-])/.test(m[1])) {
            offenders.push(`${rel}:${i + 1}`);
          }
        }
      }
    }
    expect(offenders, `تباعدٌ أو حالةُ أحرف على نصٍّ عربي:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the stylesheet refuses both, whatever a class says', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/(system)/system.css'), 'utf8');
    expect(css).toContain('letter-spacing: 0 !important');
    expect(css).toContain('text-transform: none !important');
  });

  it('and has room to breathe — 1.6 to 1.7, not a Latin line-height', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/(system)/system.css'), 'utf8');
    const m = /html\[lang="ar"\] body \{[^}]*line-height:\s*([0-9.]+)/.exec(css);
    expect(m, 'اختفى ارتفاع السطر العربي').toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(1.6);
    expect(Number(m![1])).toBeLessThanOrEqual(1.75);
  });
});
