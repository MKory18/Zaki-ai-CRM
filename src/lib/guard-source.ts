import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * HOW A GUARD READS THIS CODEBASE.
 *
 * Nine guards had each written these same three helpers, and the bugs that
 * cost the most hours in this redesign were all bugs in a COPY of one of
 * them — a guard reading its own prose, a stripper that ate newlines and
 * then blamed an innocent file, a regex that could not tell `${x}` from a
 * `$` typed into JSX. Fixing those in one copy fixed them in one guard.
 *
 * So they live here, once. This is not application code: nothing ships it,
 * and it exists so that a rule is enforced the same way wherever it is
 * asked.
 */

/**
 * THE SELLER'S SIDE OF THE PRODUCT, WHICH IS NOT THIS DESIGN SYSTEM.
 *
 * A seller's landing page and storefront are the seller's own brand —
 * their colours, their fonts, their spacing. Every rule in these guards is
 * a rule about the DASHBOARD, and applying it to a seller's page would be
 * this system overwriting somebody else's design.
 */
export const SELLER_SURFACES = [
  '/components/landing/',
  '/components/public/',
  '/components/store/',
  '/app/(public)/',
  '/app/lp/',
  '/app/s/',
];

/**
 * A GUARD THAT READS ITS OWN PROSE FAILS ON ITSELF.
 *
 * This has happened four times in this work: a guard forbids a class, the
 * comment above it documents the class, and the guard finds it. A comment
 * is not something a person sees on a screen.
 *
 * The blanking must preserve LINE COUNT. A stripper that deletes a block
 * comment deletes its newlines too, and then every line number it reports
 * afterwards is wrong — which sends the reader to an innocent file.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');
}

/**
 * A TEMPLATE LITERAL IS TEXT THE CODE CONTAINS, NOT MARKUP IT RENDERS.
 *
 * A code sample inside `<pre>{`<button>…</button>`}</pre>` is documentation
 * a seller reads, and a guard looking for hand-written buttons must not
 * count it as one.
 *
 * It has to be a character scanner, not a regex: templates NEST, so
 * `` `${`${x}`}` `` is legal, and no regular expression can tell the `${`
 * of an interpolation from a `$` somebody typed into JSX text. Newlines
 * survive, for the same reason as above.
 */
export function stripTemplates(src: string): string {
  const out = src.split('');
  const blank = (i: number) => {
    if (src[i] !== undefined && src[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    if (src[i] !== '`') {
      i++;
      continue;
    }
    blank(i);
    i++;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        blank(i);
        blank(i + 1);
        i += 2;
        continue;
      }
      if (c === '$' && src[i + 1] === '{') depth++;
      else if (c === '}' && depth > 0) depth--;
      else if (c === '`' && depth === 0) {
        blank(i);
        i++;
        break;
      }
      blank(i);
      i++;
    }
  }
  return out.join('');
}

export interface GuardFile {
  /** Posix-style and rooted at the repo — `/src/components/ui/Rows.tsx`. */
  rel: string;
  src: string;
}

/**
 * EVERY DASHBOARD FILE, WITH THE SELLER'S SURFACES LEFT OUT.
 *
 * `.tsx` BY DEFAULT, and that default is load-bearing. Almost every rule
 * here is a rule about what is drawn, and widening the default to `.ts`
 * sweeps in the config, the formatters and the label maps — which is how
 * this very function, on its first run, reported offenders in four guards
 * that had been passing for a week. Ask for `'both'` deliberately.
 */
export function dashboardFiles(ext: '.ts' | '.tsx' | 'both' = '.tsx'): GuardFile[] {
  const out: GuardFile[] = [];
  const match = (p: string) => (ext === 'both' ? /\.tsx?$/.test(p) : p.endsWith(ext));
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (match(p) && !p.includes('.test.')) {
        const rel = `/${relative(process.cwd(), p).split('\\').join('/')}`;
        if (!SELLER_SURFACES.some((s) => rel.includes(s))) {
          out.push({ rel, src: readFileSync(p, 'utf8') });
        }
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  return out;
}

/** A file in the repo, by its repo-relative path with or without the leading slash. */
export function repoFile(rel: string): string {
  return readFileSync(join(process.cwd(), rel.replace(/^\//, '')), 'utf8');
}
