import { db } from './db';
import { getPermissionScope } from './authorization';
import { orderListWhere } from './rbac';
import { getDateRange } from './analytics';
import { ordersWhere } from './order-filters';
import { whereForState } from './order-state';
import { heldWithoutAttemptWhere } from './confirmation-queue';
import { normalizePhoneNumber } from './phone';
import { typed } from './text-search';
import type { SessionUser } from '@/types/auth';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THE PALETTE KNOWS, AND WHO IT IS ALLOWED TO KNOW IT ABOUT.
 *
 * Ctrl+K used to open on three commands and a blank list. The owner's
 * frozen item asks it to open on an ANSWER instead: how much work is in
 * front of this account right now, counted by the rules the screens
 * behind it already count by.
 *
 * ── NO SECOND ARITHMETIC. EVER. ──
 *
 * Every number here is a `count` over a `where` this repository already
 * owns:
 *
 *   «طلبات اليوم»   `getDateRange({ period: 'today' })` — the dashboard's
 *                   own definition of today, not a fresh midnight.
 *   «جديدة»         `whereForState('NEW')` — the same predicate the orders
 *                   list filters by, so the row and the number agree.
 *   «مؤجّلة»        `whereForState('POSTPONED')`, likewise.
 *   «متأخرة»        `ordersWhere({ lateDays: 10 })` — literally the «المتأخرة»
 *                   switch on the orders screen, which is also 10 days.
 *   «بلا محاولة»    `heldWithoutAttemptWhere` — the predicate the PULL GATE
 *                   refuses on.
 *
 * A palette that counted by rules of its own would be a second set of
 * numbers for the same business, and the first time one of them moved the
 * two would disagree in public. This file has no `+`, no `/` and no
 * percentage in it on purpose.
 *
 * ── AND THE ENVELOPE IS THE ROLE'S, NOT THE PALETTE'S ──
 *
 * `orderListWhere` is the one that drops the claimable pool — «an agent's
 * list is the work she has taken and the work she typed, not the shelf she
 * may take from». It is the right envelope here for the same reason it is
 * the right one for `GET /api/orders`: a summary is a list of more than one
 * order, counted.
 *
 * So a staff member's summary can never be the store's. It is not filtered
 * down to hers afterwards — it is never asked store-wide in the first
 * place, because the predicate she is counted by carries her id.
 *
 * ── A CUSTOMER IS A COUNT HERE, NEVER A ROW ──
 *
 * Typing a phone number answers «how many orders does this number have, in
 * YOUR list» and nothing else: no name, no city, no order number comes
 * back. The number itself is not echoed either — see `PHONE_FACT`. That is
 * why the counter is reachable by everyone while the record search above it
 * stays the owner's alone: a count inside your own list tells you nothing
 * you could not have scrolled to.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** The orders screen's «المتأخرة» switch is 10 days. One number, one rule. */
export const LATE_DAYS = 10;

export interface PaletteFact {
  key: string;
  label: string;
  count: number;
  /**
   * HOW THIS NUMBER WAS COUNTED, IN WORDS.
   *
   * The brief's fifth line: «every number shows its rule». A figure with no
   * rule beside it is a figure somebody argues with — «متأخرة من إيمتى؟
   * من الإنشاء ولّا من الشحن؟» — and the answer used to live in a comment
   * in a file nobody with that question can open.
   */
  rule: string;
  /** The screen that lists exactly these rows, when one does. */
  href?: string;
}

export interface PaletteScope {
  companyId: string;
  storeId: string;
}

/**
 * Does this account read the whole store, or only its own work?
 *
 * Asked of `orders.view`'s SCOPE and not of a role name: the permission
 * engine is where «owner roles» is actually decided, and a list of role
 * strings here would drift from it the first time a custom role template
 * is granted company-wide visibility.
 */
export function readsTheWholeStore(user: SessionUser): boolean {
  return getPermissionScope(user, 'orders.view')?.scope === 'ALL_COMPANY';
}

/**
 * The tenant, the role's list envelope, and one predicate — as one `where`.
 *
 * Merged with `AND` rather than spread: `orderListWhere` returns an object
 * carrying `OR`, and so do two of the predicates. A spread would silently
 * drop one of them, which is exactly how an envelope stops enforcing
 * anything while still being in the code.
 */
export function paletteWhere(
  scope: PaletteScope,
  user: SessionUser,
  predicate: Record<string, unknown>
): Record<string, unknown> {
  return {
    AND: [
      { companyId: scope.companyId, storeId: scope.storeId },
      orderListWhere(user),
      predicate,
    ],
  };
}

/** The «متأخرة» clauses, taken from the orders list rather than rewritten. */
function latePredicate(): Record<string, unknown> {
  const built = ordersWhere(new URLSearchParams({ lateDays: String(LATE_DAYS) }));
  // `ok: false` is only reachable for a day count outside 1..365, and
  // `LATE_DAYS` is a constant in range — but a thrown error beats a silent
  // `{}`, which would count every order in the store as late.
  if (!built.ok) throw new Error(built.error);
  return built.where;
}

