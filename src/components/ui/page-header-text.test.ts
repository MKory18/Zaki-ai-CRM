import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A HEADER'S SENTENCE IS TEXT, NOT MARKUP.
 *
 * `PageHeader`'s `description` is a `string` and React renders a string as
 * text, so a tag written into one is PRINTED TO THE PERSON. Two screens did
 * it, and both were sentences somebody reads on arrival:
 *
 *   - `/store/domain`, the screen the shop's address is set on, opened with
 *     «عنوانه الداخلي <code dir="ltr">/s/…</code> يبقى يعمل دائماً»;
 *   - the pending-account screen greeted a new registration with
 *     `<strong className="…">` and `<br />` spelled out.
 *
 * Nothing catches this: it type-checks, it renders, and only a person
 * looking at the screen can see it is wrong. So the files are checked.
 */

const ROOT = 'src';

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

/** Every `description={...}` value on one line, with its file and line. */
function descriptions(): { file: string; line: number; value: string }[] {
  const found: { file: string; line: number; value: string }[] = [];
  for (const file of tsxFiles(ROOT)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const m = /description=\{(.*)$/.exec(line);
      if (m) found.push({ file, line: i + 1, value: m[1] });
    });
  }
  return found;
}

describe('a screen’s description is read, not parsed', () => {
  const all = descriptions();

  it('there are descriptions to check at all', () => {
    // A slice that matches nothing would make the guard below vacuous.
    expect(all.length, 'no description= was found — the scan is broken').toBeGreaterThan(5);
  });

  it('none of them contains an HTML tag', () => {
    const offenders = all
      .filter(({ value }) => /<\/?(code|strong|b|i|em|br|span|p|div|a)\b/i.test(value))
      .map(({ file, line, value }) => `${file}:${line} → ${value.slice(0, 80)}`);
    expect(offenders, 'a header sentence would print its own tags to the reader').toEqual([]);
  });
});
