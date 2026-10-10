import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from './guard-source';

/**
 * AN ORDER WITHOUT LINES IS THE ONE SHAPE THIS PRODUCT CANNOT PRICE.
 *
 * `computeCod` has nothing to total. Settlement reconstructs the delivered
 * goods from the lines, so a courier's figure can never be checked against
 * it. The reservation lives per line, so nothing was taken off a shelf for
 * it either — the units are still on sale. It is not a row with a missing
 * field; it is a row that every money rule in the repository reads as zero.
 *
 * `ai-intake` was the last door that could still make one: four separate
 * statements, and a failure between the first two left exactly that. It is
 * one transaction now.
 *
 * MEASURED ON THE LIVE DATA BEFORE THE FIX: 0 of 56 orders are lineless, so
 * this closes the way in rather than cleaning up after it. That is the good
 * case to fix — the one where nothing has gone wrong yet.
 *
 * THE GUARD IS A WALK, NOT A LIST. It finds every `order.create` in `src`
 * and holds each one to the rule, because the six doors that exist today
 * are not the six that will exist, and the version of this rule that names
 * files is the version that misses the seventh.
 */

const root = process.cwd();

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p) && !p.includes('.test.')) {
        out.push(relative(root, p).split('\\').join('/'));
      }
    }
  };
  walk(join(root, 'src'));
  return out;
}

/**
 * `order.create(` but not `orderItem.create(`, `orderActivity.create(` and
 * the rest of the family — the boundary before `order` must not be a word
 * character, and what follows `order` must be the dot.
 */