/** The words the palette counts by, and the rule each one stands for. */
const WORD_FACTS = {
  postponed: {
    words: ['مؤجل', 'مؤجّل', 'مؤجلة', 'مؤجّلة', 'تأجيل'],
    label: 'مؤجّلة',
    rule: 'حالتها «مؤجّل» — نفس شرط «الحالة: مؤجّل» في شاشة الطلبات',
    href: '/orders?state=POSTPONED',
    predicate: () => whereForState('POSTPONED') ?? { id: '__none__' },
  },
  late: {
    words: ['متأخر', 'متأخرة', 'تأخير', 'التأخير'],
    label: 'متأخرة',
    rule: `مرّ على شحنها ${LATE_DAYS} أيامٍ أو أكثر ولم تُقفل — من تاريخ الشحن لا الإنشاء، ونفس مفتاح «المتأخرة»`,
    href: '/orders?late=1',
    predicate: latePredicate,
  },
} as const;

export type WordFactKey = keyof typeof WORD_FACTS;

/** Which counter a typed word asks for, if any. */
export function wordFactFor(term: string): WordFactKey | null {
  const text = term.trim();
  if (!text) return null;
  for (const [key, fact] of Object.entries(WORD_FACTS)) {
    if (fact.words.some((w) => w.startsWith(text) || text.startsWith(w))) return key as WordFactKey;
  }
  return null;
}

/**
 * A PHONE IS ANSWERED WITH A NUMBER AND NOTHING ELSE.
 *
 * No name, no city, no order number, and not the phone itself: the label
 * and the rule are both fixed strings. A response that echoed the digits
 * would put a customer's phone into whatever logs, error reports and
 * browser histories the answer passes through, for a counter that does not
 * need it — the person who typed it is looking at it.
 */
const PHONE_FACT = {
  label: 'طلبات هذا الرقم',
  rule: 'كل طلبات هذا الهاتف — داخل نطاق قائمتك وحدها، ولا يخرج الرقم من الخادم',
} as const;

/** Four digits is the floor: fewer matches half the shop. */
const PHONE_MIN_DIGITS = 4;

/** Does this look like somebody typing a phone rather than a word? */
export function looksLikePhone(term: string): boolean {
  const text = term.trim();
  if (!text) return false;
  if (!/^[\d+\s()-]+$/.test(text)) return false;
  return text.replace(/\D/g, '').length >= PHONE_MIN_DIGITS;
}

/**
 * THE SUMMARY AN OPEN PALETTE SHOWS.
 *
 * Four counts every account gets about its own scope, and a fifth that
 * changes who it is about: the owner is told how many orders are held
 * across the store with nobody having rung the customer, and an agent is
 * told the same thing about her own desk — which is the number that
 * decides whether her next «اسحب» is refused.
 */
export async function paletteSummary(
  scope: PaletteScope,
  user: SessionUser,
  now = new Date()
): Promise<PaletteFact[]> {
  const wide = readsTheWholeStore(user);
  const { start, end } = getDateRange({ period: 'today' });
  const today =
    start && end ? { createdAt: { gte: start, lte: end } } : { createdAt: { lte: now } };

  const counted = (predicate: Record<string, unknown>) =>
    db.order.count({ where: paletteWhere(scope, user, predicate) });

  const [todayCount, newCount, postponedCount, lateCount, untouchedCount] = await Promise.all([
    counted(today),
    counted(whereForState('NEW') ?? { id: '__none__' }),
    counted(WORD_FACTS.postponed.predicate()),
    counted(latePredicate()),
    counted(heldWithoutAttemptWhere(scope, wide ? undefined : user.id)),
  ]);

  return [
    {
      key: 'today',
      label: 'طلبات اليوم',
      count: todayCount,
      rule: wide
        ? 'أُنشئت اليوم في هذا المتجر — نفس نافذة «اليوم» في لوحة التحكّم'
        : 'أُنشئت اليوم ضمن نطاق قائمتك — نفس نافذة «اليوم» في لوحة التحكّم',
      href: '/orders',
    },
    {
      key: 'new',
      label: 'جديدة لم يسحبها أحد',
      count: newCount,
      rule: 'حالتها «جديد» ولا أحد يحجزها — نفس شرط «الحالة: جديد» في شاشة الطلبات',
      href: '/orders?state=NEW',
    },
    {
      key: 'postponed',
      label: WORD_FACTS.postponed.label,
      count: postponedCount,
      rule: WORD_FACTS.postponed.rule,
      href: WORD_FACTS.postponed.href,
    },
    {
      key: 'late',
      label: WORD_FACTS.late.label,
      count: lateCount,
      rule: WORD_FACTS.late.rule,
      href: WORD_FACTS.late.href,
    },
    {
      key: 'untouched',
      label: wide ? 'محجوزة بلا أيّ محاولة اتصال' : 'بين يديك بلا محاولة اتصال',
      count: untouchedCount,
      rule: wide
        ? 'محجوزةٌ لموظّفٍ في هذا المتجر وما سُجِّلت عليها ولا محاولة اتصال — نفس شرط بوّابة السحب'
        : 'محجوزةٌ لك وما سجّلت عليها ولا محاولة اتصال — وهي التي تمنع سحب طلبٍ جديد',
      href: wide ? undefined : '/confirmation/mine',
    },
  ];
}

