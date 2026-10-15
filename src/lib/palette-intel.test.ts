import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/types/auth';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE PALETTE ANSWERS, AND IT ANSWERS ABOUT THE RIGHT PERSON.
 *
 * Ctrl+K opens on numbers now. That is three new ways to get a privacy
 * rule wrong, and each one has a claim here:
 *
 *   1. A STAFF SUMMARY IS NEVER STORE-WIDE. The easy way to build this is
 *      to count the store and subtract — or to count the store and let the
 *      screen choose a wording. Then the figure is already in the browser
 *      and the rule is a label. So the question is asked of the `where`:
 *      every count an agent causes must carry her id.
 *
 *   2. A PHONE STAYS INSIDE HER LIST. A counter that answers «هذا الرقم
 *      عنده ٤ طلبات» about orders she may not open is a customer-lookup
 *      box for everybody, which is exactly the thing the header's old
 *      search was kept narrow to avoid.
 *
 *   3. AND A NUMBER IS ONLY A NUMBER. Nothing this file produces may carry
 *      a name, a phone, an address or an order number — because what it
 *      produces is what «لخّصلي اليوم» hands to a model.
 *
 * ASKED OF THE `where`, NOT OF THE WORDING. A test that checked the Arabic
 * label said «موظّف» would have passed on a version that counted the whole
 * store and printed «عملك الآن» over it.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db } = vi.hoisted(() => ({
  db: {
    order: { count: vi.fn() },
    product: { findMany: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

/*
 * The scope comes off the user, so one `__scope` string stands for a whole
 * role template. `ALL_COMPANY` is what the permission engine answers for an
 * owner; `ASSIGNED` is a confirmation agent; `null` is an account with no
 * `orders.view` grant at all.
 */
vi.mock('./authorization', () => ({
  can: () => true,
  requirePermission: vi.fn(),
  getPermissionScope: (u: SessionUser & { __scope?: string }) =>
    u.__scope ? { scope: u.__scope } : null,
}));

const {
  LATE_DAYS,
  fixedTodayLine,
  looksLikePhone,
  paletteCounts,
  paletteSummary,
  paletteWhere,
  readsTheWholeStore,
  todayNumbersPrompt,
  wordFactFor,
} = await import('./palette-intel');

const SCOPE = { companyId: 'c1', storeId: 's1' };

const user = (scope: string | null, id = 'u1'): SessionUser =>
  ({ id, status: 'ACTIVE', role: 'CUSTOM', ...(scope ? { __scope: scope } : {}) }) as unknown as SessionUser;

const OWNER = user('ALL_COMPANY', 'owner1');
const AGENT = user('ASSIGNED', 'agent1');
const MODERATOR = user('OWN', 'mod1');

/** Every `where` the module put to the database in this test, as JSON. */
const everyWhere = () =>
  db.order.count.mock.calls.map((call: unknown[]) =>
    JSON.stringify((call[0] as { where: unknown }).where)
  );

beforeEach(() => {
  vi.clearAllMocks();
  db.order.count.mockResolvedValue(3);
  db.product.findMany.mockResolvedValue([]);
});

describe('a staff summary is never the store’s', () => {
  it('because every count an agent causes carries her own id', async () => {
    await paletteSummary(SCOPE, AGENT);
    const wheres = everyWhere();
    expect(wheres.length, 'لم يُسأل شيء — فحصٌ على لا شيء لا يثبت شيئاً').toBe(5);
    for (const where of wheres) {
      expect(where, `عدٌّ بلا هويّة الموظّف:\n${where}`).toContain('agent1');
    }
  });

  it('and the owner’s counts name no person at all', async () => {
    await paletteSummary(SCOPE, OWNER);
    const wheres = everyWhere();
    expect(wheres.length).toBe(5);
    for (const where of wheres) {
      expect(where, `عدُّ المالك مقيَّدٌ بشخص:\n${where}`).not.toContain('owner1');
    }
  });

  it('and «محجوزة بلا محاولة اتصال» is the store’s for the owner and the desk’s for the agent', async () => {
    /*
     * The one count whose SUBJECT changes with the role, and the reason the
     * brief names it: for the owner it is «somebody is sitting on orders
     * nobody has rung», for the agent it is the number that will refuse her
     * next «اسحب». Same predicate, two holders — `heldWithoutAttemptWhere`.
     */
    await paletteSummary(SCOPE, OWNER);
    const ownerHeld = everyWhere().find((w: string) => w.includes('contactAttempts'));
    expect(ownerHeld, 'ما سُئل سؤال «بلا محاولة اتصال» أصلاً').toBeTruthy();
    expect(ownerHeld, 'المالك سُئل عن مكتب شخصٍ واحد').toContain('"not":null');

    vi.clearAllMocks();
    db.order.count.mockResolvedValue(3);
    await paletteSummary(SCOPE, AGENT);
    const agentHeld = everyWhere().find((w: string) => w.includes('contactAttempts'));
    expect(agentHeld, 'الموظّفة سُئلت عن المتجر كلّه').toContain('"claimedById":"agent1"');
  });

  it('and a moderator who only sees what he typed is counted by that and nothing else', async () => {
    await paletteSummary(SCOPE, MODERATOR);
    for (const where of everyWhere()) {
      expect(where, `نطاقُ المودريتور اتّسع:\n${where}`).toContain('mod1');
    }
  });

  it('and an account with no orders grant at all is counted on an impossible id', async () => {
    // `orderListWhere` answers `{ id: '__no_access__' }` rather than `{}`.
    // The difference between those two is the whole store.
    await paletteSummary(SCOPE, user(null));
    for (const where of everyWhere()) {
      expect(where).toContain('__no_access__');
    }
  });

  it('and the tenant is in every one of them, beside the role’s envelope', async () => {
    await paletteSummary(SCOPE, AGENT);
    for (const where of everyWhere()) {
      expect(where).toContain('"companyId":"c1"');
      expect(where).toContain('"storeId":"s1"');
    }
  });
});

describe('the envelope is merged, never spread', () => {
  it('because two objects carrying OR would silently eat each other', () => {
    /*
     * `orderListWhere` returns `{ OR: [...] }` for an agent, and so do two
     * of the predicates. `{ ...envelope, ...predicate }` keeps ONE `OR` —
     * whichever was written last — and the lost one is usually the
     * envelope. That is not a narrower query; it is no query at all.
     */
    const where = paletteWhere(SCOPE, AGENT, { OR: [{ confirmationStatus: 'POSTPONED' }] });
    const and = where.AND as Record<string, unknown>[];
    expect(and, 'الشرطُ لم يُدمج بـAND').toBeInstanceOf(Array);
    expect(and.length).toBe(3);
    expect(JSON.stringify(and[1]), 'مظروفُ الدور ضاع').toContain('agent1');
    expect(JSON.stringify(and[2])).toContain('POSTPONED');
  });
});

describe('a phone is answered inside her own list, and nowhere else', () => {
  it('and the answer is one integer with no customer in it', async () => {
    db.order.count.mockResolvedValue(4);
    const facts = await paletteCounts(SCOPE, AGENT, '0791234567');
    expect(facts.length).toBe(1);
    expect(facts[0].count).toBe(4);
    const printed = JSON.stringify(facts[0]);
    expect(printed, 'الرقم رجع في الجواب').not.toContain('0791234567');
    expect(printed, 'ولا جزءٌ منه').not.toContain('079');
  });

  it('and the question it asked the database carried her envelope', async () => {
    await paletteCounts(SCOPE, AGENT, '0791234567');
    const asked = everyWhere()[0];
    expect(asked, 'بحثُ الهاتف خرج عن نطاق قائمتها').toContain('agent1');
    expect(asked).toContain('"companyId":"c1"');
  });

  it('and it is a phone only when it reads like one', () => {
    // «مؤجل» is not a phone, and neither is a product called «كريم 2».
    expect(looksLikePhone('0791234567')).toBe(true);
    expect(looksLikePhone('+962 79 123 4567')).toBe(true);
    expect(looksLikePhone('مؤجل')).toBe(false);
    expect(looksLikePhone('كريم 2')).toBe(false);
    expect(looksLikePhone('079')).toBe(false);
  });
});

describe('the words it counts by', () => {
  it('are the two the brief names, however they are spelled', () => {
    for (const word of ['مؤجل', 'مؤجّل', 'مؤجلة', 'تأجيل']) {
      expect(wordFactFor(word), `«${word}» لا يُحسب مؤجّلاً`).toBe('postponed');
    }
    for (const word of ['متأخر', 'متأخرة', 'تأخير']) {
      expect(wordFactFor(word), `«${word}» لا يُحسب متأخراً`).toBe('late');
    }
    expect(wordFactFor('كريم'), 'اسمُ منتجٍ عُدَّ كلمةَ حالة').toBeNull();
  });

  it('and «متأخر» is the orders screen’s own ten days, not a number of its own', async () => {
    // The screen sends `lateDays=10` in three places in `OrdersScreen.tsx`.
    // A palette with eleven here would print a different number for the
    // same word on two screens.
    expect(LATE_DAYS).toBe(10);
    const facts = await paletteCounts(SCOPE, OWNER, 'متأخر');
    expect(facts[0].rule).toContain('10');
    // From the SHIPPING date: measured from creation, an order that waited
    // a week to be confirmed showed as late and the courier was blamed.
    expect(facts[0].rule).toContain('الشحن');
    expect(everyWhere()[0]).toContain('shippedAt');
  });

  it('and a product’s name comes back, because a product is not a person', async () => {
    db.product.findMany.mockResolvedValue([{ id: 'p1', name: 'كريم الأذن' }]);
    db.order.count.mockResolvedValue(7);
    const facts = await paletteCounts(SCOPE, OWNER, 'كريم');
    expect(facts).toEqual([
      expect.objectContaining({ label: 'كريم الأذن', count: 7, href: '/orders?productId=p1' }),
    ]);
    // The catalogue is this store's, not the company's every store.
    expect(JSON.stringify(db.product.findMany.mock.calls[0][0].where)).toContain('s1');
  });

  it('and one letter asks nothing of the database', async () => {
    expect(await paletteCounts(SCOPE, OWNER, 'ك')).toEqual([]);
    expect(db.order.count, 'حرفٌ واحدٌ أطلق استعلاماً').not.toHaveBeenCalled();
  });
});

describe('every number shows its rule', () => {
  it('on all five of the summary’s counts', async () => {
    const facts = await paletteSummary(SCOPE, OWNER);
    for (const fact of facts) {
      expect(fact.rule.trim().length, `«${fact.label}» رقمٌ بلا قاعدة`).toBeGreaterThan(20);
    }
  });

  it('and the wording says whose numbers they are', async () => {
    const mine = await paletteSummary(SCOPE, AGENT);
    const store = await paletteSummary(SCOPE, OWNER);
    expect(mine.find((f) => f.key === 'untouched')!.label, 'لم تُنسب الأرقام لصاحبها').toContain('بين يديك');
    expect(store.find((f) => f.key === 'untouched')!.label).not.toContain('بين يديك');
  });

  it('and `readsTheWholeStore` is asked of the grant, not of a role name', () => {
    // A list of role strings here would drift from the permission engine
    // the first time a custom template is granted company-wide visibility.
    expect(readsTheWholeStore(OWNER)).toBe(true);
    expect(readsTheWholeStore(AGENT)).toBe(false);
    expect(readsTheWholeStore(user(null))).toBe(false);
  });
});

describe('what «لخّصلي اليوم» is allowed to hand a model', () => {
  it('is five fixed labels and five integers — nothing else exists to send', async () => {
    const facts = await paletteSummary(SCOPE, OWNER);
    const prompt = todayNumbersPrompt(facts);
    // Every line is «label: integer». A line that could carry anything else
    // is a line that will, the first time somebody adds a field.
    for (const line of prompt.split('\n')) {
      expect(line, `سطرٌ ليس «تسمية: رقم»: ${line}`).toMatch(/^[^:]+: \d+$/);
    }
    expect(prompt.split('\n').length).toBe(5);
  });

  it('and nothing a customer could be recognised by can reach it', async () => {
    db.order.count.mockResolvedValue(2);
    const facts = await paletteSummary(SCOPE, AGENT);
    const prompt = todayNumbersPrompt(facts);
    expect(prompt).not.toMatch(/\d{7,}/); // a phone
    expect(prompt).not.toMatch(/ORD-/i); // an order number
    expect(prompt).not.toContain('agent1'); // not even the asker's id
  });

  it('and the phone counter’s own label is a constant, so it cannot carry one', async () => {
    const facts = await paletteCounts(SCOPE, AGENT, '0791234567');
    expect(todayNumbersPrompt(facts)).toBe('طلبات هذا الرقم: 3');
  });

  it('and without a model the same five numbers are the answer, not an apology', async () => {
    const facts = await paletteSummary(SCOPE, OWNER);
    const line = fixedTodayLine(facts);
    // Five counts of 3, in one Arabic sentence, with no «تعذّر» in it.
    expect(line).toContain('3');
    expect(line, 'الجواب البديل اعتذار لا رقم').not.toMatch(/تعذّر|تعذر|خطأ/);
    expect(line.length).toBeGreaterThan(40);
  });
});
