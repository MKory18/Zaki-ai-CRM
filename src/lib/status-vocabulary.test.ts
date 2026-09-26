import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CORE_STATES, STATE_LABEL_AR, STATE_TONE } from './order-state';

/**
 * ONE WORD PER STATE, ON EVERY SCREEN.
 *
 * There were three sayings of it: `order-state.ts`, a second map inside the
 * orders badge with its own colours, and a third in `ui/Badge` keyed on the
 * legacy `status` column. The first two had drifted — six of the sixteen
 * states were spelled differently — so the same order read «مسلَّم» on the
 * list and «تم التسليم» on its own page, «قيد التحويل» in one place and
 * «نقل بين شركات» in another.
 *
 * Nobody chose that. Each screen chose once, and the choices never met.
 */

const SELLERS = [
  '/components/landing/', '/components/public/', '/components/store/',
  '/app/(public)/', '/app/lp/', '/app/s/',
];

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function dashboard(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if ((p.endsWith('.ts') || p.endsWith('.tsx')) && !p.includes('.test.')) {
        const rel = `/${relative(process.cwd(), p).split('\\').join('/')}`;
        if (!SELLERS.some((s) => rel.includes(s))) out.push({ rel, src: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  return out;
}

describe('the vocabulary', () => {
  it('names every state, and names each of them once', () => {
    for (const state of CORE_STATES) {
      expect(STATE_LABEL_AR[state]?.trim(), `${state}: بلا كلمة`).toBeTruthy();
      expect(STATE_TONE[state], `${state}: بلا لون`).toBeTruthy();
    }
    const words = CORE_STATES.map((s) => STATE_LABEL_AR[s]);
    expect(new Set(words).size, 'حالتان بالكلمة نفسها').toBe(words.length);
  });

  it('and no screen keeps a second copy of it', () => {
    // A `Record<CoreState, …>` outside order-state.ts that carries Arabic is
    // the exact shape the drift took last time.
    const offenders: string[] = [];
    for (const { rel, src } of dashboard()) {
      if (rel.endsWith('/src/lib/order-state.ts')) continue;
      for (const m of code(src).matchAll(/Record<\s*CoreState\s*,([\s\S]{0,600}?)\}/g)) {
        if (/[\u0600-\u06FF]/.test(m[1])) offenders.push(rel);
      }
    }
    expect([...new Set(offenders)], `نسخةٌ ثانية من كلمات الحالات:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the chip that draws it takes both halves from there', () => {
    // Comments stripped, and the LOOKUP asserted rather than the name: a
    // chip that imports `STATE_LABEL_AR` and then hardcodes «تم التسليم»
    // still imports it.
    const chip = code(readFileSync(join(process.cwd(), 'src/components/ui/StatusChip.tsx'), 'utf8'));
    expect(chip, 'الشريحة لا تقرأ الكلمة من مصدرها').toMatch(/STATE_LABEL_AR\[/);
    expect(chip, 'الشريحة لا تقرأ اللون من مصدره').toMatch(/STATE_TONE\[/);

    // And it writes none of the words itself. The two cancellation phrases
    // are its own — they are the split it exists to make.
    const OWN = ['ملغى قبل الشحن', 'ملغى بعد الشحن'];
    const strings = [...chip.matchAll(/'([^']*[؀-ۿ][^']*)'/g)].map((m) => m[1]);
    const stolen = strings.filter(
      (t) => !OWN.includes(t) && CORE_STATES.some((s) => STATE_LABEL_AR[s] === t)
    );
    expect(stolen, `كلمةُ حالةٍ مكتوبةٌ داخل الشريحة: ${stolen.join('، ')}`).toEqual([]);
  });

  it('and «ملغى» is spelled the same wherever it is written', () => {
    // It is the passive participle. «ملغي» was a slip, and it was on the
    // most-read chip in the product.
    const wrong: string[] = [];
    for (const { rel, src } of dashboard()) {
      if (/'ملغي'|"ملغي"|>ملغي</.test(code(src))) wrong.push(rel);
    }
    expect(wrong, `إملاءٌ ثانٍ للكلمة نفسها:\n${wrong.join('\n')}`).toEqual([]);
  });
});

/**
 * AND FOUR TONES, EVERY ONE OF THEM A TOKEN.
 *
 * The old badge carried `border-blue-100` and `border-purple-100`: raw
 * palette steps that belong to no theme, so they stayed the same pale blue
 * whichever of the three somebody chose.
 */
describe('the colours a chip is allowed', () => {
  it('are four, and there is no informational blue among them', () => {
    const tones = new Set(CORE_STATES.map((s) => STATE_TONE[s]));
    expect([...tones].sort()).toEqual(['bad', 'good', 'neutral', 'warn']);
  });

  it('and the chip writes no colour of its own', () => {
    // Comments stripped first: the note explaining WHICH raw classes were
    // removed contains those classes, and a guard that reads prose reports
    // prose.
    const chip = code(readFileSync(join(process.cwd(), 'src/components/ui/StatusChip.tsx'), 'utf8'));
    const raw = chip.match(/(?:bg|text|border|ring)-(?:blue|purple|slate|gray|grey|emerald|rose|amber|green|red|indigo|teal|cyan|sky)-\d{2,3}/g);
    expect(raw ?? [], `لونٌ خارج الثيم في الشريحة: ${(raw ?? []).join('، ')}`).toEqual([]);
    expect(chip.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  it('and every state chip in the product goes through it', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboard()) {
      if (rel.includes('/ui/StatusChip.tsx') || rel.includes('/ui/Badge.tsx')) continue;
      // A span that carries a state word AND its own pill classes is a chip
      // somebody drew again rather than imported.
      // The shape the drift takes: the shared WORD, wrapped in a pill this
      // file drew itself. Not "the file mentions both somewhere" — a
      // `<select>` listing every state name is not a chip.
      const PILL = /<span[^>]*className=["'`]([^"'`]*)["'`][^>]*>\{?\s*(?:state\b|STATE_LABEL_AR\[)/g;
      for (const m of code(src).matchAll(PILL)) {
        if (/rounded-(?:sm|md|lg|full)/.test(m[1]) && /(?:text-xs|px-2)/.test(m[1])) {
          offenders.push(rel);
          break;
        }
      }
    }
    expect([...new Set(offenders)], `شريحةُ حالةٍ مرسومةٌ باليد:\n${offenders.join('\n')}`).toEqual([]);
  });
});
