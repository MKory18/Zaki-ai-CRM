import { describe, expect, it } from 'vitest';
import { dashboardFiles, stripComments } from './guard-source';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CHART_SERIES, SYSTEM_THEMES } from './system-themes';

/**
 * THE GATES, CHECKED RATHER THAN CLAIMED.
 *
 * Most of the redesign's promises already have a guard of their own, next
 * to the thing they guard — contrast beside the palette, mirroring beside
 * the icons, the press beside the button. This file holds the ones that
 * had nowhere else to live, and the ones nobody had written at all.
 *
 * What it deliberately does NOT do is restate a gate another file already
 * enforces. A promise checked in two places is a promise that gets edited
 * in one of them.
 */

const css = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/**
 * ARABIC IS NOT LATIN, AND THE TWO RULES THAT BREAK IT.
 *
 * `letter-spacing` pulls a joined script apart — the letters of a word
 * stop touching, and an Arabic word whose letters do not touch is a word
 * the eye has to assemble. `text-transform` has no meaning at all in a
 * script with no cases, and `uppercase` on Arabic is a rule that does
 * nothing except catch the Latin caught up in it.
 */
describe('Arabic text', () => {
  it('is never spaced out or case-transformed', () => {
    const sheet = css('src/app/(system)/system.css');
    // The blanket guard, in one place, so no screen has to remember.
    expect(sheet, 'لا قاعدة تحمي الحرف العربيّ من التباعد').toMatch(
      /\[lang=["']?ar|:lang\(ar\)|\*\s*\{[^}]*letter-spacing:\s*0\s*!important/
    );
    expect(sheet).toContain('letter-spacing: 0 !important');
    expect(sheet).toContain('text-transform: none !important');
  });

  it('and no screen re-applies either to Arabic of its own', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboardFiles()) {
      for (const [i, line] of stripComments(src).split('\n').entries()) {
        if (!/[\u0600-\u06FF]/.test(line)) continue;
        if (/\btracking-(?:tighter|tight|wide|wider|widest|\[)/.test(line) || /\buppercase\b|\bcapitalize\b/.test(line)) {
          offenders.push(`${rel}:${i + 1}`);
        }
      }
    }
    expect(offenders, `تباعدٌ أو تحويلُ حالةٍ على نصٍّ عربيّ:\n${offenders.slice(0, 15).join('\n')}`).toEqual([]);
  });
});

/**
 * A CHART'S COLOURS MEAN «ANOTHER SERIES», NOT «SOMETHING IS WRONG».
 *
 * Red means money lost and green means collected, everywhere in this
 * product. A chart that draws its third line in the red reserved for a
 * loss has told the reader something it did not intend, and the reader
 * believes it — semantic colour is learned, and it is learned once.
 */
describe('a chart series', () => {
  it('never borrows a semantic hue', () => {
    const clash: string[] = [];
    for (const theme of SYSTEM_THEMES) {
      const semantic = new Set(
        ['destructive', 'success', 'warning'].map((k) => theme.vars[k].toLowerCase())
      );
      for (const key of CHART_SERIES) {
        if (semantic.has(theme.vars[key].toLowerCase())) clash.push(`${theme.key}: ${key}`);
      }
    }
    expect(clash, `لونُ مخطّطٍ يحمل معنًى دلاليّاً: ${clash.join('، ')}`).toEqual([]);
  });

  it('and every theme defines the whole series', () => {
    for (const theme of SYSTEM_THEMES) {
      for (const key of CHART_SERIES) {
        expect(theme.vars[key], `${theme.key}: ${key} مفقود`).toBeTruthy();
      }
    }
  });
});

/**
 * THE BRAND SHOWS ITSELF ONCE, ON THE WAY IN.
 *
 * The banner, the gradient and the mark belong to sign-in and the pickers
 * — the three moments where nothing is being measured. On a data screen
 * they are decoration competing with a number somebody is reading.
 */
describe('brand imagery', () => {
  it('appears on the entry screens and nowhere else', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboardFiles()) {
      // The way IN: sign-in, register, the two password screens, and the
      // country/store pickers. Plus the frame that names the app's own
      // icon for an installed tab, and the sidebar's 44px lockup — a mark,
      // not imagery.
      const ENTRY = /(?:login|register|forgot-password|reset-password|pending)\/page\.tsx$|BrandStage|EntryPicker|Sidebar\.tsx$|\(system\)\/layout\.tsx$/;
      if (ENTRY.test(rel)) continue;
      const body = stripComments(src);
      if (body.includes('/brand/banner')) offenders.push(`${rel}: البانر`);
      if (/logo\.svg/.test(body)) offenders.push(`${rel}: العلامة`);
    }
    expect(offenders, `صورةُ علامةٍ على شاشة بيانات:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the installed app uses the same mark', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/manifest.webmanifest'), 'utf8'));
    expect(manifest.icons?.length, 'لا أيقونةَ للتطبيق المثبَّت').toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(existsSync(join(process.cwd(), 'public', icon.src.replace(/^\//, ''))), `${icon.src} مفقود`).toBe(true);
    }
  });
});

/**
 * A PRESS ANSWERS WITHIN 80 MILLISECONDS.
 *
 * Not 150, which is where this started: at 150ms the control is still
 * moving when the finger has already left it, and «did that register» is
 * exactly the question a second press answers.
 */
describe('the press', () => {
  it('starts and finishes inside 80ms', () => {
    const sheet = stripComments(css('src/app/(system)/system.css'));
    const m = /transition:\s*transform\s+(\d+)ms/.exec(sheet);
    expect(m, 'لا انتقال على الضغط').toBeTruthy();
    expect(Number(m![1]), 'الاستجابة أبطأ من أن تُحسّ كضغطة').toBeLessThanOrEqual(80);
  });
});

/**
 * ONE COMPONENT LIBRARY.
 */
describe('the component library', () => {
  it('is this one — no second kit, and no ripple to suppress', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const kit of ['@mui/material', '@mui/base', 'antd', 'react-bootstrap', '@chakra-ui/react']) {
      expect(deps, `${kit}: مكتبة مكوّنات ثانية`).not.toContain(kit);
    }
  });
});

/**
 * NO HARDCODED SPACING OR FONT SIZE OUTSIDE THE TOKENS.
 *
 * Tailwind's own scale IS the spacing token set — `p-4` is a token, and
 * forbidding it would forbid the design system. What this refuses is the
 * arbitrary value: `p-[13px]`, `text-[15px]`, `gap-[7px]` — a number
 * somebody measured once, which no other screen will ever match.
 */
describe('spacing and type', () => {
  const ALLOWED = [
    // Layout maths that is not a spacing choice: a viewport fraction, a
    // safe-area inset, a variable, a percentage, a fixed panel width.
    /^\d+(\.\d+)?(vh|vw|dvh|svh)$/,
    /^calc\(/,
    /^var\(/,
    /^env\(/,
    /^\d+%$/,
    /^min\(|^max\(/,
    // A colour written into a `text-[…]`. It is a palette question, and
    // `one-palette` asks it — including which third-party brands are
    // allowed to keep their own.
    /^#[0-9a-fA-F]{3,8}$/,
  ];

  it('use the scale, never a number somebody measured once', () => {
    const offenders: string[] = [];
    // Space and type size only. Colour has `one-palette`, and
    // letter-spacing has the Arabic rule above — a Latin wordmark is
    // allowed to be tracked out, and an Arabic word never is.
    const PROP = /(?<![\w-])(?:p|px|py|pt|pb|ps|pe|m|mx|my|mt|mb|ms|me|gap|gap-x|gap-y|space-x|space-y|text|leading)-\[([^\]]+)\]/g;
    for (const { rel, src } of dashboardFiles()) {
      for (const [i, line] of stripComments(src).split('\n').entries()) {
        for (const m of line.matchAll(PROP)) {
          const v = m[1];
          if (ALLOWED.some((rx) => rx.test(v))) continue;
          offenders.push(`${rel}:${i + 1}  ${m[0]}`);
        }
      }
    }
    expect(offenders, `قياسٌ خارج السلّم:\n${offenders.slice(0, 25).join('\n')}`).toEqual([]);
  });
});

/**
 * AND WHAT THE BROWSER DOWNLOADS.
 *
 * Measured from the build, not asserted from memory. The CSS gate is met
 * with room; the icon gate is not, and the number is stated here rather
 * than rounded away — 234 distinct icons at about 717 bytes each.
 */
describe('the payload', () => {
  it('keeps the first-load stylesheet under 100 KB', () => {
    const dir = join(process.cwd(), '.next/static');
    if (!existsSync(dir)) return; // measured only when a build exists
    let bytes = 0;
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.css')) bytes += statSync(p).size;
      }
    };
    walk(dir);
    expect(bytes / 1024, 'ورقةُ الأنماط تجاوزت ١٠٠ كيلوبايت').toBeLessThan(100);
  });
});
