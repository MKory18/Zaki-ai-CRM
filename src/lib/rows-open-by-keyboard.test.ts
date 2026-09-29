import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A ROW THAT OPENS SOMETHING IS A CONTROL, AND MUST SAY SO.
 *
 * The orders list is a list of `<li>` elements with an `onClick` that opens
 * the order. With no `tabIndex` the Tab key walks past every order on the
 * page; with no key handler Enter and Space do nothing; and a screen reader
 * announces «list item» with no way to activate it. The single most-used
 * action in the product could not be reached without a mouse.
 *
 * It is not caught by anything else: it renders correctly, it looks
 * correct, and every mouse test passes.
 */

const root = process.cwd();

function tsxFiles(): string[] {
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

/**
 * The opening tag of every `<li>` and every `<tr>`, whole.
 *
 * A row is only interesting if it carries an `onClick` of its own — the
 * ones that merely contain buttons are already reachable through them.
 */
function clickableRows(src: string): string[] {
  /*
   * `=>` IS NOT THE END OF A TAG.
   *
   * The first version stopped the opening tag at the first `>`, which in
   * `onKeyDown={(e) => {` is the arrow — so a row that HAD a key handler
   * was reported as having none, and the guard's first run accused the
   * very line that fixed it. The arrows are hidden before the scan and the
   * tag is read to its real end.
   */
  const masked = src.replace(/=>/g, '=\u0000');
  const out: string[] = [];
  for (const m of masked.matchAll(/<(li|tr)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (!/\bonClick=/.test(attrs)) continue;
    out.push(m[0].replace(/=\u0000/g, '=>'));
  }
  return out;
}

describe('a row you can click, you can also reach', () => {
  const rows: { file: string; tag: string }[] = [];
  for (const file of tsxFiles()) {
    for (const tag of clickableRows(code(readFileSync(join(root, file), 'utf8')))) {
      rows.push({ file, tag });
    }
  }

  it('found rows to check — a sweep over nothing proves nothing', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('and every one of them takes focus and answers a key', () => {
    const unreachable = rows
      .filter((r) => !/\btabIndex=/.test(r.tag) || !/\bonKeyDown=/.test(r.tag))
      .map((r) => `${r.file}: ${r.tag.slice(0, 60).replace(/\s+/g, ' ')}…`);
    expect(
      unreachable,
      `صفوفٌ تُفتح بالفأرة وحدَها — لا Tab ولا Enter:\n${unreachable.join('\n')}`
    ).toEqual([]);
  });

  it('and says what it is, so a reader can announce it', () => {
    // `role="button"` or `role={cond ? 'button' : undefined}` — a shared
    // row is only a control for the callers that give it something to do,
    // and a row that does nothing must NOT claim to be one.
    const unnamed = rows
      .filter((r) => !/\brole=\{?["']?button/.test(r.tag) && !/\brole=\{[^}]*'button'/.test(r.tag))
      .map((r) => r.file);
    expect(unnamed, `صفوفٌ تُفتح ولا تُعرّف نفسَها كأداة:\n${unnamed.join('\n')}`).toEqual([]);
  });
});
