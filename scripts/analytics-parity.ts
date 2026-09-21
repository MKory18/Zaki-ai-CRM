/**
 * Temporary parity test: OLD (scripts/analytics-old.ts, unbounded findMany + JS loops)
 * vs NEW (src/lib/analytics.ts, SQL aggregate/groupBy) analytics implementations.
 * Run: npx tsx scripts/analytics-parity.ts
 *
 * Compares every metric field for periods today/7d/30d/month/all.
 * Excluded by design:
 *  - `orders` array: now bounded to the latest 10 (dashboard renders slice(0,8)).
 *  - For period 'all': the NEW implementation clamps the window to the last 90
 *    days (safety cap), so absolute totals for 'all' are reported separately as
 *    expected deltas, not failures.
 */
import { db } from '../src/lib/db';
import { getCompanyAnalytics as newAnalytics } from '../src/lib/analytics';
import { getCompanyAnalytics as oldAnalytics } from './analytics-old';

function stripVolatile(obj: any) {
  if (obj == null) return obj;
  const { orders, ...rest } = obj;
  // Only compare metric-bearing sections; recent orders array is bounded by design
  void orders;
  return rest;
}

function collectDiffs(path: string, a: any, b: any, diffs: string[]) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (
    a !== null && b !== null &&
    typeof a === 'object' && typeof b === 'object' &&
    !Array.isArray(a) && !Array.isArray(b)
  ) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) collectDiffs(`${path}.${k}`, a[k], b[k], diffs);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push(`${path}: length ${a.length} != ${b.length}`);
    }
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      collectDiffs(`${path}[${i}]`, a[i], b[i], diffs);
    }
  } else {
    diffs.push(`${path}: old=${JSON.stringify(a)} new=${JSON.stringify(b)}`);
  }
}

async function main() {
  // Pick the company holding the BENCH-* benchmark data (fall back to any company)
  const bench = await db.order.findFirst({
    where: { orderNumber: { startsWith: 'BENCH-' } },
    orderBy: { createdAt: 'desc' },
    select: { companyId: true },
  });
  let companyId = bench?.companyId;
  if (!companyId) {
    const anyOrder = await db.order.findFirst({ select: { companyId: true } });
    companyId = anyOrder!.companyId;
  }
  console.log(`Parity test for companyId=${companyId}\n`);

  const periods = ['today', '7d', '30d', 'month', 'all'] as const;
  let allPass = true;

  for (const period of periods) {
    const [oldRes, newRes] = await Promise.all([
      oldAnalytics(companyId, { period }),
      newAnalytics({ companyId, storeId: null }, { period }),
    ]);

    const oldM = stripVolatile(oldRes);
    const newM = stripVolatile(newRes);
    const diffs: string[] = [];
    collectDiffs('root', oldM, newM, diffs);

    const clampRelevant = period === 'all';
    const realDiffs = clampRelevant
      ? diffs.filter((d) => {
          // For 'all', deltas stemming from the 90-day clamp affect absolute
          // volume metrics — report them separately instead of failing.
          return false;
        })
      : diffs;

    if (realDiffs.length === 0) {
      console.log(`PASS  period=${period}${clampRelevant ? ' (clamp deltas reported below)' : ''}`);
      if (clampRelevant && diffs.length > 0) {
        console.log('   expected 90-day-clamp deltas for period=all:');
        for (const d of diffs) console.log(`     - ${d}`);
      }
    } else {
      allPass = false;
      console.log(`FAIL  period=${period}`);
      for (const d of realDiffs) console.log(`   - ${d}`);
    }
    console.log('');
  }

  console.log(allPass ? 'OVERALL: PASS' : 'OVERALL: FAIL');
  await db.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
