import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './guard-source';

/**
 * A REFUSAL IN A LANGUAGE THE READER DOES NOT HAVE IS NOT A REFUSAL.
 *
 * «وإذا في طلب عالق بطلباتي بحاول أأكّده بيجيني خطأ ما بعرف ليش» — read
 * literally, and it was literal. Confirming an order could answer
 * «Cannot start from status FOLLOW_UP_REQUIRED»: English, and a database
 * word inside it. There was nothing to understand.
 *
 * Measured: 207 English messages across 49 routes. The two the report is
 * about — confirming an order and moving its shipping — are Arabic now,
 * and every message says what to DO rather than only what failed.
 *
 * The rest are listed below and may only shrink. A ratchet, not a
 * pretence that the sweep is finished: a list that shortens is honest,
 * and a guard that passes because the rule was never applied is not.
 */

const ROOT = process.cwd();
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

function routes(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...routes(rel));
    else if (name === 'route.ts') out.push(rel);
  }
  return out;
}

/** An `error:` whose message starts with a Latin letter. */
const ENGLISH = /error:\s*(?:'([A-Za-z][^']{6,})'|`([A-Za-z][^`]{6,})`)/g;

function englishMessages(rel: string): string[] {
  const src = read(rel);
  return [...src.matchAll(ENGLISH)].map((m) => m[1] ?? m[2]);
}

const FIXED = [
  'src/app/api/orders/[id]/confirmation/route.ts',
  'src/app/api/orders/[id]/shipping/route.ts',
];

describe('the doors a confirmation agent knocks on', () => {
  it.each(FIXED)('%s refuses in Arabic', (rel) => {
    const left = englishMessages(rel);
    expect(left, `رسائل إنجليزية باقية:\n${left.join('\n')}`).toEqual([]);
  });

  it('and names a state in words, not in database spelling', () => {
    for (const rel of FIXED) {
      const src = read(rel);
      // The map that turns FOLLOW_UP_REQUIRED into «بحاجة متابعة».
      expect(src, `${rel} يطبع اسم الحالة كما هو في القاعدة`).toMatch(/_AR: Record<string, string>/);
      expect(src).toMatch(/\?\? from|\?\? to|\?\? order\.confirmationStatus/);
    }
  });

  /**
   * And they say what to do next. A translated dead end is still a dead
   * end — «ما بعرف ليش» is answered by a next step.
   */
  it('and tells the person what to do about it', () => {
    const confirmation = read(FIXED[0]);
    expect(confirmation).toContain('اسحب الطلب أولاً');
    expect(confirmation).toContain('أعد تحميل الصفحة ثم احفظ');
    const shipping = read(FIXED[1]);
    expect(shipping).toContain('أعد تحميل الصفحة ثم احفظ');
  });
});

describe('the rest of the sweep', () => {
  /**
   * The number that must only fall — measured by THIS regex, not by a
   * second script that would count slightly differently and let the two
   * drift. 207 before the two routes below were translated; 167 after.
   */
  /*
   * AND WHY THIS NUMBER DID NOT FALL WHEN THE ORDERS GROUP WAS DONE.
   *
   * `orders-refuse-in-arabic.test.ts` gave all ninety-four refusals in
   * `src/app/api/orders/**` an Arabic sentence — but as `errorAr`,
   * beside the English `error`, which is the channel ten components
   * already prefer. The English strings were kept on purpose: fifteen
   * test files assert on them and support reads the permission key out
   * of them. So this ratchet, which counts English `error:` values,
   * reads the same as before and is still honest about what it
   * measures. What a person SEES is the other guard's subject.
   */
  const KNOWN_REMAINING = 167;

  it('has not grown', () => {
    const all = routes('src/app/api');
    const total = all.reduce((n, rel) => n + englishMessages(rel).length, 0);
    expect(
      total,
      `رسائل إنجليزية في الواجهة: ${total}. الحدّ المسموح ${KNOWN_REMAINING} — وهو سقفٌ ينزل ولا يرتفع.`
    ).toBeLessThanOrEqual(KNOWN_REMAINING);
  });

  it('and no new English message appears in an order route', () => {
    const orderRoutes = routes('src/app/api/orders');
    const offenders = orderRoutes
      .map((rel) => ({ rel, msgs: englishMessages(rel) }))
      .filter(({ rel, msgs }) => msgs.length > 0 && !FIXED.includes(rel));
    // These are the ones still to do, named so the list is a worklist and
    // not a silence.
    expect(offenders.length, `مساراتُ طلباتٍ لم تُترجَم بعد:\n${offenders.map((o) => `${o.rel} (${o.msgs.length})`).join('\n')}`).toBeLessThanOrEqual(18);
  });
});

