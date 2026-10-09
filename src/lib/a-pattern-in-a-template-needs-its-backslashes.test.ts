import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { stripComments } from './guard-source';

/**
 * A REGEX BUILT IN A TEMPLATE LITERAL NEEDS ITS BACKSLASHES DOUBLED, AND
 * THE PUNISHMENT FOR FORGETTING IS A TEST THAT CANNOT FAIL.
 *
 * In a template literal, a backslash before `s`, `w`, `d`, `S`, `W` or `D`
 * is an unrecognised escape: JavaScript drops the backslash and leaves the
 * bare letter. A backslash before `b` is worse — it is a valid escape, for
 * U+0008 BACKSPACE — so the pattern compiles, runs, and matches nothing.
 *
 * MEASURED, from the one that happened. `landing-html-sanitize.test.ts`
 * had a helper whose whole job was to say «this tag is not in the output»:
 *
 *     new RegExp(`<\s*​/?\s*${tag}\b`, 'i')   →   /<s*\/?s*frameset\u0008/
 *
 * It matched nothing, so it reported «gone» for everything. Four mutations
 * in a row came back MISSED while the function was visibly still emitting
 * `<frameset></frameset>`; only then did the doubt move from the verdict
 * to the test. A guard that cannot fail is worse than no guard — it is a
 * green tick over an unprotected rule, and this one sat over an XSS strip.
 *
 * `String.raw` is the other correct form and is accepted: it keeps every
 * backslash as written, which is exactly what a pattern wants.
 *
 * THIS IS A WALK, NOT A LIST. It reads every tracked `.ts`/`.tsx` and
 * cannot go stale: a file added tomorrow is held to the same rule without
 * anyone editing this one.
 */

/** The regex class letters whose meaning a template literal destroys. */
const CLASS_LETTERS = 'bBsSwWdD';

interface Hit {
  where: string;
  letter: string;
  line: string;
}

function scan(): { scanned: number; broken: Hit[] } {
  const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx" "scripts/**/*.ts"', {
    encoding: 'utf8',
  })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  let scanned = 0;
  const broken: Hit[] = [];

  for (const file of files) {
    /*
     * COMMENTS ARE STRIPPED FIRST, and this file is why: its own
     * explanation quotes the broken pattern, so the first run reported
     * itself as the repository's only offender. A sweep that reads prose
     * is the defect `ui-inventory` already learned — «a census that counts
     * prose is worse than one that counts nothing».
     */
    const lines = stripComments(readFileSync(join(process.cwd(), file), 'utf8')).split(/\r?\n/);
    for (const [i, line] of lines.entries()) {
      const at = line.indexOf('new RegExp(');
      if (at < 0) continue;
      const rest = line.slice(at);
      const tick = rest.indexOf('`');
      // A plain string or a literal `/…/` argument is not at risk.
      if (tick < 0) continue;
      scanned++;
      // `String.raw` keeps backslashes literal — correct by construction.
      if (/String\.raw\s*`/.test(rest)) continue;

      const close = rest.indexOf('`', tick + 1);
      const body = close > tick ? rest.slice(tick + 1, close) : rest.slice(tick + 1);

      for (let n = 0; n < body.length - 1; n++) {
        if (body[n] !== '\\') continue;
        // An escaped backslash is two characters and is not the bug.
        if (body[n + 1] === '\\') {
          n++;
          continue;
        }
        if (CLASS_LETTERS.includes(body[n + 1])) {
          broken.push({ where: `${file}:${i + 1}`, letter: `\\${body[n + 1]}`, line: line.trim() });
          break;
        }
      }
    }
  }
  return { scanned, broken };
}

describe('a pattern written inside a template literal', () => {
  it('and the sweep finds a real set, not an empty one', () => {
    // A detector that matches nothing passes this file's only rule.
    // Measured at 43 on the day it was written.
    expect(scan().scanned).toBeGreaterThanOrEqual(30);
  });

  it('never leaves a single backslash before a regex class letter', () => {
    const { broken } = scan();
    expect(
      broken.map((b) => `${b.where}  ${b.letter}  ${b.line.slice(0, 90)}`),
      'نمطٌ داخلَ قالبٍ نصّيّ بشَرطةٍ مفردة — يُجمَّعُ ولا يُطابِقُ شيئاً، ' +
        'فالحارسُ المبنيُّ عليه لا يَقدِرُ أن يَسقُط. ضاعِفِ الشَرطةَ أو استعمِلْ String.raw:\n' +
        broken.map((b) => `${b.where}  ${b.letter}`).join('\n')
    ).toEqual([]);
  });

  it('and the two spellings really do differ, so the rule is not pedantry', () => {
    const tag = 'frameset';

    /*
     * WHAT A TEMPLATE LITERAL DOES TO THE ESCAPES, shown directly rather
     * than asserted. These three lines are the whole bug.
     */
    expect(`\s`).toBe('s');
    expect(`\b`).toBe('\u0008');
    expect(String.raw`\s`).toBe('\\s');

    /*
     * The broken pattern is ASSEMBLED, not written out: writing the buggy
     * template here would make this file the sweep's own first offender.
     * What the template produced is «less-than, s, star, slash, question,
     * s, star, the tag, backspace».
     */
    const broken = new RegExp('<' + 's*' + '/?' + 's*' + tag + '\u0008', 'i');
    const written = new RegExp(String.raw`<\s*/?\s*${tag}\b`, 'i');

    const output = '<frameset></frameset>';
    expect(written.test(output), 'النمط السليم لا يرى الوسم').toBe(true);
    expect(broken.test(output), 'النمط المكسور رأى شيئاً — فالمثال ليس المثال').toBe(false);
  });
});
