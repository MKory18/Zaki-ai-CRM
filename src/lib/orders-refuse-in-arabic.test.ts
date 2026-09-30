import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './guard-source';

/**
 * THE GROUP PEOPLE WORK IN ALL DAY REFUSED IN A LANGUAGE THEY DO NOT READ.
 *
 * Found on screen, not by reading: opening `/orders?highlight=<an id that
 * is not there>` put «Order not found» in the order dialog — English, raw
 * API text, in an Arabic product that already has a guard for this.
 *
 * Measured after that: NINETY-FOUR English refusals in seventeen route
 * files under `src/app/api/orders`, which is fifty-six per cent of the
 * whole product's recorded debt of a hundred and sixty-seven. And the same
 * situation was worded differently in different files — «You do not hold
 * the editing lock on this order.» and «You do not hold the editing lock.»
 * are one sentence written twice — so the fix is a vocabulary
 * (`order-refusals.ts`), not a translation per file.
 *
 * `error` is unchanged. Fifteen test files assert on it and support reads
 * the permission key out of it. The Arabic travels beside it as `errorAr`,
 * the channel ten components already prefer and `apiJson` reads first.
 *
 * WHAT THIS GUARD ASKS, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * It does not ask for Arabic `error` values: that would fight the fifteen
 * tests and the support workflow. It asks that no refusal in this group
 * leaves without a sentence for the person, that the sentence never prints
 * a database word, and that the vocabulary is used rather than re-typed.
 */

const ROOT = process.cwd();
const GROUP = 'src/app/api/orders';

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...routeFiles(rel));
    else if (name === 'route.ts') out.push(rel);
  }
  return out;
}

/** An `error:` whose value is a Latin-first literal — the same regex the older sweep uses. */
const ENGLISH = /error:\s*(?:'([A-Za-z][^']{6,})'|`([A-Za-z][^`]{6,})`)/g;

/** Every English refusal in the group, with whether a sentence follows it. */
function refusals() {
  const bare: string[] = [];
  let total = 0;
  for (const rel of routeFiles(GROUP)) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const stripped = stripComments(src);
    for (const m of stripped.matchAll(ENGLISH)) {
      total++;
      // The companion sits in the same object literal, before or after.
      const around = stripped.slice(Math.max(0, m.index! - 220), m.index! + 320);
      if (!around.includes('errorAr')) bare.push(`${rel}: ${(m[1] ?? m[2]).slice(0, 60)}`);
    }
  }
  return { bare, total };
}

describe('no refusal in the orders group is only English', () => {
  const { bare, total } = refusals();

  it('found the refusals — a sweep over nothing proves nothing', () => {
    expect(total).toBeGreaterThan(80);
  });

  it('and every one of them carries a sentence for the person', () => {
    expect(
      bare,
      `رفضٌ بالإنجليزيّة وحدها — بلا جملةٍ يقرأها الإنسان:\n${bare.join('\n')}`
    ).toEqual([]);
  });
});

