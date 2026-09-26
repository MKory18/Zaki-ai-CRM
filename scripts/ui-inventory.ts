/**
 * COUNTING WHAT IS ON THE SCREENS, SO A RESTYLE CAN BE PROVED NOT TO CHANGE IT.
 *
 * A visual migration has exactly one promise: nothing moves except how it
 * looks. No button gained, no column lost, no field quietly merged into its
 * neighbour. That promise is usually kept by a person scrolling through a
 * diff, which works until the diff is four hundred files long.
 *
 * So it is counted instead. This walks every screen and component, counts
 * the things the promise is about, and writes one number per kind per file.
 * The baseline is committed; the test beside it re-counts and compares. A
 * restyle that deletes a column fails, in the name of the file it deleted
 * it from, before anybody opens a browser.
 *
 * WHAT IT IS NOT. It is not a parser, and it does not know React. It counts
 * occurrences in source text, which is crude and exactly right for the job:
 * the question is never "how many buttons render at runtime" — that depends
 * on data and permissions — but "did this edit remove one from the source".
 *
 *   npx tsx scripts/ui-inventory.ts          # print the summary
 *   npx tsx scripts/ui-inventory.ts --write  # rewrite the baseline
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/** Where the screens live. Landing and storefront are a customer's design, not ours. */
const SCAN = ['src/components', 'src/app'];
const SKIP = ['/components/landing/', '/components/public/', '/components/store/', '/app/(public)/', '/app/lp/', '/app/s/'];

export interface Counts {
  buttons: number;
  inputs: number;
  columns: number;
  cards: number;
  modals: number;
  icons: number;
  links: number;
  tabs: number;
}

export const KINDS = ['buttons', 'inputs', 'columns', 'cards', 'modals', 'icons', 'links', 'tabs'] as const;

/**
 * The icons in use, by name, so a renamed import is not mistaken for a
 * deleted icon and an added one is not mistaken for a rename. Both families
 * are read: the dashboard is Remix, and a seller's own pages are not this
 * migration's business.
 */
const ICON_IMPORT = /import\s*\{([^}]*)\}\s*from\s*'(?:@remixicon\/react|lucide-react)'/g;

function countIcons(src: string): number {
  let total = 0;
  for (const m of src.matchAll(ICON_IMPORT)) {
    const names = m[1]
      .split(',')
      .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    for (const name of names) {
      // Every place the icon is actually drawn, not the import line.
      total += (src.match(new RegExp(`<${name}[\\s/>]`, 'g')) ?? []).length;
    }
  }
  return total;
}

function count(src: string): Counts {
  const n = (re: RegExp) => (src.match(re) ?? []).length;
  return {
    buttons: n(/<button[\s>]/g) + n(/<Button[\s>]/g),
    // A field is a field whether it is a text box, a dropdown or a tick.
    inputs: n(/<input[\s>]/g) + n(/<Input[\s>]/g) + n(/<textarea[\s>]/g) + n(/<Select[\s>]/g) + n(/<select[\s>]/g),
    // A table heading, or a column described once for `Rows` to draw twice.
    columns: n(/<th[\s>]/g) + n(/^\s*\{\s*key:\s*'/gm),
    cards: n(/<Card[\s>]/g),
    modals: n(/<Modal[\s>]/g),
    icons: countIcons(src),
    links: n(/<Link[\s>]/g),
    tabs: n(/role="tab"/g),
  };
}

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(p);
  }
  return out;
}

export function inventory(): Record<string, Counts> {
  const result: Record<string, Counts> = {};
  for (const base of SCAN) {
    for (const file of files(join(ROOT, base))) {
      const rel = relative(ROOT, file).split('\\').join('/');
      if (SKIP.some((s) => `/${rel}`.includes(s))) continue;
      const counts = count(readFileSync(file, 'utf8'));
      // A file with nothing to count is a file this promise says nothing
      // about; listing it would be noise that has to be maintained.
      if (KINDS.every((k) => counts[k] === 0)) continue;
      result[rel] = counts;
    }
  }
  return result;
}

export const BASELINE_PATH = join(ROOT, 'scripts', 'ui-inventory.json');

if (process.argv[1] && process.argv[1].includes('ui-inventory')) {
  const now = inventory();
  const totals = KINDS.reduce(
    (acc, k) => ({ ...acc, [k]: Object.values(now).reduce((s, c) => s + c[k], 0) }),
    {} as Counts
  );
  if (process.argv.includes('--write')) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(now, null, 2)}\n`, 'utf8');
    console.log(`baseline written: ${Object.keys(now).length} files`);
  }
  console.log(`${Object.keys(now).length} files`);
  for (const k of KINDS) console.log(`  ${k.padEnd(9)} ${totals[k]}`);
}