const CREATE = /(?<![A-Za-z0-9_])(\w+)\.order\.create\(/g;

interface Door {
  file: string;
  /** The identifier the call was made on: `db` or a transaction client. */
  client: string;
  line: number;
}

function doors(): Door[] {
  const found: Door[] = [];
  for (const file of sourceFiles()) {
    const src = stripComments(readFileSync(join(root, file), 'utf8'));
    for (const m of src.matchAll(CREATE)) {
      found.push({ file, client: m[1], line: src.slice(0, m.index).split('\n').length });
    }
  }
  return found;
}

describe('every door that creates an order', () => {
  const found = doors();

  it('is found by the sweep — six of them when this was written', () => {
    /*
     * A floor, not an equality. A seventh door is allowed; a sweep that has
     * stopped finding any is not, and that is the failure this catches —
     * a rename of `order.create` would otherwise empty the list and every
     * test below would pass over nothing.
     */
    expect(found.length, 'لا بابَ يُنشئُ طلباً — المسحُ عمي').toBeGreaterThanOrEqual(6);
  });

  it('writes it on a TRANSACTION client, never on `db` directly', () => {
    /*
     * `db.order.create` cannot be in a transaction with the line that
     * follows it, whatever the surrounding code looks like. This is the one
     * check that actually decides whether a lineless order is reachable.
     */
    const loose = found.filter((d) => d.client === 'db').map((d) => `${d.file}:${d.line}`);
    expect(
      loose,
      `طلبٌ يُكتبُ خارجَ معاملةٍ — سطورُه قد لا تُكتبُ معه:\n${loose.join('\n')}`
    ).toEqual([]);
  });

  it('and the file it lives in opens a transaction at all', () => {
    // A `tx.` that came from a function argument rather than from
    // `$transaction` would pass the check above while being no transaction
    // at all. Every door either opens one or is handed one by a caller that
    // does — and the two libraries that are handed one say so in their
    // signature.
    const offenders: string[] = [];
    for (const file of new Set(found.map((d) => d.file))) {
      const src = stripComments(readFileSync(join(root, file), 'utf8'));
      const opens = src.includes('$transaction');
      const handed = /\btx:\s*(?:Prisma\.)?(?:TransactionClient|Tx)\b|\btx: Tx\b/.test(src);
      if (!opens && !handed) offenders.push(file);
    }
    expect(
      offenders,
      `ملفٌّ يُنشئُ طلباً ولا يَفتحُ معاملةً ولا يُسلَّمُ واحدةً:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('and writes the order’s line on that same client', () => {
    const offenders: string[] = [];
    for (const d of new Set(found.map((f) => f.file))) {
      const src = stripComments(readFileSync(join(root, d), 'utf8'));
      // `createMany` for the multi-line doors, `create` for the single-line
      // ones. Either way it must be on a client, not on `db`.
      const onClient = /(?<![A-Za-z0-9_])(?!db\b)\w+\.orderItem\.create(?:Many)?\(/.test(src);
      const onDb = /(?<![A-Za-z0-9_])db\.orderItem\.create(?:Many)?\(/.test(src);
      if (!onClient || onDb) offenders.push(`${d}${onDb ? '  (على db)' : '  (لا سطور)'}`);
    }
    expect(
      offenders,
      `بابٌ يُنشئُ طلباً ولا يَكتبُ سطرَه في المعاملةِ نفسِها:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});

describe('and the order number retries instead of failing in somebody’s face', () => {
  /**
   * `nextOrderNumber` takes an `attempt` precisely so a retry asks for the
   * NEXT number rather than the same one again. A door that passes no
   * attempt, or a constant, cannot retry: two orders created in the same
   * second race for one number and the loser gets a P2002 handed to the
   * person who was typing.
   *
   * `ai-intake` was `orderRefFields(db, companyId, prefix)` — no attempt, no
   * loop, and on `db` rather than on `tx`, all three at once.
   */
  const callers = (() => {
    const out: { file: string; args: string; line: number }[] = [];
    for (const file of sourceFiles()) {
      if (file === 'src/lib/order-ref.ts') continue; // the definition
      const src = stripComments(readFileSync(join(root, file), 'utf8'));
      for (const m of src.matchAll(/orderRefFields\(([^)]*)\)/g)) {
        out.push({ file, args: m[1], line: src.slice(0, m.index).split('\n').length });
      }
    }
    return out;
  })();

  it('finds the callers', () => {
    expect(callers.length, 'لا مستدعيَ لمولِّدِ الرقم').toBeGreaterThanOrEqual(5);
  });

  it('and every one of them asks on the transaction client', () => {
    const loose = callers.filter((c) => /^\s*db\s*,/.test(c.args)).map((c) => `${c.file}:${c.line}`);
    expect(
      loose,
      `الرقمُ يُحجَزُ خارجَ المعاملةِ التي تَكتبُ الطلب:\n${loose.join('\n')}`
    ).toEqual([]);
  });

  it('and passes an attempt rather than nothing', () => {
    // Four arguments or more: (tx, companyId, prefix, attempt[, now]).
    const short = callers
      .filter((c) => c.args.split(',').length < 4)
      .map((c) => `${c.file}:${c.line}  (${c.args.split(',').length} وسائط)`);
    expect(
      short,
      `مولِّدُ الرقمِ بلا محاولةٍ — لا إعادةَ عندَ التسابق:\n${short.join('\n')}`
    ).toEqual([]);
  });

  it('and the attempt is a VARIABLE, because a constant cannot retry', () => {
    /*
     * THE FIRST VERSION OF THIS SECTION COUNTED ARGUMENTS AND WAS HAPPY
     * WITH `0`.
     *
     * `winback` passed the literal `0` and caught no P2002 at all, so the
     * four-argument check waved through a door that asked for the same
     * number forever. AN ARGUMENT IS NOT AN ATTEMPT. The walk found the
     * call; reading the one call it had waved through found the defect —
     * the ninth time in this repository that a check on a NAME or a SHAPE
     * was satisfied by something that did not do the job.
     */
    const frozen = callers
      .filter((c) => /,\s*\d+\s*(?:,|$)/.test(c.args))
      .map((c) => `${c.file}:${c.line}  (${c.args.trim()})`);
    expect(
      frozen,
      `محاولةٌ ثابتةٌ — تَطلبُ الرقمَ نفسَه إلى الأبد:\n${frozen.join('\n')}`
    ).toEqual([]);
  });

  it('and the file that asks for a number can catch the collision', () => {
    /*
     * Either the file loops on P2002 itself, or it is handed the attempt by
     * a caller that does — `replacement-order.ts` takes `plan.attempt` and
     * both its callers loop. A file with neither cannot retry whatever it
     * passes.
     */
    const helpless: string[] = [];
    for (const file of new Set(callers.map((c) => c.file))) {
      const src = stripComments(readFileSync(join(root, file), 'utf8'));
      const loops = /P2002/.test(src) && /continue/.test(src);
      const handed = /attempt:\s*number/.test(src);
      if (!loops && !handed) helpless.push(file);
    }
    expect(
      helpless,
      `بابٌ يَطلبُ رقماً ولا يَقدرُ أن يُعيدَ المحاولة:\n${helpless.join('\n')}`
    ).toEqual([]);
  });
});

describe('and the opening row of the state history — which only ONE door may write', () => {
  /**
   * THIS SECTION ASKED FOR SOMETHING THE REPOSITORY FORBIDS, AND WAS WRONG.
   *
   * `POST /orders` writes `orderStatusLog` with `previousValue: null` when
   * it creates an order. `ai-intake` does not, and the landing door does
   * not. That reads like one door being tidy and two being careless, and
   * the first version of this test demanded all three.
   *
   * NEITHER OMISSION IS CARELESSNESS, and they are not even the same
   * reason:
   *
   *   · `ai-intake` ASKS A LANGUAGE MODEL in its other mode, and
   *     `ai-proposal-only.test.ts` holds `orderStatusLog` in its NEVER set
   *     — «ممنوع على أيّ ملفٍ يسأل نموذجاً، بلا استثناء». The rule is that
   *     the file which talks to a model is not the file that writes an
   *     order's state history. The write was added here and that guard
   *     refused it the same minute, which is the hard stop working.
   *
   *   · the LANDING door cannot write one at all:
   *     `OrderStatusLog.changedById` is NOT NULL with a `Restrict`
   *     relation to `User`, and a landing order's visitor is anonymous.
   *     MEASURED: 23 of the 56 live orders therefore have no status-log
   *     row. Giving them one needs a nullable column or a system user, and
   *     both are the owner's call.
   *
   * AND NOTHING IS BROKEN BY EITHER. Measured across every reader of
   * `orderStatusLog`: each one looks for a named TRANSITION
   * (`DEAD_CONFIRMATION`, `SHIPPING`), never for the opening row. The
   * creation is recorded for all three doors in `orderActivity`.
   *
   * So the rule this pins is the narrow true one: the door that may write
   * it, does — and the two that may not, do not.
   */
  const MAY_WRITE_IT = 'src/app/api/orders/route.ts';
  const MUST_NOT = {
    'src/app/api/orders/ai-intake/route.ts': 'يسأل نموذجاً لغويّاً',
    'src/lib/public-order.ts': 'زائرٌ مجهولٌ بلا مستخدمٍ يُنسَبُ إليه',
  };

  it('the one door that may write it, writes it as an opening row', () => {
    const src = stripComments(readFileSync(join(root, MAY_WRITE_IT), 'utf8'));
    expect(src, 'البابُ الذي يَجوزُ له لا يَكتبُه').toMatch(/\w+\.orderStatusLog\.create\(/);
    expect(src, '`previousValue: null` هو «بدأَ هنا»').toMatch(/previousValue: null/);
  });

  it('and the two that may not, do not — each for its own reason', () => {
    const offenders: string[] = [];
    for (const [file, why] of Object.entries(MUST_NOT)) {
      const src = stripComments(readFileSync(join(root, file), 'utf8'));
      if (/\w+\.orderStatusLog\.create\(/.test(src)) offenders.push(`${file}  (${why})`);
    }
    expect(
      offenders,
      `بابٌ يَكتبُ تاريخَ الحالةِ ولا يَجوزُ له:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('and all three named files really are order doors, so the list cannot rot', () => {
    const files = new Set(doors().map((d) => d.file));
    for (const f of [MAY_WRITE_IT, ...Object.keys(MUST_NOT)]) {
      expect(files.has(f), `${f}: مذكورٌ هنا ولم يَعُدْ يُنشئُ طلباً`).toBe(true);
    }
  });

  it('and the hard stop that refused the write is still a hard stop', () => {
    // If `orderStatusLog` ever leaves that NEVER set, the reasoning above
    // stops being true and this section should be revisited rather than
    // quietly keep passing.
    const guard = readFileSync(join(root, 'src/lib/ai-proposal-only.test.ts'), 'utf8');
    expect(guard, 'سقطَ المنعُ المطلقُ عن سجلِّ حالةِ الطلب').toContain("'orderStatusLog',");
  });
});
