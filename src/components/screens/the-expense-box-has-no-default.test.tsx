// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * AN EXPENSE FORM THAT OPENED PRE-FILLED AT 100 — THE WHOLE ROUND TRIP.
 *
 * `FinanceProfitScreen` held the amount of an expense as
 *
 *     const [amount, setAmount] = useState(100);
 *     onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
 *
 * The 100 is written NOWHERE on the server: `Expense.amount` is `Float`
 * with no `@default`, `prisma/seed.ts` only ever DELETES expenses, and the
 * door invents nothing. So opening the dialog, typing a title, choosing a
 * wallet and pressing «احفظ المصروف» recorded an expense of **100 that
 * nobody entered** — and expenses subtract from net profit, so this is
 * money out, with a matching 100 OUT of a wallet written in the same
 * transaction.
 *
 * And clearing the box did not undo it: `parseFloat('') || 0` is `0`, so
 * the box redrew as `0` and the browser answered the door's question before
 * the door could see it.
 *
 * THESE ASSERT THE JSON ON THE WIRE AND THE ROW HANDED TO PRISMA — never
 * the text of an expression — and they JOIN the two halves the way
 * `the-form-and-the-door-agree.test.tsx` does: the real form is rendered,
 * the body it actually sent is captured, and THAT EXACT BODY is handed to
 * the real `POST /api/finance`.
 *
 *   · dialog opened, nothing typed in the box → `amount` ABSENT → 400 «المبلغ مطلوب»
 *   · a typed 1500.75                         → the characters → 200, row `amount: 1500.75`
 *   · a typed 0                               → the characters → 400, and 0 is refused BY NAME
 *   · the box filled then cleared             → absent again → 400
 *   · an API client sending `'2,500'`         → 400, and NOT an expense of 2
 *
 * Restore the `100` and the first test reads `100` where it expects the key
 * to be missing; restore `parseFloat(…) || 0` and the fourth reads `0`.
 */

/* ── the door's dependencies ───────────────────────────────────────────── */

const { db, requireContext, requirePermission, logAudit, commissionCostForOrders, getCompanyAnalytics } = vi.hoisted(
  () => ({
    db: {
      expense: { findMany: vi.fn(), groupBy: vi.fn(), create: vi.fn(), update: vi.fn() },
      order: { findMany: vi.fn() },
      wallet: { findFirst: vi.fn() },
      walletMovement: { create: vi.fn() },
      $transaction: vi.fn(),
    },
    requireContext: vi.fn(),
    requirePermission: vi.fn(),
    logAudit: vi.fn(),
    commissionCostForOrders: vi.fn(),
    getCompanyAnalytics: vi.fn(),
  })
);

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/commission', () => ({
  commissionCostForOrders: (...a: unknown[]) => commissionCostForOrders(...a),
}));

/* ── the screen's dependencies ─────────────────────────────────────────── */

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ t: { cancel: 'إلغاء' }, locale: 'ar' }) }));

import { POST as FINANCE } from '@/app/api/finance/route';
import { FinanceProfitScreen } from './FinanceProfitScreen';

const WALLET = { id: 'w-1', name: 'الصندوق', currencyCode: 'SYP' };

