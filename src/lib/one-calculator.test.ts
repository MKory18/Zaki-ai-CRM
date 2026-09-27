import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './guard-source';
import { batchTotal, batchUnitCost } from './product-cost';

/**
 * ONE CALCULATOR PER NUMBER, AND ONE QUERY PER «WHAT MAY BE SOLD».
 *
 * Two functions computing the same money is the most dangerous duplication
 * this system can hold, because both look right in review and only one is
 * used — until somebody picks the other.
 *
 * Two were found in the dead-code pass:
 *
 *   A BATCH'S COST. `financial.ts` carried a `calculateBatchCosts` that
 *   summed the four legacy buckets and knew nothing about a batch's
 *   free-form cost lines, rounding to two places where the live one rounds
 *   to four. Nothing called it. The next person to open a file called
 *   «Financial Calculation Engine» would have dropped every free-form line
 *   out of the cost of goods and never seen it happen.
 *
 *   WHICH OFFERS A CUSTOMER MAY BUY. `offers.ts` exported the query and
 *   nobody imported it: the public order door, the public page and the AI
 *   intake each wrote their own. Two matched. The third ordered by
 *   quantity alone, so its fallback could be a different bundle from the
 *   one the page shows — the assistant quoting one price while the
 *   customer reads another.
 */

const ROOT = process.cwd();

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (name === 'node_modules' || name === '.next') continue;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

const FILES = [...sources('src'), ...sources('tests')];
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

describe('a batch costs what one function says it costs', () => {
  it('and the free-form lines are part of it', () => {
    // The fault the deleted twin had: buckets only.
    const buckets = { manufacturingCost: 1500, packagingCost: 400, rawMaterialCost: 600, otherCosts: 0 };
    expect(batchTotal(buckets).total).toBe(2500);
    expect(batchTotal({ ...buckets, costLines: [{ amount: 250 }] }).total).toBe(2750);
    expect(batchUnitCost(2500, 500)).toBe(5);
  });

  it('and nothing else sums the four buckets', () => {
    const offenders = FILES.filter((f) => {
      if (f === 'src/lib/product-cost.ts') return false;
      const src = read(f);
      // The shape of the duplicate: adding manufacturing to packaging.
      return /manufacturingCost\s*\|\|\s*0\)\s*\+/.test(src);
    });
    expect(offenders, `حاسبةُ تكلفةٍ ثانية:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('one query decides which offers may be bought', () => {
  it('and every reader of a product’s offers goes through it', () => {
    const offenders = FILES.filter((f) => {
      if (f === 'src/lib/offers.ts') return false;
      const src = read(f);
      // A findMany that filters offers by product and ACTIVE status is the
      // question `activeOffersFor` answers. The admin list is not this: it
      // scopes by store and shows inactive ones too.
      return /offer\.findMany\(\{[\s\S]{0,200}productId[\s\S]{0,120}status:\s*'ACTIVE'/.test(src);
    });
    expect(offenders, `استعلامُ عروضٍ ثانٍ:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the three readers that had their own now call it', () => {
    for (const f of [
      'src/lib/public-order.ts',
      'src/components/landing/LandingPageView.tsx',
      'src/app/api/orders/ai-intake/route.ts',
    ]) {
      expect(read(f), `${f} لا يستعمل المصدر الواحد`).toMatch(/activeOffersFor\(/);
    }
  });
});

/**
 * ONE NAME FOR THE PERMISSION CHECK.
 *
 * `auth.ts` exported `hasPermission` as a second name for `can()`, and
 * `rbac.ts` exported `permissionsForRole` over the legacy role table.
 * Nobody imported either. Two names for the most sensitive function in
 * the system is the question «which of these is the real one?», and the
 * wrong answer is a permission check that reads a table instead of the
 * session's grants.
 */
describe('one permission check, under one name', () => {
  it('and no second name is exported for it', () => {
    const auth = read('src/lib/auth.ts');
    expect(auth, 'اسمٌ ثانٍ لفحص الصلاحية').not.toMatch(/export const hasPermission/);
    const rbac = read('src/lib/rbac.ts');
    expect(rbac, 'غلافٌ ثانٍ فوق جدول الأدوار').not.toMatch(/export function permissionsForRole/);
  });

  it('and nothing calls one that is not there', () => {
    const callers = FILES.filter((f) => /hasPermission\(|permissionsForRole\(|hydrateGrants\(/.test(read(f)));
    expect(callers, 'نداء لفاحص محذوف: ' + callers.join(' | ')).toEqual([]);
  });
});