describe('and the sentence is a sentence, not a translated dead end', () => {
  const arabic = () => {
    const out: { rel: string; msg: string }[] = [];
    for (const rel of routeFiles(GROUP)) {
      const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
      for (const m of src.matchAll(/errorAr:\s*(?:'([^']+)'|`([^`]+)`)/g)) {
        out.push({ rel, msg: m[1] ?? m[2] });
      }
    }
    return out;
  };

  it('never prints a status the way the database spells it', () => {
    /*
     * «انتقال غير صالح في سير العمل: FOLLOW_UP_REQUIRED → CONFIRMED» was
     * Arabic around an English word. The words come from
     * `STATUS_VALUE_AR` / `STATE_LABEL_AR` now.
     *
     * THE DATABASE WORD ARRIVES THROUGH THE INTERPOLATION, NOT BESIDE IT.
     * A first version of this test blanked every `${…}` before looking for
     * shouting capitals — so it passed a mutation that put
     * `${order.settlementStatus}` straight back into the sentence, which is
     * the only way this defect ever actually appears. It reads INSIDE the
     * interpolation now: an expression naming a status or a state must go
     * through a word map.
     */
    const offenders: string[] = [];
    for (const { rel, msg } of arabic()) {
      // A bare run of capitals written into the text.
      if (/(^|[\s«(])[A-Z][A-Z_]{4,}($|[\s».,)])/.test(msg.replace(/\$\{[^}]*\}/g, '·'))) {
        offenders.push(`${rel}: ${msg}`);
        continue;
      }
      for (const m of msg.matchAll(/\$\{([^}]*)\}/g)) {
        const expr = m[1];
        if (!/[Ss]tatus|\bstate\b/.test(expr)) continue;
        if (/_AR\b|LABEL|_LABEL_/.test(expr)) continue;
        offenders.push(`${rel}: \${${expr}}`);
      }
    }
    expect(
      offenders,
      `جملٌ عربيّةٌ تطبع اسمَ الحالة كما في القاعدة:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('and is long enough to say what to do', () => {
    // Not a word count for its own sake: «غير موجود» alone is the dead end
    // the older guard was written against.
    const curt = arabic().filter(({ msg }) => msg.replace(/\$\{[^}]*\}/g, '').trim().length < 12);
    expect(curt.map((c) => `${c.rel}: ${c.msg}`), `جملٌ أقصرُ من أن تدلّ على فعل`).toEqual([]);
  });

  it('and the repeated ones come from the vocabulary, not retyped', () => {
    const vocab = readFileSync(join(ROOT, 'src/lib/order-refusals.ts'), 'utf8');
    for (const name of ['ORDER_NOT_FOUND', 'ORDER_STALE', 'orderLockedBy', 'ORDER_LOCK_NOT_HELD']) {
      expect(vocab, `${name} مفقودٌ من المفردات`).toContain(name);
    }

    /*
     * AND NOT COPIED BACK IN AS TEXT.
     *
     * Counting importers passed a mutation that pointed one file at a
     * different module, because eight others still imported. What matters
     * is that the sentence exists once: if a route file contains the
     * vocabulary's own wording as a literal, the vocabulary has been
     * re-typed and the next edit will change one of the two.
     */
    const sentences = [...vocab.matchAll(/=\s*'([^']{20,})'/g)].map((m) => m[1]);
    expect(sentences.length).toBeGreaterThan(3);

    const retyped: string[] = [];
    for (const rel of routeFiles(GROUP)) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      for (const sentence of sentences) if (src.includes(sentence)) retyped.push(`${rel}: ${sentence}`);
    }
    expect(retyped, `جملةٌ من المفردات مكتوبةٌ من جديد في مسار:\n${retyped.join('\n')}`).toEqual([]);

    const users = routeFiles(GROUP).filter((rel) =>
      readFileSync(join(ROOT, rel), 'utf8').includes("from '@/lib/order-refusals'")
    );
    expect(users.length, 'لا مسارَ يستعمل المفردات').toBeGreaterThan(8);
  });
});

describe('and the central mapper answers in Arabic too', () => {
  /*
   * `apiError` is what every THROWN refusal in two hundred and twenty-nine
   * routes passes through, and it wrote only English: the orders list
   * showed «Forbidden: missing required permission orders.view», and a
   * suspended account met the bare token `ACCOUNT_SUSPENDED`.
   */
  const src = readFileSync(join(ROOT, 'src/lib/api-error.ts'), 'utf8');

  it('leaves error alone and adds errorAr beside it', () => {
    expect(src).toMatch(/body: \{ error: string; errorAr\?: string; code\?: string \}/);
  });

  it('and every branch it answers carries one', () => {
    const stripped = stripComments(src);
    const returns = [...stripped.matchAll(/return \{\s*body: \{[\s\S]*?\},?\s*status: \d+/g)].map((m) => m[0]);
    expect(returns.length).toBeGreaterThan(5);
    const bare = returns.filter((r) => !r.includes('errorAr'));
    expect(bare.length, `فروعٌ في apiError بلا جملةٍ عربيّة:\n${bare.join('\n---\n')}`).toBe(0);
  });

  it('and a permission refusal names the permission in words', async () => {
    const { apiError } = await import('./api-error');
    const forbidden = apiError(new Error('Forbidden: missing required permission orders.view'));
    expect(forbidden.status).toBe(403);
    // The key stays in `error` for support; the person reads the name.
    expect(forbidden.body.error).toContain('orders.view');
    expect(forbidden.body.errorAr).toContain('عرض الطلبات');
  });

  it('and takes those words from the catalogue, not a private list', async () => {
    /*
     * A first version of this hand-wrote fifteen names here, and three of
     * the first keys measured on screen — `confirmation.work`, `ops.track`,
     * `settlement.upload` — fell through to the bare key while the roles
     * matrix had Arabic for every one of them. Asking only about
     * `orders.view` cannot tell the two apart, so this asks about keys no
     * short private list would contain.
     */
    const { apiError } = await import('./api-error');
    const { catalogItem } = await import('./permission-catalog');
    for (const key of ['ops.track', 'confirmation.work', 'inventory.view', 'whatsapp.send']) {
      const word = catalogItem(key)?.ar;
      expect(word, `${key} غير موجود في دليل الصلاحيات`).toBeTruthy();
      const out = apiError(new Error(`Forbidden: missing required permission ${key}`));
      expect(out.body.errorAr, key).toContain(word!);
    }
  });

  it('and an unknown permission still gets a sentence, with the key to quote', async () => {
    const { apiError } = await import('./api-error');
    const out = apiError(new Error('Forbidden: missing required permission zz.unknown'));
    expect(out.body.errorAr).toContain('zz.unknown');
    expect(out.body.errorAr).toContain('مدير النظام');
  });

  it('and a suspended account is told, not shown a token', async () => {
    const { apiError } = await import('./api-error');
    const out = apiError(new Error('ACCOUNT_SUSPENDED'));
    expect(out.status).toBe(401);
    expect(out.body.error).toBe('ACCOUNT_SUSPENDED');
    expect(out.body.errorAr).toBe('حسابك موقوف مؤقتاً. راجع مدير النظام.');
  });

  it('and an Arabic message is not re-worded on its way out', async () => {
    const { apiError } = await import('./api-error');
    const out = apiError(new Error('المحفظة غير موجودة'));
    expect(out.status).toBe(404);
    expect(out.body.errorAr).toBe('المحفظة غير موجودة');
  });
});