/** Every non-GET body the screen sent, in order. */
let sent: { url: string; body: any }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  sent = [];

  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'سامر' },
    companyId: 'c1',
    storeId: 's1',
    country: { currencyCode: 'SYP', minorUnit: 2 },
  });
  requirePermission.mockResolvedValue(undefined);
  db.wallet.findFirst.mockResolvedValue({ ...WALLET });
  db.expense.create.mockImplementation(async ({ data }: any) => ({ id: 'exp-1', ...data }));
  db.walletMovement.create.mockImplementation(async ({ data }: any) => ({ id: 'mv-1', ...data }));
  db.expense.update.mockImplementation(async ({ data }: any) => ({ id: 'exp-1', ...data }));
  db.$transaction.mockImplementation(async (fn: any) =>
    fn({ expense: db.expense, walletMovement: db.walletMovement })
  );

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        // The screen only needs a shape back. The DOOR's answer comes from
        // the real handler below, never from this stub.
        return new Response(JSON.stringify({ success: true, expense: { id: 'exp-1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.startsWith('/api/finance/wallets')) {
        return new Response(JSON.stringify({ wallets: [WALLET] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.startsWith('/api/finance/profitability')) {
        return new Response(JSON.stringify({ products: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          currency: 'SYP',
          summary: null,
          expenses: [],
          recentDeliveredOrders: [],
          spend: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ── driving the real form ─────────────────────────────────────────────── */

/** The only `type="number"` box in the dialog: the amount. */
const amountBox = () =>
  document.querySelector('input[type="number"][step="0.01"]') as HTMLInputElement;

/**
 * Open the expense dialog, do `fill`, submit, and return THE BODY SENT.
 *
 * `noValidate` is set for the same reason the production round trip sets
 * it: `required` is the browser's own guard and what is under test is the
 * door, which any client without constraint validation reaches directly.
 */
async function bodyFor(fill: (u: ReturnType<typeof userEvent.setup>) => Promise<void>) {
  const user = userEvent.setup();
  render(<FinanceProfitScreen />);
  await user.click(await screen.findByText('سجّل مصروفاً'));
  await waitFor(() => expect(amountBox()).toBeTruthy());
  // The wallet list arrives by its own fetch; the option must exist before
  // it can be chosen.
  await waitFor(() => expect(screen.getByText(`${WALLET.name} (${WALLET.currencyCode})`)).toBeTruthy());

  await user.type(screen.getByPlaceholderText('مثلاً: حملة تيك توك رقم 4'), 'إعلان سبتمبر');
  await user.selectOptions(screen.getByDisplayValue('اختر المحفظة…'), WALLET.id);
  await fill(user);

  const save = screen.getByText('احفظ المصروف');
  (save.closest('form') as HTMLFormElement).noValidate = true;
  await user.click(save);
  await waitFor(() => expect(sent).toHaveLength(1));
  return sent[0].body;
}

/* ── handing the captured body to the real door ────────────────────────── */

const atTheDoor = (body: unknown) =>
  FINANCE(
    new Request('http://localhost/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

/** The `data` the expense row was created with. */
const createdExpense = () => db.expense.create.mock.calls[0][0].data;
/** The `data` the wallet movement was created with. */
const createdMovement = () => db.walletMovement.create.mock.calls[0][0].data;
/**
 * Every amount that reached Prisma, in order — so a refusal that stopped
 * working names THE NUMBER it let through (2 for `'2,500'`, 16 for
 * `'0x10'`) rather than only a status code.
 */
const writtenAmounts = () => db.expense.create.mock.calls.map((c: any) => c[0].data.amount);

/* ════════════════════════════════════════════════════════════════════════
   THE BROWSER HALF — what the box puts on the wire.
   ════════════════════════════════════════════════════════════════════════ */

describe('the amount box opens empty and sends nothing when nothing was typed', () => {
  it('opens with an empty box — there is no default amount', async () => {
    const user = userEvent.setup();
    render(<FinanceProfitScreen />);
    await user.click(await screen.findByText('سجّل مصروفاً'));
    await waitFor(() => expect(amountBox()).toBeTruthy());
    expect(amountBox().value, 'الخانة فُتِحَت وفيها رقمٌ لم يَكتُبْه أحد').toBe('');
  });

  it('and sends the key ABSENT, not 100 and not 0', async () => {
    const body = await bodyFor(async () => {});
    // The number first, so a regression names it rather than naming a key.
    expect(body.amount, 'المئةُ المخترَعةُ عادت إلى السلك').not.toBe(100);
    expect(body.amount).not.toBe(0);
    expect('amount' in body, 'خانةٌ فارغةٌ أرسلت قيمةً').toBe(false);
    expect(body.amount).toBeUndefined();
    // And the rest of the form is intact, so the absence is the amount's
    // own and not a broken submit.
    expect(body.title).toBe('إعلان سبتمبر');
    expect(body.walletId).toBe(WALLET.id);
  });

  it('sends the CHARACTERS of a typed amount, not a number it re-derived', async () => {
    const body = await bodyFor(async (u) => {
      await u.type(amountBox(), '1500.75');
    });
    expect(body.amount).toBe('1500.75');
  });

  it('and a box filled then cleared is absent again, never a typed zero', async () => {
    const body = await bodyFor(async (u) => {
      await u.type(amountBox(), '340');
      await u.clear(amountBox());
    });
    expect('amount' in body, 'خانةٌ مُفرَّغةٌ أرسلت صفراً').toBe(false);
    expect(body.amount).not.toBe(0);
  });

  it('and clears itself after a saved expense, so the next one starts from nothing', async () => {
    const user = userEvent.setup();
    render(<FinanceProfitScreen />);
    await user.click(await screen.findByText('سجّل مصروفاً'));
    await waitFor(() => expect(amountBox()).toBeTruthy());
    await waitFor(() => expect(screen.getByText(`${WALLET.name} (${WALLET.currencyCode})`)).toBeTruthy());
    await user.type(screen.getByPlaceholderText('مثلاً: حملة تيك توك رقم 4'), 'إعلان سبتمبر');
    await user.selectOptions(screen.getByDisplayValue('اختر المحفظة…'), WALLET.id);
    await user.type(amountBox(), '340');
    const save = screen.getByText('احفظ المصروف');
    (save.closest('form') as HTMLFormElement).noValidate = true;
    await user.click(save);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body.amount).toBe('340');

    // Reopened: the 340 of the expense just recorded must not be sitting
    // there waiting to be saved a second time.
    await user.click(screen.getByText('سجّل مصروفاً'));
    await waitFor(() => expect(amountBox()).toBeTruthy());
    expect(amountBox().value, 'مبلغُ المصروفِ السابقِ بقيَ في الخانة').toBe('');
  });

  it('sends a typed zero as the characters «0» — the door, not the browser, refuses it', async () => {
    const body = await bodyFor(async (u) => {
      await u.type(amountBox(), '0');
    });
    expect(body.amount).toBe('0');
  });
});

/* ════════════════════════════════════════════════════════════════════════
   THE ROUND TRIP — that same body, at the real door.
   ════════════════════════════════════════════════════════════════════════ */

describe('the refusal reaches the form that sends it', () => {
  it('an untouched amount box is refused, in Arabic, and nothing is written', async () => {
    const body = await bodyFor(async () => {});
    const res = await atTheDoor(body);
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toBe('المبلغ مطلوب');
    expect(db.expense.create).not.toHaveBeenCalled();
    expect(db.walletMovement.create).not.toHaveBeenCalled();
    // Nothing was spent on a request that was never going to be stored.
    expect(db.wallet.findFirst).not.toHaveBeenCalled();
  });

  it('a cleared box is refused the same way — it used to be a legitimate zero', async () => {
    const body = await bodyFor(async (u) => {
      await u.type(amountBox(), '340');
      await u.clear(amountBox());
    });
    const res = await atTheDoor(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('المبلغ مطلوب');
    expect(db.expense.create).not.toHaveBeenCalled();
  });

  it('a legitimate amount goes through, and the row carries the number digit for digit', async () => {
    const body = await bodyFor(async (u) => {
      await u.type(amountBox(), '1500.75');
    });
    const res = await atTheDoor(body);
    expect(res.status).toBe(200);
    expect(createdExpense().amount).toBe(1500.75);
    expect(typeof createdExpense().amount).toBe('number');
    expect(createdExpense().title).toBe('إعلان سبتمبر');
    expect(createdExpense().walletId).toBe(WALLET.id);
    // The money that left the wallet is the same number, not a second one.
    expect(createdMovement().amount).toBe(1500.75);
    expect(createdMovement().direction).toBe('OUT');
  });

  it('a typed zero is refused by name — not with «مطلوب», which is the opposite of what is wrong', async () => {
    const body = await bodyFor(async (u) => {
      await u.type(amountBox(), '0');
    });
    const res = await atTheDoor(body);
    expect(writtenAmounts(), 'مصروفٌ بصفرٍ سُجِّل، ومعه حركةُ محفظةٍ بصفر').toEqual([]);
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain('أكبر من صفر');
    // «مطلوب» is what the old `!amount` guard said about a 0 that ARRIVED.
    expect(error).not.toBe('المبلغ مطلوب');
    expect(error).not.toBe('العنوان والفئة والمبلغ مطلوبة');
    expect(db.walletMovement.create).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════
   THE DOOR ON ITS OWN — what no `type="number"` box can send.

   `509306a` corrected a claim worth keeping corrected: a decimal comma
   CANNOT be typed into `<input type="number">` — the browser drops it. So
   `'2,500'` is an API-CLIENT case, not a form case, and it is tested here
   rather than through the form, because a test that pretended a comma
   reached the wire would be a test of nothing.
   ════════════════════════════════════════════════════════════════════════ */

const SOUND = { title: 'إيجار المستودع', category: 'OFFICE', walletId: WALLET.id };

describe('an amount that is not a number is refused rather than truncated', () => {
  it("'2,500' is refused — `parseFloat` stored an expense of 2", async () => {
    const res = await atTheDoor({ ...SOUND, amount: '2,500' });
    expect(writtenAmounts(), 'مبلغٌ مقتطَعٌ عند الفاصلة وصل إلى العمود').toEqual([]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('المبلغ');
    expect(db.walletMovement.create).not.toHaveBeenCalled();
  });

  it("'12abc' is refused — `parseFloat` stored 12", async () => {
    const res = await atTheDoor({ ...SOUND, amount: '12abc' });
    expect(writtenAmounts(), 'مبلغٌ مقتطَعٌ عند أوّلِ حرفٍ وصل إلى العمود').toEqual([]);
    expect(res.status).toBe(400);
  });

  it("'0x10' is refused — a hand-rolled `Number()` reader stores 16", async () => {
    const res = await atTheDoor({ ...SOUND, amount: '0x10' });
    expect(writtenAmounts(), 'سلسلةٌ ست عشريّةٌ صارت مبلغاً').toEqual([]);
    expect(res.status).toBe(400);
  });

  it('and every other shape that used to become a plausible figure', async () => {
    for (const bad of [null, '', '   ', [], {}, true, false, NaN, Infinity, -Infinity, '1e400', 'NaN']) {
      vi.clearAllMocks();
      db.$transaction.mockImplementation(async (fn: any) =>
        fn({ expense: db.expense, walletMovement: db.walletMovement })
      );
      const res = await atTheDoor({ ...SOUND, amount: bad });
      expect(res.status, `${JSON.stringify(bad)} مرّ من الباب`).toBe(400);
      expect(db.expense.create, `${JSON.stringify(bad)} كُتِب`).not.toHaveBeenCalled();
    }
  });

  /*
   * THE `!amount` CONFLATION, STATED AS A VALUE.
   *
   * The old guard was `!title || !category || !amount`, and `!0` is `true`,
   * so a client sending the NUMBER `0` — a deliberate «this cost nothing» —
   * was told «العنوان والفئة والمبلغ مطلوبة»: three fields named, one of
   * them not even wrong, and the reader sent looking for an empty box they
   * had just filled in. Zero is still refused; it is refused for its own
   * reason, in its own sentence.
   */
  it('a numeric zero is refused for being zero, not for being missing', async () => {
    const res = await atTheDoor({ ...SOUND, amount: 0 });
    expect(writtenAmounts()).toEqual([]);
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain('أكبر من صفر');
    expect(error, 'صفرٌ وصل فقيل له «مطلوب»').not.toBe('العنوان والفئة والمبلغ مطلوبة');
    expect(error).not.toBe('المبلغ مطلوب');
  });

  it('a negative amount is refused — an expense is not a refund', async () => {
    const res = await atTheDoor({ ...SOUND, amount: -250 });
    expect(res.status).toBe(400);
    expect(db.expense.create).not.toHaveBeenCalled();
  });

  /*
   * THE CEILING IS THE SIBLING DOOR'S CEILING, NOT A NEW OPINION.
   * `finance/wallets/[id]/movements` and `finance/transfers` both declare
   * `z.number().positive().max(1_000_000_000)`, and this door writes a
   * movement into that same table — so an expense this door accepts and
   * that door would refuse is one rule with two answers.
   */
  it('refuses an amount past the ceiling the wallet doors already declare', async () => {
    const res = await atTheDoor({ ...SOUND, amount: 1_000_000_001 });
    expect(writtenAmounts()).toEqual([]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('1000000000');
  });

  it('and accepts the ceiling itself — the bound is inclusive at both doors', async () => {
    const res = await atTheDoor({ ...SOUND, amount: 1_000_000_000 });
    expect(res.status).toBe(200);
    expect(createdExpense().amount).toBe(1_000_000_000);
  });

  it('and a number written as a number still goes through, from a number or a string', async () => {
    const res = await atTheDoor({ ...SOUND, amount: 250 });
    expect(res.status).toBe(200);
    expect(createdExpense().amount).toBe(250);
  });

  it('a string the way a number is written is read as that number — a query-string client', async () => {
    const res = await atTheDoor({ ...SOUND, amount: ' 250.5 ' });
    expect(res.status).toBe(200);
    expect(createdExpense().amount).toBe(250.5);
  });
});

describe('the title and the category keep their own refusals', () => {
  it('a missing title is refused without blaming the amount', async () => {
    const res = await atTheDoor({ category: 'OFFICE', walletId: WALLET.id, amount: 100 });
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toBe('العنوان والفئة مطلوبان');
    expect(error).not.toContain('المبلغ');
    expect(db.expense.create).not.toHaveBeenCalled();
  });

  it('and a missing wallet is still refused after a sound amount', async () => {
    const res = await atTheDoor({ title: 'إيجار', category: 'OFFICE', amount: 100 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('اختر المحفظة التي خرج منها المال');
    expect(db.expense.create).not.toHaveBeenCalled();
  });
});
