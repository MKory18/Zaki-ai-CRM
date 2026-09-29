import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A CONTROL SOMEBODY DELETED AND LEFT THE WIRING OF.
 *
 * «DEAD means: the control exists and does nothing… Dead controls are the
 * most common defect in a system built in stages.» The sibling case is
 * worse, because nothing on the screen shows it at all: the control is
 * gone and everything behind it is still there, still running.
 *
 * The orders list had two. A «كل المودريتورز» dropdown was removed with
 * the eleven-column table on 2026-09-21; its state stayed, permanently
 * `'all'`, sent with every request and every export — and the screen went
 * on fetching `/api/moderators` on every page load to fill a list nothing
 * rendered. A `queue` filter the same. Two others were declared and never
 * read at all.
 *
 * `const [x, setX] = useState(…)` where `setX` is never called is the
 * mechanical shape of that, and the whole product is swept for it.
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
  walk(join(root, 'src', 'app'));
  return out;
}

/** Comments blanked, so prose naming a setter is not a call of it. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('no screen carries state that nothing can change', () => {
  const files = tsxFiles();
  const dead: string[] = [];
  let declarations = 0;

  for (const file of files) {
    const src = code(readFileSync(join(root, file), 'utf8'));
    for (const m of src.matchAll(/const \[(\w+), (set\w+)\][^=]*=\s*useState/g)) {
      declarations++;
      const [, name, setter] = m;
      const calls = [...src.matchAll(new RegExp('\\b' + setter + '\\s*\\(', 'g'))].length;
      // Handed to a child as a prop is a way of being called, and the
      // declaration itself is the one mention that is neither.
      const passed = [...src.matchAll(new RegExp('\\b' + setter + '\\b(?!\\s*\\()', 'g'))].length;
      if (calls === 0 && passed <= 1) dead.push(`${name}  ←  ${file}`);
    }
  }

  it('found state to check — a sweep over nothing proves nothing', () => {
    // The vacuous pass this repo has been bitten by: an empty file list, a
    // regex that matched nothing, and a green test.
    expect(files.length).toBeGreaterThan(80);
    expect(declarations).toBeGreaterThan(300);
  });

  it('and none of it is unreachable', () => {
    expect(
      dead,
      `حالةٌ لا يغيّرها شيء — أداةٌ حُذفت وبقيت أسلاكُها:\n${dead.join('\n')}`
    ).toEqual([]);
  });
});
