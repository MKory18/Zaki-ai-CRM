import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * WHAT A SCREEN SAYS WHEN IT HAS NOTHING.
 *
 * «لا توجد بيانات» tells somebody standing in a warehouse exactly nothing.
 * Is the list empty because the filter is narrow, because nobody has
 * created one yet, because this account cannot see them, or because the
 * request failed? Four different situations, four different next steps,
 * one sentence covering all of them — so the sentence is useless in all
 * four.
 *
 * An empty state answers three questions: WHAT is missing, named in the
 * words of the work; WHY it is missing; and THE ONE THING that changes it.
 * Two of those are prose, and prose cannot be tested. What can be tested
 * is the sentence that answers none of them.
 */

const SELLERS = [
  '/components/landing/', '/components/public/', '/components/store/',
  '/app/(public)/', '/app/lp/', '/app/s/',
];

function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');
}

function dashboard(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.tsx') && !p.includes('.test.')) {
        const rel = `/${relative(process.cwd(), p).split('\\').join('/')}`;
        if (!SELLERS.some((s) => rel.includes(s))) out.push({ rel, src: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  return out;
}

/**
 * The sentences that answer nothing. Not a list of forbidden WORDS — «لا
 * توجد طلبات متأخرة» is a fine thing to say — but of whole messages that
 * name no subject: «بيانات», «عناصر», «نتائج», «شيء» on their own.
 */
const SAYS_NOTHING = [
  /^لا توجد بيانات\.?$/,
  /^لا بيانات\.?$/,
  /^لا توجد عناصر\.?$/,
  /^لا توجد نتائج\.?$/,
  /^لا شيء هنا\.?$/,
  /^لا يوجد شيء\.?$/,
  /^فارغ\.?$/,
  /^No data\.?$/i,
  /^Nothing here\.?$/i,
  /^Empty\.?$/i,
];

describe('an empty screen', () => {
  it('never says «لا توجد بيانات» and leaves it there', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboard()) {
      const lines = code(src).split('\n');
      for (let i = 0; i < lines.length; i++) {
        // Both shapes: words between tags, and a string literal.
        const texts = [
          ...[...lines[i].matchAll(/>([^<>{}]+)</g)].map((m) => m[1]),
          ...[...lines[i].matchAll(/'([^']+)'/g)].map((m) => m[1]),
        ].map((t) => t.trim());
        for (const t of texts) {
          if (SAYS_NOTHING.some((rx) => rx.test(t))) offenders.push(`${rel}:${i + 1}  «${t}»`);
        }
      }
    }
    expect(offenders, `رسالةُ فراغٍ لا تقول شيئاً:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the shared component asks for the reason, not just the fact', () => {
    // Comments stripped: the note explaining why there is no illustration
    // contains the word «illustration», and a guard that reads prose
    // reports prose. Fourth time this has bitten in one session.
    const src = code(readFileSync(join(process.cwd(), 'src/components/ui/EmptyState.tsx'), 'utf8'));
    expect(src, 'لا مكان للسبب').toContain('why');
    expect(src, 'لا مكان للفعل الذي يُصلحه').toContain('action');
    // No illustration. A drawing of an empty box is a drawing somebody
    // scrolls past every time a filter is narrow, and it never once told
    // them which filter.
    expect(src).not.toMatch(/<img|<svg|illustration/i);
  });

  /**
   * AND A LIST THAT IS LOADING RESERVES THE HEIGHT IT IS ABOUT TO NEED.
   *
   * «جارٍ التحميل» in one line, then twenty-five rows, moves every control
   * under it — and on a phone a thumb already travelling towards a button
   * presses whatever lands there instead.
   */
  it('and the lists people open all day draw their shape while they wait', () => {
    for (const rel of [
      'src/components/screens/OrdersScreen.tsx',
      'src/components/performance/AttributionTable.tsx',
      'src/components/performance/TeamPerformanceTable.tsx',
      'src/components/screens/PerformanceScreen.tsx',
      'src/components/screens/FinanceProfitScreen.tsx',
      'src/components/screens/LandingPagesScreen.tsx',
    ]) {
      const src = code(readFileSync(join(process.cwd(), rel), 'utf8'));
      expect(src, `${rel}: القائمة تقفز حين تصل`).toContain('SkeletonRows');
    }
  });

  it('and the shared table defaults to it rather than to a bare sentence', () => {
    const rows = code(readFileSync(join(process.cwd(), 'src/components/ui/Rows.tsx'), 'utf8'));
    expect(rows, 'الجدول المشترك يعود إلى جملةٍ عارية').toContain('<EmptyState');
  });
});
