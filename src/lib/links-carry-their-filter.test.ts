import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A LINK THAT CARRIES A FILTER TO A SCREEN THAT CANNOT READ IT.
 *
 * «DEAD means: the control exists and does nothing, or navigates
 * nowhere…» — and this is the version nobody reports, because it DOES
 * navigate. The address bar even shows the filter. Only the screen is
 * wrong, and the person has no way to know something was dropped on the
 * way.
 *
 * Found on the first run, six of them:
 *   · the dashboard's «الإيراد المسلَّم» card, whose own subtitle counts
 *     «N طلب موصّل», went to `/orders?state=DELIVERED` and showed all of
 *     them;
 *   · every order number on تنبيهات الخصم went to
 *     `/orders?highlight=<id>` and showed the unfiltered list;
 *   · «شحنة مفقودة عند شركة الشحن» named one parcel and went to
 *     `/ops/tracking?order=<id>` — an ID, which that screen's search does
 *     not match at all.
 */

const root = process.cwd();

/**
 * KNOWN, AND WAITING ON A DECISION.
 *
 * `/finance/closing?wallet=<id>` — the closing screen lists wallets and
 * has nowhere to put a «this one». The id in the link is also the job's
 * dedupe key («once per WALLET per day, keyed on the wallet's id carried
 * in the link»), so it cannot simply be swapped for a name the screen can
 * search. Either the screen learns to scroll to a wallet, or the
 * notification stops promising one.
 */
const AWAITING_DECISION = ['/finance/closing'];

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

const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('a link that carries a filter reaches a screen that reads one', () => {
  const files = sourceFiles();

  /** Every route that has a page, and the files that page pulls in. */
  const pages = new Map<string, string>();
  for (const f of files) {
    const m = f.match(/^src\/app\/\(system\)\/(?:\(shell\)\/)?(.+)\/page\.tsx$/);
    if (m) pages.set('/' + m[1], f);
  }

  function readsAQuery(pageFile: string): boolean {
    const seen = [pageFile];
    const src = readFileSync(join(root, pageFile), 'utf8');
    for (const m of src.matchAll(/from '@\/(.*?)'/g)) {
      for (const ext of ['.tsx', '.ts']) {
        const candidate = 'src/' + m[1] + ext;
        if (files.includes(candidate)) seen.push(candidate);
      }
    }
    return seen.some((f) =>
      /useSearchParams|searchParams|window\.location\.search/.test(readFileSync(join(root, f), 'utf8'))
    );
  }

  const found: string[] = [];
  const dead: string[] = [];
  for (const file of files) {
    if (file.includes('/api/')) continue;
    const lines = code(readFileSync(join(root, file), 'utf8')).split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(/["'`](\/[a-z][\w/-]*)\?([a-zA-Z][\w=&${}.-]*)["'`]/g)) {
        const [, path, query] = m;
        if (path.startsWith('/api/')) continue;
        const page = pages.get(path);
        if (!page) continue;
        found.push(path);
        if (AWAITING_DECISION.includes(path)) continue;
        if (!readsAQuery(page)) dead.push(`${path}?${query}  ←  ${file}:${i + 1}`);
      }
    }
  }

  it('found links to check — a sweep over nothing proves nothing', () => {
    expect(found.length).toBeGreaterThan(8);
  });

  it('and none of them is dropped on arrival', () => {
    expect(dead, `روابطُ تحمل فلتراً لا تقرؤه الشاشة:\n${dead.join('\n')}`).toEqual([]);
  });

  /** The one on hold is still on hold, and still real. */
  it('and the one awaiting a decision has not quietly been fixed', () => {
    for (const path of AWAITING_DECISION) {
      const page = pages.get(path);
      expect(page, `${path}: لا صفحةَ له`).toBeTruthy();
      expect(readsAQuery(page!), `${path}: صار يقرأ الرابط — احذفه من قائمة الانتظار`).toBe(false);
    }
  });
});

/**
 * AND THE TWO THE ORDERS LIST NOW HONOURS, NAMED.
 *
 * A screen that merely imports `useSearchParams` satisfies the sweep
 * above. These say which keys, because the link on the other side says
 * them too.
 */
describe('the orders list honours what points at it', () => {
  const src = readFileSync(join(root, 'src/components/screens/OrdersScreen.tsx'), 'utf8');

  it('reads the state the dashboard sends', () => {
    expect(src).toMatch(/asked\.get\('state'\)/);
    // And refuses one that is not ours: a URL is typed by anyone, and an
    // unknown state comes back from the API as 400 «حالة غير معروفة».
    expect(src).toMatch(/FILTERABLE_STATES as string\[\]\)\.includes\(askedState\)/);
  });

  it('opens the order the discount alert names', () => {
    expect(src).toMatch(/useState<string \| null>\(asked\.get\('highlight'\)\)/);
  });
});

/**
 * AND THE LOST-PARCEL ALERT, BOTH ENDS OF IT.
 *
 * The sweep above only asks whether a screen reads SOME query — an import
 * left behind satisfies it, which a mutation proved. These two say which
 * key, on both sides, so the link and the screen cannot drift apart.
 */
describe('the lost-parcel alert lands on the parcel', () => {
  it('sends the order number, which that search can match', () => {
    const job = readFileSync(join(root, 'src/lib/jobs/definitions.ts'), 'utf8');
    expect(job).toMatch(/\/ops\/tracking\?order=\$\{order\.orderNumber\}/);
    // An id matches nothing in that screen's search — it landed on every
    // parcel in the store instead of the one the alert named.
    expect(job, 'عاد الرابطُ يحمل مُعرِّفاً لا يبحث به أحد').not.toMatch(
      /\/ops\/tracking\?order=\$\{order\.id\}/
    );
  });

  it('and the screen opens on it', () => {
    const screen = readFileSync(join(root, 'src/components/screens/TrackingScreen.tsx'), 'utf8');
    expect(screen).toMatch(/useSearchParams\(\)\.get\('order'\)/);
  });
});
