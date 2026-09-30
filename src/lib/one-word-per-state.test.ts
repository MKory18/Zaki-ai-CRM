import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { STATE_LABEL_AR } from './order-state';
import { SHIPPING_STATUS_AR } from './shipping-workflow';

/**
 * ONE WORD PER STATE, ON EVERY SCREEN.
 *
 * `order-state.ts` learned this for the core state and wrote it down:
 * «There were three copies… the same order read «مسلَّم» on the orders
 * list and «تم التسليم» on its own detail view». The SHIPPING status
 * never learned it, and had six vocabularies — the shipping card, the
 * tracking screen, the courier-custody screen, `ui/Badge`, the status
 * route and `i18n`. Measured before this test existed, every one of the
 * twelve values had at least two spellings, and «delivered» had five:
 *
 *   مسلَّم · تم التسليم · سُلّم · مُسلَّم · تم التوصيل
 *
 * The last of those was on the DASHBOARD, whose counters read from
 * `i18n`, beside an orders list saying «مسلَّم» about the same parcels.
 *
 * Nobody chose that. Each screen chose once.
 */

const root = process.cwd();

describe('the two vocabularies agree where they overlap', () => {
  it('a name both axes carry has one word', () => {
    // The core state and the shipping status describe ONE parcel. A badge
    // reading «مسلَّم» above a card reading «تم التسليم» is the defect
    // whichever of the two is «right».
    for (const [name, word] of Object.entries(SHIPPING_STATUS_AR)) {
      const core = (STATE_LABEL_AR as Record<string, string>)[name];
      if (core) expect(word, `${name}: الحالةُ والشحنُ يختلفان`).toBe(core);
    }
  });

  it('and the overlap is real, not an empty coincidence', () => {
    const shared = Object.keys(SHIPPING_STATUS_AR).filter(
      (n) => n in STATE_LABEL_AR
    );
    expect(shared.length).toBeGreaterThanOrEqual(5);
  });
});

/**
 * AND NOBODY WRITES ONE OF THOSE WORDS BY HAND.
 *
 * A second copy is how the first six happened. The owners are the two
 * maps; everything else imports them.
 */
describe('no screen keeps its own copy', () => {
  /** The files allowed to contain these words as literals. */
  const OWNERS = ['src/lib/order-state.ts', 'src/lib/shipping-workflow.ts'];

  /**
   * `i18n.ts` holds the same words for the dashboard's counters and is
   * a translation table, not a screen. It is checked by VALUE below
   * instead of being forbidden the literal.
   */
  const TRANSLATIONS = 'src/lib/i18n.ts';

  /**
   * THE COURIER'S OWN WORDS ARE NOT OURS TO TIDY.
   *
   * `logestechs.ts` carries their status table, copied from their
   * documentation and matched against what their API sends back. Their
   * «تم التوصيل» is a foreign string we recognise, not a label we write,
   * and rewriting it would break the matching.
   */
  const FOREIGN = ['src/lib/couriers/logestechs.ts'];

  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p) && !p.includes('.test.')) out.push(relative(root, p).split('\\').join('/'));
      }
    };
    walk(join(root, 'src'));
    return out;
  }

  /** The spellings that were found in the wild and are no longer allowed. */
  const RETIRED: Record<string, string> = {
    'تم التسليم': 'مسلَّم',
    'تم التوصيل': 'مسلَّم',
    'سُلّم': 'مسلَّم',
    'مُسلَّم': 'مسلَّم',
    'تم الشحن': 'مشحون',
    'خارج للتوصيل': 'خرج للتوصيل',
    'تعذر التوصيل': 'فشل التوصيل',
    'تعذّر التوصيل': 'فشل التوصيل',
    'طُلب إرجاعه': 'طلب إرجاع',
    'مطلوب إرجاعه': 'طلب إرجاع',
    'مُرتجع': 'مرتجع',
  };

  const offenders: string[] = [];
  for (const file of sourceFiles()) {
    if (OWNERS.includes(file) || FOREIGN.includes(file)) continue;
    const src = readFileSync(join(root, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      /*
       * AN ACTION IS NOT A STATE.
       *
       * «تم التسليم» on a BUTTON means «record that it was delivered» —
       * a verb, and the right words for one. `labelAr` is where this
       * product puts the word on a transition button, and a rule that
       * could not tell the two apart would have renamed every action in
       * the shipping card into a noun.
       */
      if (/\blabelAr\s*:/.test(lines[i])) continue;
      for (const [retired, instead] of Object.entries(RETIRED)) {
        // Only as a quoted label — the word inside a sentence a person
        // reads («تم التسليم بنجاح») is prose, not a state's name.
        if (new RegExp(`['"\`]${retired}['"\`]`).test(lines[i])) {
          offenders.push(`${file}:${i + 1}   «${retired}» — الكلمةُ المعتمدة «${instead}»`);
        }
      }
    }
  }

  it('found files to check — a sweep over nothing proves nothing', () => {
    expect(sourceFiles().length).toBeGreaterThan(200);
  });

  it('and no retired spelling is used as a label', () => {
    expect(offenders, `تهجئةٌ متروكةٌ لحالةٍ لها كلمةٌ معتمدة:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the dashboard counters read the canonical words', () => {
    const src = readFileSync(join(root, TRANSLATIONS), 'utf8');
    // `t.DELIVERED` and `t.SHIPPED` are what the dashboard prints.
    expect(src).toMatch(/DELIVERED: 'مسلَّم'/);
    expect(src).toMatch(/SHIPPED: 'مشحون'/);
    expect(src).toMatch(/NO_ANSWER: 'لا يرد'/);
  });
});