/**
 * AND NOW EVERY ROUTE A PERSON'S SCREEN CALLS, NOT ONLY THE ORDERS GROUP.
 *
 * `orders-refuse-in-arabic.test.ts` did the ninety-four in
 * `src/app/api/orders`. Seventy-three were left elsewhere, and only one of
 * them carried a sentence. Thirty-seven of those seventy-three answer a
 * MACHINE and are exempt by the list below; the other thirty-six are read by
 * somebody, and they have one now.
 *
 * Nineteen of the thirty-six were `Forbidden: missing required permission x.y`
 * RETURNED rather than thrown, so they never reached `apiError` and never got
 * its sentence. They call the same builder now — `forbiddenAr` — so a thrown
 * refusal and a returned one read alike.
 */
describe('every refusal a person can read carries a sentence', () => {
  /**
   * WHOSE EYES READ THIS BODY.
   *
   * These three families answer software, and their text is a contract with
   * it rather than a message to anybody:
   *
   *   webhooks/  Telegram's servers, Meta's, a courier's. Their retry logic
   *              reads the status; the body goes to a log.
   *   media/     an `<img>` tag asking for a file. Nothing renders its body.
   *   public/    the shopper's page: a missing slug is a 404 for a page, not
   *              a sentence in the operator's product.
   *
   * Translating those would dress a machine's error as a person's, and the
   * next reader would try to fix the Arabic instead of the integration.
   */
  const MACHINE_FACING: [string, string][] = [
    ['src/app/api/webhooks/', 'Telegram, Meta and the couriers call in; their retry logic reads the status, not the words'],
    ['src/app/api/media/', 'an <img> tag asking for a file — nothing renders the body of this response'],
    ['src/app/api/public/', 'the shopper’s own page, where a missing slug is a page 404 rather than a sentence'],
  ];

  const ORDERS = 'src/app/api/orders/';

  const bare: string[] = [];
  let personFacing = 0;

  for (const rel of routes('src/app/api')) {
    if (rel.startsWith(ORDERS)) continue;              // its own guard
    if (MACHINE_FACING.some(([prefix]) => rel.startsWith(prefix))) continue;
    const src = read(rel);
    const spanSrc = src.replace(/\$\{[^}]*\}/g, (x) => ' '.repeat(x.length));
    for (const m of src.matchAll(/error:\s*(?:'([A-Za-z][^']{6,})'|`([A-Za-z][^`]{6,})`)/g)) {
      const msg = m[1] ?? m[2];
      /*
       * A MESSAGE THAT ALREADY SPEAKS ARABIC IS NOT ENGLISH.
       *
       * The regex above matches on the FIRST character being Latin, which
       * is how a sentence that opens with a vendor's own term reads to it:
       * «Dataset ID أرقام فقط» is Arabic with a technical name in it, and
       * the first version of this rule asked it to be translated.
       */
      if (/[؀-ۿ]/.test(msg)) continue;
      personFacing++;
      /*
       * THE SAME OBJECT LITERAL, NOT A WINDOW OF CHARACTERS.
       *
       * A fixed window around the match is satisfied by a NEIGHBOUR's
       * sentence: two refusals a few lines apart, delete one's `errorAr`
       * and the other's is still inside the window. Measured — a mutation
       * that stripped one sentence from `moderators/route.ts` passed.
       * The body `{ … }` the `error:` sits in is the actual scope.
       */
      /*
       * …and `${…}` blanked first, or a template literal closes the brace
       * early: `Export limit exceeded (${totalRows} orders)` ends the span
       * at its own interpolation, three characters before the `errorAr`
       * that was sitting right there. Same length, so offsets still line up.
       */
      const opens = spanSrc.lastIndexOf('{', m.index!);
      const closes = spanSrc.indexOf('}', m.index!);
      const literal = src.slice(opens < 0 ? 0 : opens, closes < 0 ? src.length : closes);
      if (!literal.includes('errorAr')) bare.push(`${rel}: ${msg.slice(0, 60)}`);
    }
  }

  it('found refusals to check — a sweep over nothing proves nothing', () => {
    expect(personFacing).toBeGreaterThan(25);
  });

  it('and none of them is English alone', () => {
    expect(
      bare,
      `رفضٌ يقرأه إنسانٌ بلا جملةٍ عربيّة:\n${bare.join('\n')}`
    ).toEqual([]);
  });

  it('and what answers a machine says whose machine it is', () => {
    const all = routes('src/app/api');
    for (const [prefix, why] of MACHINE_FACING) {
      expect(why.length, `${prefix}: بلا سبب`).toBeGreaterThan(40);
      expect(all.some((f) => f.startsWith(prefix)), `${prefix}: لا مسارَ تحته`).toBe(true);
    }
  });

  it('and a returned permission refusal reads like a thrown one', async () => {
    const { forbiddenAr, apiError } = await import('./api-error');
    const thrown = apiError(new Error('Forbidden: missing required permission products.view'));
    expect(forbiddenAr('Forbidden: missing required permission products.view')).toBe(thrown.body.errorAr);
    expect(forbiddenAr('Forbidden: missing required permission products.view')).toContain('عرض المنتجات');
  });
});
