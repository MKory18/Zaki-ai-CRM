import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { NOT_A_NUMBER, onTheWire, typedFigure, typedNumber } from './typed-box';

/**
 * ONE READING OF A BOX, NOT SEVEN COPIES OF IT.
 *
 * `numeric-input.ts` is the DOOR's reader. `typed-box.ts` is the browser's
 * half: the characters go on the wire, an empty box sends nothing at all,
 * and a live total still gets a number. Those three wants are why there are
 * three functions.
 *
 * They were written once and then copied. MEASURED before this was fixed:
 * `onTheWire` stood in **five** components as five byte-identical copies,
 * `typedNumber` and `NOT_A_NUMBER` in two more, and the string-parsing
 * `figure` in two. Fourteen definitions of three rules.
 *
 * Five copies of a rule are five places for it to drift, and two already
 * had — which is why this merged ONLY what hashed the same, and left the
 * divergent ones alone rather than quietly picking a winner. Changing one
 * of two readings while calling it de-duplication is how a defect gets a
 * clean commit message.
 *
 * WHAT IS DELIBERATELY STILL LOCAL is named below with its reason, and the
 * sweep is a WALK of the repository rather than a list of the files that
 * had copies — a list of those would have nothing to say about the seventh
 * copy somebody writes next month.
 */

/** A local definition that is NOT a copy of the shared rule, and why. */
const NOT_A_COPY: Record<string, string> = {
  'src/components/screens/finance/WalletsScreen.tsx:typedNumber':
    'بلا فحصِ isFinite عن قصد: NaN يُكتَبُ null في JSON فيَرفُضُه البابُ بالاسم، ولا يُطوى في «فارغ» فيَصيرَ صفراً صامتاً — والشرحُ مكتوبٌ فوقَها',
  'src/components/screens/ManufacturingScreen.tsx:numberOnly':
    'تَفُكُّ الرمزَ NOT_A_NUMBER ولا تَقرأُ نصّاً — وظيفةٌ أخرى تَشترِكُ بالاسمِ فقط',
  'src/lib/ai.ts:moneyLine':
    'تُنسِّقُ مبلغاً كنصٍّ للعرض — لا علاقةَ لها بقراءةِ خانة',
};

/*
 * `figure` IS STILL SWEPT FOR, although no function carries the name now.
 *
 * There were three of them doing three unrelated jobs — parse a typed
 * string, unwrap the NOT_A_NUMBER symbol, format an amount for display —
 * and a reader who learned one meaning carried it into the next file. The
 * two survivors were renamed to `numberOnly` and `moneyLine`, which say
 * what they do; the name stays in this pattern so a fourth `figure` is
 * caught the day somebody writes it.
 */
const LOCAL =
  /^(?:const NOT_A_NUMBER\b|function (?:typedNumber|onTheWire|typedFigure|figure|numberOnly|moneyLine)\b)/gm;

function localDefinitions(): string[] {
  const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
    .filter((f) => !f.includes('.test.') && !f.endsWith('src/lib/typed-box.ts'));
  const found: string[] = [];
  for (const f of files) {
    const src = readFileSync(join(process.cwd(), f), 'utf8');
    for (const m of src.match(LOCAL) ?? []) {
      const name = m.includes('NOT_A_NUMBER') ? 'NOT_A_NUMBER' : m.match(/function (\w+)/)![1];
      found.push(`${f}:${name}`);
    }
  }
  return found;
}

describe('the rule for reading a box lives in one place', () => {
  it('and the walk reaches the whole repository, not a handful', () => {
    const files = execSync('git ls-files "src/**/*.tsx"', { encoding: 'utf8' }).trim().split(/\r?\n/);
    expect(files.length).toBeGreaterThan(150);
  });

  it('so nothing redefines it locally without saying why', () => {
    const strays = localDefinitions().filter((d) => !(d in NOT_A_COPY));
    expect(
      strays,
      `نسخةٌ محلّيّةٌ من قاعدةٍ مشتركة — وحّدْها أو اكتبْ سببَ اختلافها:\n${strays.join('\n')}`
    ).toEqual([]);
  });

  it('and every stated exception is a definition that really exists', () => {
    // An excuse for a function somebody already deleted is dead policy, and
    // dead policy is what hides the next real one.
    const present = new Set(localDefinitions());
    const ghosts = Object.keys(NOT_A_COPY).filter((k) => !present.has(k));
    expect(ghosts, `سببٌ مكتوبٌ لدالّةٍ لم تعُدْ موجودة:\n${ghosts.join('\n')}`).toEqual([]);
  });
});

describe('and the shared rule behaves the way the copies did', () => {
  it('sends the characters, and nothing at all for an empty box', () => {
    expect(onTheWire('2,500')).toBe('2,500');
    expect(onTheWire('0')).toBe('0');
    expect(onTheWire('')).toBeUndefined();
    expect(onTheWire('   ')).toBeUndefined();
    // `JSON.stringify` drops the key, which is the whole point: absent is
    // the door's to interpret, never a zero this side invented.
    expect(JSON.parse(JSON.stringify({ a: 1, price: onTheWire('') }))).toEqual({ a: 1 });
  });

  it('tells «nothing typed» from «not a number», because they are not the same', () => {
    expect(typedNumber('')).toBeUndefined();
    expect(typedNumber('  ')).toBeUndefined();
    expect(typedNumber('12.5')).toBe(12.5);
    expect(typedNumber('0')).toBe(0);
    // A symbol and not NaN: NaN is a number to every expression downstream,
    // and a live total reading «NaN» cannot be told from a missing one.
    expect(typedNumber('2,500')).toBe(NOT_A_NUMBER);
    expect(typedNumber('abc')).toBe(NOT_A_NUMBER);
    expect(typedNumber('1e999')).toBe(NOT_A_NUMBER);
  });

  it('and `typedFigure` hands arithmetic a number or nothing — never a symbol', () => {
    expect(typedFigure('12.5')).toBe(12.5);
    expect(typedFigure('0')).toBe(0);
    expect(typedFigure('')).toBeUndefined();
    expect(typedFigure('abc')).toBeUndefined();
    // The widening that let two call sites share one function: an untouched
    // box and an emptied one are the same statement.
    expect(typedFigure(undefined)).toBeUndefined();
  });

  it('and a typed zero survives all three, because zero is an answer', () => {
    // The defect the whole module exists to prevent: `|| 0` turning an
    // empty box into a figure nobody typed, and a typed 0 into the same
    // thing so the door cannot tell them apart.
    expect(onTheWire('0')).toBe('0');
    expect(typedNumber('0')).toBe(0);
    expect(typedFigure('0')).toBe(0);
  });
});
