import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A CURRENCY'S DECIMALS BELONG TO THE CURRENCY.
 *
 * «Number format: … decimals per currency … never a mix.» The product has
 * one owner for that — the `Money` component, which takes the store's
 * currency from the shell and a `minorUnit` for anything in another. Its
 * own comment records the cleanup: «ninety-one bare `.toFixed(2)`, twenty
 * `toLocaleString()`».
 *
 * Three money screens were still deciding it themselves, all three with a
 * hard-coded THREE — right for the Jordanian dinar and wrong for what the
 * launch store actually uses. Measured on this database:
 *
 *   الأردن  JOD  minorUnit 3
 *   سوريا   USD  minorUnit 2      ← صحة بلس
 *   ليبيا   LYB  minorUnit 2
 *
 * So «سيخرج من المحفظة» printed `1250.500 USD` on the Syrian wallet, and
 * the daily closing said the difference was `0.120 USD`.
 *
 * The three payloads now send the minor unit BESIDE the currency code,
 * because a code without its decimals is half an answer.
 */

const root = process.cwd();

/**
 * The landing page and the storefront are a shopper's screens, priced from
 * the page's own offer rather than from a wallet, and they are not on this
 * audit's path yet. Written down so the number can only go down.
 */
const NOT_YET = [
  'src/components/landing/blocks/OfferCards.tsx',
  'src/components/landing/OrderForm.tsx',
];

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
  return out;
}

const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('no screen decides how many decimals money has', () => {
  const offenders: string[] = [];
  for (const file of screens()) {
    if (NOT_YET.includes(file) || file.endsWith('ui/Money.tsx')) continue;
    const lines = code(readFileSync(join(root, file), 'utf8')).split('\n');
    for (let i = 0; i < lines.length; i++) {
      // A figure printed to a person with a fixed number of decimals AND a
      // currency beside it. `.toFixed` used purely for arithmetic (rounding
      // before a comparison) is not this — it never reaches a screen.
      // `[\w.]*` and not `\w*`: the currency is almost always reached
      // through an object — `{wallet.currencyCode}` — and a matcher that
      // stopped at the dot passed a mutation that put the defect back.
      if (/\.toFixed\(\s*[0-9]\s*\)\}?\s*\{?['"\s]*\{?\s*[\w.]*[Cc]urrency/.test(lines[i])) {
        offenders.push(`${file}:${i + 1}   ${lines[i].trim().slice(0, 70)}`);
      }
    }
  }

  it('found screens to check — a sweep over nothing proves nothing', () => {
    expect(screens().length).toBeGreaterThan(80);
  });

  it('and none prints a currency with decimals of its own choosing', () => {
    expect(
      offenders,
      `خاناتٌ عشريّةٌ مكتوبةٌ بيد الشاشة بدل عملة المحفظة:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});

/**
 * AND THE MINOR UNIT REACHES THE SCREEN THAT NEEDS IT.
 *
 * Sending the code without its decimals is what made the screens invent
 * them, so the payloads are pinned too.
 */
describe('a wallet travels with its decimals', () => {
  const routes = [
    'src/app/api/finance/commission/payout/route.ts',
    'src/app/api/payroll/payslip/route.ts',
  ];

  for (const route of routes) {
    it(`${route.split('/').slice(-2)[0]} sends them`, () => {
      const src = readFileSync(join(root, route), 'utf8');
      expect(src).toMatch(/currencyCode: true, country: \{ select: \{ minorUnit: true \} \}/);
    });
  }

  it('and the daily closing sends them per wallet', () => {
    const src = readFileSync(join(root, 'src/app/api/finance/closing/route.ts'), 'utf8');
    expect(src).toMatch(/minorUnit: w\.country\.minorUnit/);
  });
});
