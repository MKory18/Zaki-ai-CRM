import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_ROUTES } from './route-registry';
import { BANDS } from './performance-score';

/**
 * THE ACCEPTANCE LIST, AS TESTS.
 *
 * The rebuild document ends with a list of sentences that must be true of
 * the finished system. A list like that, left as a list, is checked once by
 * whoever remembers it and then quietly stops being true — which is the
 * same fate as the columns that were added and never read, and the prompt
 * that was edited and never saved.
 *
 * So the ones that can be checked by a machine are checked by a machine,
 * every run. The ones that cannot — "a new employee understands the screen
 * from its title" — are not faked here; they are a human's judgement and
 * they belong in the sweep, not in a green tick.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function walk(dir: string, ext = '.tsx'): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, ext));
    else if (p.endsWith(ext) && !p.includes('.test.')) out.push(p);
  }
  return out;
}

describe('the numbers are computed where they can be trusted', () => {
  it('days in transit counts from SHIPPED, never from created', () => {
    // An order entered on Sunday and shipped on Thursday is not four days
    // late; it is a day old. Counting from creation makes every slow
    // confirmation look like a slow courier.
    const src = read('src/lib/transit.ts');
    expect(src).toContain('shippedAt');
    expect(src).not.toContain('createdAt');
  });

  it('no screen does money arithmetic — the API says what a thing costs', () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src/components/screens'))) {
      const src = readFileSync(file, 'utf8');
      // A total assembled in the browser is a total that disagrees with the
      // invoice the moment a rule changes on the server.
      for (const m of src.matchAll(/\b(cod|total|profit|net|commission)\s*=\s*[^;\n]*[-+*]\s*[a-z]/gi)) {
        if (/price|discount|deliveryFee|shipping/i.test(m[0])) {
          offenders.push(`${file.split(/[\\/]/).pop()}: ${m[0].slice(0, 60)}`);
        }
      }
    }
    expect(offenders, `حساب مال في الواجهة:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('no assistant can act', () => {
  it('none of them touches the business', () => {
    // They propose. Every one of the acts a business is accountable for —
    // a state, a movement, a price, a settlement, a line in the audit —
    // stays with a person.
    //
    // Writing its OWN row is not that: the daily summary caches what it
    // produced so the same day is not paid for twice. The rule is about
    // whose records an assistant may change, not whether it may remember.
    const BUSINESS = [
      'order', 'orderItem', 'wallet', 'walletMovement', 'commissionEntry', 'commissionPayout',
      'penalty', 'payslip', 'inventoryMovement', 'product', 'settlement', 'auditLog', 'user',
    ];
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src/app/api/ai'), '.ts')) {
      const src = readFileSync(file, 'utf8');
      for (const table of BUSINESS) {
        const writes = new RegExp(
          `\\b(?:db|tx)\\.${table}\\.(?:create|update|updateMany|delete|deleteMany|upsert)\\s*\\(`
        );
        if (writes.test(src)) offenders.push(`${file.split(/[\\/]/).pop()} → ${table}`);
      }
    }
    expect(offenders, `مساعد يكتب في سجلّ العمل:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the picking assistant is never handed a customer', () => {
    // The warehouse packs boxes. A name, a phone and an address in that
    // payload is customer data sitting where nobody needs it.
    const payload = read('src/lib/ai-scope.ts');
    expect(payload).not.toMatch(/\bphone\b/);
    expect(payload).not.toMatch(/\baddress\b/);
  });
});

describe('the score is a measurement, not a contract', () => {
  it('its weights appear on no screen as an editable field', () => {
    const offenders: string[] = [];
    for (const file of [...walk(join(process.cwd(), 'src/components/screens')), ...walk(join(process.cwd(), 'src/components/settings'))]) {
      const src = readFileSync(file, 'utf8');
      if (!/weight/i.test(src)) continue;
      // A weight next to an onChange is a weight somebody can move, and a
      // score whose weights move cannot be compared with last month's.
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (/weight/i.test(line) && /onChange|<input|<select/.test(line)) {
          offenders.push(`${file.split(/[\\/]/).pop()}:${i + 1}`);
        }
      });
    }
    expect(offenders, `وزن قابل للتحرير:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the weights still add to a hundred', () => {
    expect(BANDS.reduce((s, b) => s + b.weight, 0)).toBe(100);
  });
});

describe('every screen in the menu is a screen', () => {
  it('nothing in the registry renders "under construction"', () => {
    // A menu entry that opens a placeholder teaches people the menu lies.
    const shell = read('src/components/shell/UnderConstruction.tsx');
    expect(shell).toBeTruthy();
    const users = walk(join(process.cwd(), 'src/app'), '.tsx').filter((f) =>
      readFileSync(f, 'utf8').includes('UnderConstruction')
    );
    expect(users.map((f) => f.replace(process.cwd(), '')), 'شاشة قيد الإنشاء في القائمة').toEqual([]);
  });

  it('and only a person’s own profile is open to everybody', () => {
    // Anything else with no key is a screen nobody decided on.
    const open = ALL_ROUTES.filter((r) => !r.permissions || r.permissions.length === 0);
    expect(open).toHaveLength(1);
    expect(open[0].label).toBe('الملف الشخصي');
  });
});

/**
 * EVERY SCREEN GUARDS ITSELF.
 *
 * The deductions screen shipped without `guardRoute`. The layout checks
 * that somebody is signed in and nothing more, so any ACTIVE employee who
 * typed the path saw their colleagues' names beside the amounts proposed
 * against them — and a button that applies them. The API still refused the
 * write, so no money moved; the leak was the list itself, which is a
 * payroll document.
 *
 * It was the only one, and it was mine. This makes it the last: a page that
 * forgets the guard now fails here instead of in front of somebody's staff.
 */
describe('no screen is reachable without its key', () => {
  it('every page under the shell calls guardRoute', () => {
    const root = join(process.cwd(), 'src/app/(system)/(shell)');
    const missing = walk(root)
      .filter((f) => f.endsWith('page.tsx'))
      .filter((f) => !readFileSync(f, 'utf8').includes('guardRoute'))
      .map((f) => f.slice(root.length).split(/[\\/]/).join('/'));

    expect(missing, `صفحة بلا حارس:\n${missing.join('\n')}`).toEqual([]);
  });
});