/**
 * THE COUNTERS A TYPED WORD ASKS FOR.
 *
 * Three questions share one door because they share one envelope: a word,
 * a product's name, a phone. Whatever the question, the `where` is built by
 * `paletteWhere` and the answer is an integer.
 */
export async function paletteCounts(
  scope: PaletteScope,
  user: SessionUser,
  term: string
): Promise<PaletteFact[]> {
  const text = term.trim();
  if (text.length < 2) return [];

  const counted = (predicate: Record<string, unknown>) =>
    db.order.count({ where: paletteWhere(scope, user, predicate) });

  if (looksLikePhone(text)) {
    const normalised = normalizePhoneNumber(text);
    const count = await counted({
      customer: {
        OR: [{ phone: typed(normalised || text) }, { rawPhone: typed(text) }],
      },
    });
    return [{ key: 'phone', label: PHONE_FACT.label, count, rule: PHONE_FACT.rule }];
  }

  const word = wordFactFor(text);
  if (word) {
    const fact = WORD_FACTS[word];
    const count = await counted(fact.predicate());
    return [{ key: word, label: fact.label, count, rule: fact.rule, href: fact.href }];
  }

  /*
   * A PRODUCT'S NAME IS NOT A CUSTOMER'S, so it travels both ways.
   *
   * Counted on `Order.productId` and not on the lines, because that is the
   * column the orders list filters by — so pressing the row shows a list
   * whose length is the number that was just printed.
   */
  //
  // And only the products this person may see, as the products list reads
  // them: none without «عرض المنتجات», and only their categories or named
  // products when that is their scope. The palette found any product of the
  // store by name, for anyone.
  const productScope = getPermissionScope(user, 'products.view');
  if (!productScope) return [];
  const narrowed =
    productScope.scope === 'CATEGORY'
      ? { categoryId: { in: idsOf(productScope.scopeIds) } }
      : productScope.scope === 'SPECIFIC'
        ? { id: { in: idsOf(productScope.scopeIds) } }
        : {};
  const products = await db.product.findMany({
    where: {
      companyId: scope.companyId,
      OR: [{ storeId: scope.storeId }, { storeId: null }],
      ...narrowed,
      name: typed(text),
    },
    orderBy: { name: 'asc' },
    take: 3,
    select: { id: true, name: true },
  });

  return Promise.all(
    products.map(async (product) => ({
      key: `product:${product.id}`,
      label: product.name,
      count: await counted({ productId: product.id }),
      rule: 'كل طلبٍ منتجه الأساسي هذا المنتج — داخل نطاق قائمتك',
      href: `/orders?productId=${encodeURIComponent(product.id)}`,
    }))
  );
}

/**
 * «لخّصلي اليوم» WITHOUT A MODEL.
 *
 * Not a fallback that apologises: it is the same five numbers in one
 * sentence, and it is what the screen shows whenever the route is not the
 * owner's own machine. A seller who never stands up a local model still
 * gets an answer — the model was only ever going to make it read better.
 */
export function fixedTodayLine(facts: PaletteFact[]): string {
  const of = (key: string) => facts.find((f) => f.key === key)?.count ?? 0;
  return [
    `اليوم: ${of('today')} طلباً جديداً في نطاقك.`,
    `${of('new')} لم يسحبها أحد، و${of('postponed')} مؤجّلة، و${of('late')} متأخرة عن الشحن.`,
    `و${of('untouched')} محجوزة بلا أيّ محاولة اتصال.`,
  ].join(' ');
}

/**
 * WHAT THE MODEL IS GIVEN: FIVE LABELS AND FIVE INTEGERS.
 *
 * No order number, no name, no phone, no address, no city. The payload is
 * built from `PaletteFact` and a `PaletteFact` cannot carry a person —
 * `label` is one of a handful of fixed Arabic strings, `count` is an
 * integer, and the phone counter's label is fixed precisely so this
 * function cannot ever stringify a customer into a prompt.
 *
 * It is sent with `localOnly: true` anyway, because a promise about a
 * payload is not a substitute for the guard. Both, and in that order.
 */
export function todayNumbersPrompt(facts: PaletteFact[]): string {
  return facts.map((f) => `${f.label}: ${f.count}`).join('\n');
}

export const TODAY_SYSTEM_PROMPT = [
  'أنت تكتب فقرةً عربيةً واحدةً قصيرة لمالك متجرٍ عن حالة عمل اليوم.',
  'لا تستعمل إلا الأرقام المعطاة لك. لا تُضف رقماً ولا نسبةً ولا تقديراً.',
  'لا تذكر أسماء أشخاص ولا أرقام هواتف ولا عناوين — لم تُعطَ أيّاً منها.',
  'جملتان أو ثلاث، بلا عناوين وبلا قوائم.',
].join('\n');

/** The ids of a CATEGORY/SPECIFIC scope, as strings. */
function idsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}
