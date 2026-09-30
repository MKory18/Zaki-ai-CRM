import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { moneyDigits, moneyText } from './money';

/**
 * A FIGURE BESIDE A CURRENCY CODE IS MONEY, AND MONEY HAS ONE DOOR.
 *
 * `Money` / `moneyText` settled the shape and wrote why: grouped with
 * commas, padded to the currency's decimals, the code AFTER the number
 * pinned by `dir="ltr"`, `tabular-nums` so a column lines up. Its own note
 * counted what it replaced — «ninety-one bare `.toFixed(2)`, twenty
 * `toLocaleString()`».
 *
 * It did not replace the simplest form of all. TWENTY-FIVE places printed
 * the number itself next to the code:
 *
 *   {o.totalAmount} {o.currency}
 *
 * `totalAmount` is a `Float`, so that renders «1250.5 USD» — no grouping,
 * one decimal — in a product whose every other figure reads «1,250.50 USD».
 * Among them: the closing screen's book balance, the collection screen's
 * claimed gap, both transfer legs, the penalty amount, the commission
 * payout, and the two tracking dialogs where a courier's cash is counted.
 * Four of those files already imported `Money` and used it on other lines.
 *
 * WHAT IS EXEMPT, AND WHY. The landing blocks are the SHOPPER's page: they
 * render outside the shell, where `Money` has no store to take a currency
 * from — its own doc says so — and they carry their own `fmt`. A shop page
 * is not an operations screen, and that is a decision, not an oversight.
 */

const root = process.cwd();

const SHOPPER_SIDE = 'src/components/landing/';

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

/** `{expr} {…currency…}` and `{expr} USD` — a figure dressed by hand. */
const BY_HAND = [
  /\{([^{}]{1,60})\}\s*\{\s*([\w.?]*[Cc]urrency[\w.?]*)\s*\}/g,
  /\{([^{}]{1,60})\}\s+(USD|JOD|LYB)\b/g,
];

const ALREADY = /formatMoney|<Money|moneyText|money\(|toLocaleString/;

describe('every figure beside a currency comes from the one component', () => {
  const offenders: string[] = [];
  let checked = 0;

  for (const file of screens()) {
    if (file.startsWith(SHOPPER_SIDE)) continue;
    const src = code(readFileSync(join(root, file), 'utf8'));
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const re of BY_HAND) {
        re.lastIndex = 0;
        for (const m of lines[i].matchAll(re)) {
          const expr = m[1].trim();
          checked++;
          if (ALREADY.test(expr)) continue;
          // A quoted label is a word, not a figure.
          if (/^['"`]/.test(expr)) continue;
          offenders.push(`${file}:${i + 1}  {${expr}} ${m[2]}`);
        }
      }
    }
  }

  /*
   * A SWEEP THAT FINDS NOTHING HAS TO PROVE IT CAN STILL SEE.
   *
   * `checked` counts MATCHES, and once every site was fixed there were
   * none — so asserting it is greater than zero would have failed on the
   * fixed product and passed on a broken detector. What is asserted instead
   * is that the files are being read and that the patterns still recognise
   * the shape, on the very line this guard was written for.
   */
  it('reads the screens, and still recognises a hand-dressed figure', () => {
    expect(screens().length).toBeGreaterThan(150);
    expect(checked).toBeGreaterThanOrEqual(0);

    const wasReal = '  رصيد الدفاتر {r.bookBalance} {r.currencyCode}';
    const seen = BY_HAND.some((re) => {
      re.lastIndex = 0;
      return re.test(wasReal);
    });
    expect(seen, 'الفحصُ لم يعد يرى الشكلَ الذي كُتب من أجله').toBe(true);

    // …and does not mistake the fixed form for it.
    const isNow = '  رصيد الدفاتر <Money value={r.bookBalance} currency={r.currencyCode} />';
    const falsePositive = BY_HAND.some((re) => {
      re.lastIndex = 0;
      const m = re.exec(isNow);
      return !!m && !ALREADY.test(m[1]);
    });
    expect(falsePositive, 'الفحصُ يشتكي من الشكل الصحيح').toBe(false);
  });

  it('and none of them is dressed by hand', () => {
    expect(
      offenders,
      `مبلغٌ مكتوبٌ بيده بجانب رمز عملة — والبابُ الواحد <Money>:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});

describe('and the shape that door draws', () => {
  it('groups the thousands, because 1500000 and 150000 do not tell themselves apart', () => {
    expect(moneyText(1500000, 'USD', 2)).toBe('1,500,000.00 USD');
    expect(moneyText(150000, 'USD', 2)).toBe('150,000.00 USD');
  });

  it('and pads to the currency, not to a habit', () => {
    // Syria is USD/2; Jordan is JOD/3. The same figure, two countries.
    expect(moneyText(1250.5, 'USD', 2)).toBe('1,250.50 USD');
    expect(moneyText(1250.5, 'JOD', 3)).toBe('1,250.500 JOD');
  });

  it('and prints a figure bare rather than guessing a code', () => {
    // «a missing currency is a loading state, not a licence to assume dollars»
    expect(moneyText(12.5, null, 2)).toBe('12.50');
    expect(moneyText(12.5, undefined, 2)).toBe('12.50');
  });

  it('and a negative amount keeps its sign in front of the digits', () => {
    expect(moneyText(-1250.5, 'USD', 2)).toBe('-1,250.50 USD');
  });
});

describe('and an explicit code does not cost a decimal', () => {
  /*
   * `Money` resolved this inline as «a code was passed → 2», so every row
   * that carries its own `currencyCode` — most of the ones fixed above —
   * printed two decimals. On a Jordanian store that is a fils lost.
   *
   * Asked of the FUNCTION, not of the file's wording: the first version of
   * this test matched `store?.code === code` in the source, and passed a
   * mutation that turned the condition off while leaving those words there.
   */
  const SY = { code: 'USD', minorUnit: 2 };
  const JO = { code: 'JOD', minorUnit: 3 };

  it('takes the store’s decimals when the code IS the store’s', () => {
    expect(moneyDigits({ currency: 'JOD', store: JO })).toBe(3);
    expect(moneyDigits({ currency: 'USD', store: SY })).toBe(2);
  });

  it('and the store’s when no code is given at all', () => {
    expect(moneyDigits({ store: JO })).toBe(3);
  });

  it('and an explicit minorUnit always wins', () => {
    expect(moneyDigits({ minorUnit: 0, currency: 'JOD', store: JO })).toBe(0);
  });

  it('and guesses two only for a genuinely foreign code', () => {
    expect(moneyDigits({ currency: 'EUR', store: JO })).toBe(2);
  });

  it('and outside the shell, where there is no store, two', () => {
    expect(moneyDigits({})).toBe(2);
    expect(moneyDigits({ currency: null })).toBe(2);
  });

  it('and the component asks it rather than deciding again', () => {
    const src = readFileSync(join(root, 'src/components/ui/Money.tsx'), 'utf8');
    expect(src).toMatch(/const digits = moneyDigits\(\{ minorUnit, currency, store \}\)/);
  });
});
