import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * THERE IS ONE COMMISSION NUMBER.
 *
 * There used to be two, and they disagreed.
 *
 *  - `Order.moderatorCommission` — written the moment the order was created,
 *    as `sellingPrice × user.commissionRate`. It knew nothing about the
 *    commission RULES, nothing about their dates, nothing about which store
 *    the order belonged to, and it was fixed before anybody knew whether the
 *    order would ever be delivered. The dashboard's profit line, the finance
 *    screen and the moderator leaderboard all summed it.
 *  - `CommissionEntry` — the ledger. Accrues on DELIVERY against the rule in
 *    force on that date for that store, reverses when the goods come back,
 *    and is what the commission screen and any payout read.
 *
 * So the same month reported two different commission figures depending on
 * which screen you opened, and the profit people spent against was the wrong
 * one. The legacy column is retired: nothing writes it, nothing reads it.
 *
 * These are FILE-LEVEL guards. A unit test cannot catch somebody adding a
 * sixth screen that sums the old column — only reading the tree can.
 */

const SRC = join(__dirname, '..');

/** Every .ts/.tsx under src/, excluding tests and this file's own subject. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: path.slice(SRC.length + 1),
  text: readFileSync(path, 'utf8'),
}));

/** Lines mentioning the legacy column, comments and this file aside. */
function legacyMentions(): { file: string; line: string }[] {
  const hits: { file: string; line: string }[] = [];
  for (const { path, text } of FILES) {
    if (path === 'lib/commission-one-source.test.ts') continue;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
      if (line.includes('moderatorCommission')) hits.push({ file: path, line });
    }
  }
  return hits;
}

describe('the retired column', () => {
  it('is not written, read or selected anywhere in src/', () => {
    // If this fails it names the file: either move it onto the ledger
    // (`commissionCostForOrders` / `commissionByUserForOrders`) or, if it is
    // genuinely about something else, rename the field.
    expect(legacyMentions().map((h) => `${h.file}: ${h.line}`)).toEqual([]);
  });

  it('is still in the schema, because financial history is not deleted', () => {
    // Retiring is not dropping. The column holds what the old engine wrote
    // for orders that predate the ledger, and a migration that dropped it
    // would destroy the only record of what those orders were paid on.
    const schema = readFileSync(join(SRC, '..', 'prisma', 'schema.prisma'), 'utf8');
    expect(schema).toContain('moderatorCommission');
  });
});

describe('who may compute commission', () => {
  it('only the ledger multiplies a rate by a price', () => {
    // `commissionRate` is still a column on User, and the temptation is to
    // reach for it in a route. The rate that counts lives in CommissionRule,
    // is dated, and is applied in exactly one place.
    const offenders = FILES.filter(
      ({ path, text }) =>
        path !== 'lib/commission.ts' &&
        !path.startsWith('components/') &&
        /commissionRate/.test(text) &&
        /commissionRate\s*\)?\s*\/\s*100|\*\s*[\w.]*commissionRate/.test(text)
    ).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('the profit line subtracts a figure it was handed, never one it derived', () => {
    // financial.ts takes `commission` per delivered order and sums it. It
    // must not know where commission comes from — that is what let the old
    // second engine exist beside the ledger.
    const financial = readFileSync(join(SRC, 'lib', 'financial.ts'), 'utf8');
    expect(financial).not.toMatch(/commissionRate|\/\s*100/);
  });
});
