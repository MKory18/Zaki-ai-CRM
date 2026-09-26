import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A CURRENCY SYMBOL WRITTEN INTO A SCREEN IS ALWAYS WRONG HERE.
 *
 * Four money screens printed «$» — the dashboard, the customers list, the
 * performance screen and the product detail — and two more did it in
 * passing. The stores are Syrian, Jordanian and Libyan. So a Jordanian
 * product's cost read «$12.50» where it was 12.500 dinars, and a customer's
 * lifetime value read dollars for lira.
 *
 * That is not a styling slip. It is a wrong number on a screen somebody
 * prices from, and it survived because nothing ever said the figure had a
 * currency at all — the endpoints those screens call do not return one, so
 * the screens had nothing to print but a guess.
 *
 * `<Money>` takes the selected store's currency from the shell. This
 * refuses the guess coming back.
 */

const SELLERS = [
  '/components/landing/', '/components/public/', '/components/store/',
  '/app/(public)/', '/app/lp/', '/app/s/',
];

/**
 * Source without its comments, and with its LINE NUMBERS intact.
 *
 * The obvious stripper — deleting each block comment outright — also
 * deletes the newlines inside it, so every line number after the first
 * block comment is reported short. The offender list then points at
 * innocent lines, which is worse than no line numbers: it sends whoever
 * reads the failure to the wrong place.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');
}

/**
 * Source with every template literal blanked out, newlines kept.
 *
 * A line regex cannot tell `${x}` inside a template from a «$» typed into
 * JSX text, and the templates here NEST — a label built from another
 * label built from a third — so blanking them with one regex leaves an
 * inner `${` exposed, and the guard reports four innocent screens.
 *
 * This walks the source instead, tracking the backtick and the `${}`
 * depth, and blanks what it skips. Whatever `$` survives is a dollar
 * somebody typed.
 */
function stripTemplates(src: string): string {
  const out = src.split('');
  const blank = (i: number) => {
    if (src[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    if (src[i] !== '`') {
      i++;
      continue;
    }
    blank(i);
    i++;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        blank(i);
        blank(i + 1);
        i += 2;
        continue;
      }
      if (c === '$' && src[i + 1] === '{') depth++;
      else if (c === '}' && depth > 0) depth--;
      else if (c === '`' && depth === 0) {
        blank(i);
        i++;
        break;
      }
      blank(i);
      i++;
    }
  }
  return out.join('');
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

describe('the currency on a screen', () => {
  it('is never a symbol somebody typed', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboard()) {
      for (const [i, line] of stripTemplates(code(src)).split('\n').entries()) {
        // A dollar before a figure or before a JSX expression: «$12.50»,
        // «${total.toFixed(2)}» in text position.
        if (/\$(?=\d|\{)/.test(line)) offenders.push(`${rel}:${i + 1}`);
        // The other symbols the region uses, written out.
        else if (/[€£¥]\s*\{|ج\.م|ل\.س|د\.أ|د\.ل/.test(line)) offenders.push(`${rel}:${i + 1}`);
      }
    }
    expect(offenders, `رمزُ عملةٍ مكتوبٌ في الشاشة:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });

  /**
   * AND THE FIGURE ITSELF COMES FROM ONE PLACE.
   *
   * A ceiling, not a zero: plenty of `.toFixed(2)` in these files is a
   * percentage, a weight or an SVG coordinate, and forbidding it outright
   * would be a guard nobody could satisfy. What it does is stop the number
   * climbing back — a new screen printing money by hand has to move this
   * line to do it.
   */
  it('and the number of hand-formatted figures only goes down', () => {
    let n = 0;
    const where: string[] = [];
    for (const { rel, src } of dashboard()) {
      const hits = (code(src).match(/\.toFixed\(\s*2\s*\)/g) ?? []).length;
      if (hits) {
        n += hits;
        where.push(`${rel}: ${hits}`);
      }
    }
    // Down from 91 across the dashboard. The rest are percentages, weights
    // and SVG coordinates.
    expect(n, `أرقامٌ منسَّقةٌ باليد:\n${where.join('\n')}`).toBeLessThanOrEqual(22);
  });

  it('and the store’s currency reaches every screen without a new endpoint', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/shell/Shell.tsx'), 'utf8');
    expect(shell, 'العملة لا تصل الشاشات').toContain('StoreCurrencyProvider');
    const money = code(readFileSync(join(process.cwd(), 'src/components/ui/Money.tsx'), 'utf8'));
    expect(money, 'Money لا يقرأ عملة المتجر').toContain('useStoreCurrency');
  });

  it('and outside the shell an amount prints bare rather than guessing', () => {
    // Sign-in and the entry picker: no store has been chosen yet, so there
    // is nothing to print but the number.
    const money = code(readFileSync(join(process.cwd(), 'src/components/ui/Money.tsx'), 'utf8'));
    expect(money).toMatch(/store\?\.code\s*\?\?\s*null/);
  });
});
