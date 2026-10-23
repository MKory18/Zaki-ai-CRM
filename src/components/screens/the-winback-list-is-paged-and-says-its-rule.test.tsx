// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/lib/guard-source';
import { DEFAULT_WINBACK_RULE, type WinbackRule } from '@/lib/winback';

/**
 * «استرجاع الملغى — اعملو صفحات + فلاتر + بحث، والأهم شو القاعدة تبعو لاني ممكن
 * اعدلها». THE SCREEN, AS A LIST READ IN PAGES THAT SAYS ITS OWN RULE.
 *
 * What the screen owes, beyond drawing:
 *
 *   • it opens on the work (the orders ready to call), 25 to a page, and says
 *     where the page stands;
 *   • the RULE is printed on it, from the rule the server is applying right now,
 *     with «عدّل القاعدة» beside it for whoever may change it — and for nobody
 *     else;
 *   • a view, four dropdowns and a search box, each with the SERVER'S number
 *     beside the words, and only what was chosen is asked;
 *   • every row that is not offered says WHICH rule put it there;
 *   • «اعرضه من جديد» refuses a discount above the ceiling before any request,
 *     and after an offer reloads the page the reader is ON;
 *   • and a saved rule moves orders between the views, so the list starts again.
 */

const { api, toast, ask, tell } = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { done: vi.fn(), failed: vi.fn() },
  ask: vi.fn(),
  tell: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({ apiJson: (...a: unknown[]) => api(...a) }));
vi.mock('@/hooks/useMayOpen', () => ({ useMayOpen: () => () => true }));
vi.mock('@/components/shell/ScreenTitle', () => ({
  ScreenTitle: ({ note }: { note?: string }) => <p data-testid="note">{note}</p>,
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => toast }));
vi.mock('@/components/ui/Confirm', () => ({ useAsk: () => ask, useTell: () => tell }));

import { WinbackScreen } from './WinbackScreen';

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  orderNumber: `ORD-${id}`,
  customer: { fullName: 'عميل تجريبي', phone: '0790000000' },
  product: 'ساعة',
  quantity: 2,
  sellingPrice: 40,
  discountAmount: 0,
  rejectionReason: 'PRICE_TOO_HIGH',
  rejectionNote: null,
  rejectedAt: '2026-09-20T10:00:00.000Z',
  verdict: { eligible: true, dueAt: '2026-10-04T10:00:00.000Z', maxDiscount: 10 },
  ...over,
});

const FACTS = {
  views: { ready: 12, cooling: 5, skipped: 30 },
  reasons: [
    { reason: 'PRICE_TOO_HIGH', count: 8 },
    { reason: 'CUSTOMER_CHANGED_MIND', count: 4 },
  ],
  products: [
    { name: 'ساعة', count: 6 },
    { name: 'حقيبة', count: 3 },
  ],
  periods: { '7': 2, '30': 6, '90': 12 },
};

/** What the route says right now — a saved rule changes it before the screen asks again. */
let rule: WinbackRule;
let canEdit: boolean;
let facts: typeof FACTS;
let total: number;
let rowsOf: (page: number) => ReturnType<typeof row>[];
let getFails: boolean;
let postFails: Error | null;

const gets = () =>
  api.mock.calls
    .filter((c) => !(c[1] && (c[1] as RequestInit).method))
    .map((c) => new URL(c[0] as string, 'http://x').searchParams);
const posts = () => api.mock.calls.filter((c) => c[1] && (c[1] as RequestInit).method === 'POST');
const puts = () => api.mock.calls.filter((c) => c[1] && (c[1] as RequestInit).method === 'PUT');
const lastAsked = () => gets().at(-1)!;

beforeEach(() => {
  vi.clearAllMocks();
  rule = { ...DEFAULT_WINBACK_RULE, reasons: [...DEFAULT_WINBACK_RULE.reasons] };
  canEdit = true;
  facts = structuredClone(FACTS);
  total = 60;
  rowsOf = (page) => [row(`P${page}`)];
  getFails = false;
  postFails = null;
  ask.mockResolvedValue('10');
  api.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      rule = {
        reasons: body.reasons,
        coolingDays: body.coolingDays,
        lookbackDays: body.lookbackDays,
        maxDiscountShare: body.maxDiscountPercent / 100,
      };
      return { rule };
    }
    if (init?.method === 'POST') {
      if (postFails) throw postFails;
      return { success: true, order: { orderNumber: 'ORD-NEW' } };
    }
    if (getFails && gets().length === 1) throw new Error('تعذّر التحميل');
    const q = new URL(url, 'http://x').searchParams;
    const totalPages = Math.max(1, Math.ceil(total / 25));
    const page = Math.min(Number(q.get('page')), totalPages);
    return {
      rows: total === 0 ? [] : rowsOf(page),
      pagination: { total, page, limit: 25, totalPages },
      facts,
      rule,
      canEditRule: canEdit,
    };
  });
});
afterEach(() => cleanup());

const draw = async () => {
  render(<WinbackScreen />);
  await screen.findByLabelText('الحالة');
};
const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const search = () => screen.getByRole('textbox', { name: /بحث برقم الطلب/ }) as HTMLInputElement;
const pagerSentence = (found: boolean) =>
  (found ? screen.getByText : screen.queryByText)((_, el) => el?.tagName === 'SPAN' && /^عرض \d+ من \d+ طلب$/.test(el.textContent ?? ''));
const options = (label: string) => within(screen.getByLabelText(label)).getAllByRole('option').map((o) => o.textContent);

describe('opening it', () => {
  it('— asks for the work (the view that is ready), page one, 25 to a page, and nothing else', async () => {
    await draw();
    expect(gets()).toHaveLength(1);
    expect(gets()[0].toString()).toBe('view=ready&page=1&limit=25');
  });

  it('and draws the row, and a page bar that says where the page stands', async () => {
    await draw();
    expect(screen.getByText('ORD-P1')).toBeTruthy();
    expect(pagerSentence(true)!.textContent).toBe('عرض 1 من 60 طلب');
    expect(screen.getByText('صفحة 1 من 3')).toBeTruthy();
  });

  it('and a first load that fails says so, and draws nothing else', async () => {
    getFails = true;
    render(<WinbackScreen />);
    expect(await screen.findByText('تعذّر التحميل')).toBeTruthy();
    expect(screen.queryByLabelText('الحالة')).toBeNull();
    expect(screen.queryByText('القاعدة')).toBeNull();
  });

  it('and nothing is «chosen» on opening — the view it opens on is not a filter, so no «إعادة تعيين»', async () => {
    await draw();
    expect(screen.queryByRole('button', { name: /إعادة تعيين/ })).toBeNull();
  });
});

describe('the rule, printed on the screen', () => {
  it('— the default rule, in one sentence, from what the server says it is applying', async () => {
    await draw();
    const sentence = screen.getByText(/^ملغى · لم يُشحن/).textContent!;
    expect(sentence).toBe(
      'ملغى · لم يُشحن · لم يُعرض عليه من قبل · السبب: السعر مرتفع، وجدها أرخص عند غيرنا، غيّر رأيه، أُغلق بعد ثلاث محاولات بلا ردّ · بعد 14 يوماً من الإلغاء · من طلباتِ آخر 120 يوماً · خصمٌ حتى 25٪'
    );
  });

  it('and the owner’s own rule, the moment it is stored: ten days, ninety, an eighth, one reason', async () => {
    rule = { reasons: ['PRICE_TOO_HIGH'], coolingDays: 10, lookbackDays: 90, maxDiscountShare: 0.125 };
    await draw();
    const sentence = screen.getByText(/^ملغى · لم يُشحن/).textContent!;
    expect(sentence).toContain('السبب: السعر مرتفع ·');
    expect(sentence).toContain('بعد 10 يوماً من الإلغاء');
    expect(sentence).toContain('من طلباتِ آخر 90 يوماً');
    expect(sentence).toContain('خصمٌ حتى 12.5٪');
    expect(sentence).not.toContain('14');
    expect(sentence).not.toContain('120');
  });

  it('and the line under the title carries the same cooling, not a number of its own', async () => {
    rule = { ...rule, coolingDays: 10, lookbackDays: 90 };
    await draw();
    expect(screen.getByTestId('note').textContent).toContain('ومضى على إلغائها 10 يوماً على الأقلّ');
    expect(screen.getByTestId('note').textContent).not.toContain('14');
  });

  it('and «عدّل القاعدة» is offered to the one who may change it', async () => {
    await draw();
    expect(screen.getByRole('button', { name: 'عدّل القاعدة' })).toBeTruthy();
  });

  it('and NOT to anyone else — a supervisor reads the rule, she does not write it; no form is drawn for her either', async () => {
    canEdit = false;
    await draw();
    expect(screen.getByText(/^ملغى · لم يُشحن/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'عدّل القاعدة' })).toBeNull();
    expect(screen.queryByText('قاعدة استرجاع الملغى')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('and pressing it opens the form on the stored rule', async () => {
    rule = { ...rule, coolingDays: 10, lookbackDays: 90, maxDiscountShare: 0.125 };
    await draw();
    expect(screen.queryByText('قاعدة استرجاع الملغى')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'عدّل القاعدة' }));
    expect(screen.getByText('قاعدة استرجاع الملغى')).toBeTruthy();
    expect((screen.getByLabelText('المهلة بعد الإلغاء (أيام)') as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('أقصى خصم (٪ من السعر)') as HTMLInputElement).value).toBe('12.5');
  });
});

describe('saving a new rule', () => {
  const openAndSave = async (cooling: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'عدّل القاعدة' }));
    fireEvent.change(screen.getByLabelText('المهلة بعد الإلغاء (أيام)'), { target: { value: cooling } });
    fireEvent.click(screen.getByRole('button', { name: 'احفظ القاعدة' }));
  };

  it('— says so, closes the form, and the sentence on the screen is the new rule’s', async () => {
    await draw();
    await openAndSave('10');
    await waitFor(() => expect(toast.done).toHaveBeenCalledWith('حُفظت القاعدة — والقائمة تقرأ بها من الآن'));
    expect(puts()).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('قاعدة استرجاع الملغى')).toBeNull());
    await waitFor(() => expect(screen.getByText(/^ملغى · لم يُشحن/).textContent).toContain('بعد 10 يوماً من الإلغاء'));
    expect(screen.getByTestId('note').textContent).toContain('10 يوماً');
  });

  it('and the list starts again from page one, on the work — a rule moves orders between the views', async () => {
    await draw();
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    await waitFor(() => expect(lastAsked().get('page')).toBe('2'));
    choose('الحالة', 'cooling');
    choose('سبب الإلغاء', 'PRICE_TOO_HIGH');
    await waitFor(() => expect(lastAsked().get('reason')).toBe('PRICE_TOO_HIGH'));
    await openAndSave('10');
    await waitFor(() => expect(toast.done).toHaveBeenCalled());
    await waitFor(() => expect(lastAsked().toString()).toBe('view=ready&page=1&limit=25'));
    expect((screen.getByLabelText('الحالة') as HTMLSelectElement).value).toBe('ready');
    expect((screen.getByLabelText('سبب الإلغاء') as HTMLSelectElement).value).toBe('all');
  });

  it('and when nothing was chosen, it still asks again — the numbers beside every option may have changed', async () => {
    await draw();
    const before = gets().length;
    await openAndSave('10');
    await waitFor(() => expect(gets().length).toBeGreaterThan(before));
  });

  it('and a refusal by the route is shown in the form, which stays open, with no «saved» said', async () => {
    api.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') throw new Error('ليس لديك صلاحية لهذا الإجراء');
      return { rows: [row('P1')], pagination: { total: 1, page: 1, limit: 25, totalPages: 1 }, facts, rule, canEditRule: true };
    });
    await draw();
    await openAndSave('10');
    expect(await screen.findByText('ليس لديك صلاحية لهذا الإجراء')).toBeTruthy();
    expect(screen.getByText('قاعدة استرجاع الملغى')).toBeTruthy();
    expect(toast.done).not.toHaveBeenCalled();
  });
});

describe('the toolbar', () => {
  it('— a search box that says what it searches, and four dropdowns, each with the server’s number beside the word', async () => {
    await draw();
    expect(search().placeholder).toBe('بحث برقم الطلب أو اسم العميل أو هاتفه أو المنتج…');
    expect(options('الحالة')).toEqual(['جاهز للاتصال (12)', 'ما زال في المهلة (5)', 'مستثنى من القاعدة (30)']);
    expect(options('سبب الإلغاء')).toEqual(['كل الأسباب', 'السعر مرتفع (8)', 'غيّر رأيه (4)']);
    expect(options('المنتج')).toEqual(['كل المنتجات', 'ساعة (6)', 'حقيبة (3)']);
    expect(options('تاريخ الإلغاء')).toEqual(['أيّ وقت', 'آخر 7 أيام (2)', 'آخر 30 يوماً (6)', 'آخر 90 يوماً (12)']);
  });

  it('and the view it opens on is the first, selected', async () => {
    await draw();
    expect((screen.getByLabelText('الحالة') as HTMLSelectElement).value).toBe('ready');
  });

  it('and a choice the new counts no longer hold is still shown, with a zero, so the box never lies about what is asked', async () => {
    await draw();
    choose('المنتج', 'ساعة');
    await waitFor(() => expect(lastAsked().get('product')).toBe('ساعة'));
    facts = { ...facts, products: [{ name: 'حقيبة', count: 3 }] };
    choose('سبب الإلغاء', 'CUSTOMER_CHANGED_MIND');
    await waitFor(() => expect(lastAsked().get('reason')).toBe('CUSTOMER_CHANGED_MIND'));
    expect(options('المنتج')).toEqual(['كل المنتجات', 'حقيبة (3)', 'ساعة (0)']);
    expect((screen.getByLabelText('المنتج') as HTMLSelectElement).value).toBe('ساعة');
  });
});

describe('choosing', () => {
  it('— a view is asked for by its word, and only that; the rest of the address is the page', async () => {
    await draw();
    choose('الحالة', 'cooling');
    await waitFor(() => expect(gets()).toHaveLength(2));
    expect(lastAsked().toString()).toBe('view=cooling&page=1&limit=25');
  });

  it('and choosing the other three: a reason, a product (as written), a period', async () => {
    await draw();
    choose('سبب الإلغاء', 'PRICE_TOO_HIGH');
    await waitFor(() => expect(lastAsked().get('reason')).toBe('PRICE_TOO_HIGH'));
    choose('المنتج', 'ساعة');
    await waitFor(() => expect(lastAsked().get('product')).toBe('ساعة'));
    choose('تاريخ الإلغاء', '30');
    await waitFor(() => expect(lastAsked().get('period')).toBe('30'));
    expect(lastAsked().toString()).toBe(new URLSearchParams({ period: '30', product: 'ساعة', reason: 'PRICE_TOO_HIGH', view: 'ready', page: '1', limit: '25' }).toString());
  });

  it('and a change starts again at page one, from wherever the reader was', async () => {
    await draw();
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    await waitFor(() => expect(lastAsked().get('page')).toBe('2'));
    choose('الحالة', 'skipped');
    await waitFor(() => expect(lastAsked().get('view')).toBe('skipped'));
    expect(lastAsked().get('page')).toBe('1');
  });

  it('and «كل الأسباب» is not sent as a choice — back to the unfiltered address', async () => {
    await draw();
    choose('سبب الإلغاء', 'PRICE_TOO_HIGH');
    await waitFor(() => expect(lastAsked().get('reason')).toBe('PRICE_TOO_HIGH'));
    choose('سبب الإلغاء', 'all');
    await waitFor(() => expect(lastAsked().has('reason')).toBe(false));
    expect(lastAsked().toString()).toBe('view=ready&page=1&limit=25');
  });

  it('and a typed word is asked after the burst, trimmed; blanks are nothing', async () => {
    await draw();
    fireEvent.change(search(), { target: { value: '  سارة  ' } });
    await waitFor(() => expect(lastAsked().get('q')).toBe('سارة'));
    expect(gets()).toHaveLength(2); // the opening ask, and one for the word
    fireEvent.change(search(), { target: { value: '   ' } });
    await waitFor(() => expect(gets()).toHaveLength(3));
    expect(lastAsked().has('q')).toBe(false);
  });

  it('and «إعادة تعيين» counts what is chosen — a view that is not the default counts — and puts it all back, the search too', async () => {
    await draw();
    choose('الحالة', 'cooling');
    choose('سبب الإلغاء', 'PRICE_TOO_HIGH');
    fireEvent.change(search(), { target: { value: 'سارة' } });
    const reset = await screen.findByRole('button', { name: 'إعادة تعيين (3)' });
    fireEvent.click(reset);
    await waitFor(() => expect(lastAsked().toString()).toBe('view=ready&page=1&limit=25'));
    expect(screen.queryByRole('button', { name: /إعادة تعيين/ })).toBeNull();
    expect(search().value).toBe('');
    expect((screen.getByLabelText('الحالة') as HTMLSelectElement).value).toBe('ready');
    expect((screen.getByLabelText('سبب الإلغاء') as HTMLSelectElement).value).toBe('all');
  });

  it('and the pages turn the SAME list: «التالي» keeps the view and the filters', async () => {
    await draw();
    choose('الحالة', 'cooling');
    choose('تاريخ الإلغاء', '7');
    await waitFor(() => expect(lastAsked().get('period')).toBe('7'));
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    await waitFor(() => expect(lastAsked().get('page')).toBe('2'));
    expect(lastAsked().get('view')).toBe('cooling');
    expect(lastAsked().get('period')).toBe('7');
    expect(screen.getByText('ORD-P2')).toBeTruthy();
    expect(screen.getByText('صفحة 2 من 3')).toBeTruthy();
  });

  it('and a list that fits one page has a bar that says so and turns nowhere', async () => {
    total = 7;
    rowsOf = () => Array.from({ length: 7 }, (_, i) => row(`R${i}`));
    await draw();
    expect(screen.getByText('صفحة 1 من 1')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'الصفحة التالية' }) as HTMLButtonElement).disabled).toBe(true);
    expect(pagerSentence(true)!.textContent).toBe('عرض 7 من 7 طلب');
  });
});

describe('a row', () => {
  it('— the order, why it was lost, when, who, what, how much', async () => {
    rowsOf = () => [row('A1', { customer: { fullName: 'ليلى', phone: '0791112233' }, product: 'ساعة', quantity: 3, rejectionNote: 'قال بعد الراتب' })];
    await draw();
    const card = screen.getByText('ORD-A1').closest('article')!;
    expect(within(card).getByText('السعر مرتفع')).toBeTruthy();
    expect(within(card).getByText('أُلغي 2026-09-20')).toBeTruthy();
    expect(card.textContent).toContain('ليلى');
    expect(within(card).getByText('0791112233')).toBeTruthy();
    expect(card.textContent).toContain('ساعة');
    expect(card.textContent).toContain('3 ×');
    expect(within(card).getByText('قال بعد الراتب')).toBeTruthy();
  });

  it('and a discount that was already given is shown, so the ceiling beside it is understood', async () => {
    rowsOf = () => [row('A1', { discountAmount: 5 })];
    await draw();
    expect(screen.getByText(/محسومٌ سابقاً/)).toBeTruthy();
    cleanup();
    rowsOf = () => [row('A2', { discountAmount: 0 })];
    await draw();
    expect(screen.queryByText(/محسومٌ سابقاً/)).toBeNull();
  });

  it('and a row with no note has no empty box where the note would be', async () => {
    await draw();
    const card = screen.getByText('ORD-P1').closest('article')!;
    expect([...card.querySelectorAll('p')].filter((p) => !p.textContent!.trim())).toHaveLength(0);
  });

  it('and an order with no reason on record says «بلا سبب», not a blank chip', async () => {
    rowsOf = () => [row('A1', { rejectionReason: null })];
    await draw();
    expect(within(screen.getByText('ORD-A1').closest('article')!).getByText('بلا سبب')).toBeTruthy();
  });

  it('and a date that is missing is a dash', async () => {
    rowsOf = () => [row('A1', { rejectedAt: null })];
    await draw();
    expect(screen.getByText('أُلغي —')).toBeTruthy();
  });

  it('and one that can be offered has the button and the ceiling; one that cannot has the sentence that says why, and no button', async () => {
    rowsOf = () => [
      row('OK'),
      row('SH', { verdict: { eligible: false, code: 'ALREADY_SHIPPED', reason: 'شُحن ثمّ عاد — هذا إرجاع، وله حسابه الخاصّ' } }),
    ];
    await draw();
    const ok = screen.getByText('ORD-OK').closest('article')!;
    expect(within(ok).getByRole('button', { name: 'اعرضه من جديد' })).toBeTruthy();
    expect(ok.textContent).toContain('أقصى خصم');
    const shipped = screen.getByText('ORD-SH').closest('article')!;
    expect(within(shipped).queryByRole('button')).toBeNull();
    expect(within(shipped).getByText('شُحن ثمّ عاد — هذا إرجاع، وله حسابه الخاصّ')).toBeTruthy();
  });

  it('and one still cooling says WHEN it becomes ready — and that is the only code that does', async () => {
    rowsOf = () => [
      row('CO', { verdict: { eligible: false, code: 'COOLING', reason: 'ما زال في مهلة الـ10 يوماً', dueAt: '2026-10-25T10:00:00.000Z' } }),
      row('NO', { verdict: { eligible: false, code: 'REASON_NOT_WINBACK', reason: 'رفضٌ صريح — الخصم على شيءٍ لا يريده ليس عرضاً', dueAt: '2026-10-25T10:00:00.000Z' } }),
    ];
    await draw();
    const text = (id: string) => screen.getByText(`ORD-${id}`).closest('article')!.querySelector('footer')!.textContent;
    expect(text('CO')).toBe('ما زال في مهلة الـ10 يوماً — يصير جاهزاً 2026-10-25');
    expect(text('NO')).toBe('رفضٌ صريح — الخصم على شيءٍ لا يريده ليس عرضاً');
  });
});

describe('«اعرضه من جديد»', () => {
  const press = () => fireEvent.click(screen.getAllByRole('button', { name: 'اعرضه من جديد' })[0]);

  it('— asks for the discount with the ceiling written on it, and offers nothing until it is answered', async () => {
    rowsOf = () => [row('A1', { customer: { fullName: 'ليلى', phone: '0791112233' }, discountAmount: 5, verdict: { eligible: true, dueAt: '2026-10-04T10:00:00.000Z', maxDiscount: 7.5 } })];
    await draw();
    press();
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    const arg = ask.mock.calls[0][0];
    expect(arg.title).toBe('اعرض على ليلى من جديد؟');
    expect(arg.body).toContain('أقصى خصمٍ مسموح: 7.5');
    expect(arg.body).toContain('محسومٌ عليه 5 سابقاً');
    expect(arg.input).toEqual({ label: 'قيمة الخصم', placeholder: '7.5' });
    expect(arg.confirmLabel).toBe('اعرضه');
  });

  it('and an answer within the ceiling is sent for THAT order, and the reader stays on the page they are on', async () => {
    await draw();
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    await waitFor(() => expect(lastAsked().get('page')).toBe('2'));
    choose('الحالة', 'ready');
    ask.mockResolvedValue('7.5');
    press();
    await waitFor(() => expect(toast.done).toHaveBeenCalledWith('ORD-NEW في الطابور — يسحبه أوّلُ من يفرغ'));
    expect(posts()).toHaveLength(1);
    expect(posts()[0][0]).toBe('/api/confirmation/winback');
    expect(JSON.parse((posts()[0][1] as RequestInit).body as string)).toEqual({ orderId: 'P2', discount: 7.5 });
    await waitFor(() => expect(lastAsked().get('page')).toBe('2'));
    expect(gets().length).toBeGreaterThanOrEqual(3);
  });

  it('and the offer is for THE ROW whose button was pressed — the second of two, not the first', async () => {
    rowsOf = () => [
      row('ONE', { customer: { fullName: 'الأولى', phone: '0791' } }),
      row('TWO', { customer: { fullName: 'الثانية', phone: '0792' } }),
    ];
    await draw();
    fireEvent.click(within(screen.getByText('ORD-TWO').closest('article')!).getByRole('button', { name: 'اعرضه من جديد' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(ask.mock.calls[0][0].title).toBe('اعرض على الثانية من جديد؟');
    expect(JSON.parse((posts()[0][1] as RequestInit).body as string).orderId).toBe('TWO');
  });

  it('and the reload keeps what was chosen', async () => {
    await draw();
    choose('سبب الإلغاء', 'PRICE_TOO_HIGH');
    await waitFor(() => expect(lastAsked().get('reason')).toBe('PRICE_TOO_HIGH'));
    const before = gets().length;
    press();
    await waitFor(() => expect(gets().length).toBeGreaterThan(before));
    expect(lastAsked().get('reason')).toBe('PRICE_TOO_HIGH');
  });

  it('and «no» to the question offers nothing', async () => {
    ask.mockResolvedValue(null);
    await draw();
    press();
    await waitFor(() => expect(ask).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(posts()).toHaveLength(0);
    expect(toast.failed).not.toHaveBeenCalled();
  });

  it.each([
    ['above the ceiling', '11'],
    ['far above it', '999'],
    ['negative', '-1'],
    ['a word', 'عشرة'],
  ])('and a discount %s is refused before any request: «اكتب رقماً بين صفر و10»', async (_what, answer) => {
    ask.mockResolvedValue(answer);
    await draw();
    press();
    await waitFor(() => expect(toast.failed).toHaveBeenCalledWith('اكتب رقماً بين صفر و10'));
    expect(posts()).toHaveLength(0);
  });

  it('and the ceiling itself is allowed', async () => {
    ask.mockResolvedValue('10');
    await draw();
    press();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse((posts()[0][1] as RequestInit).body as string).discount).toBe(10);
  });

  it('and a refusal by the route is told to the reader in a box of its own, with the list left as it was', async () => {
    postFails = new Error('عُرض عليه من قبل');
    await draw();
    const before = gets().length;
    press();
    await waitFor(() => expect(tell).toHaveBeenCalledWith({ title: 'تعذّر العرض', body: 'عُرض عليه من قبل', tone: 'danger' }));
    expect(toast.done).not.toHaveBeenCalled();
    expect(gets()).toHaveLength(before);
    expect(screen.getByText('ORD-P1')).toBeTruthy();
    // The button is pressable again.
    expect((screen.getByRole('button', { name: 'اعرضه من جديد' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('and the button is held while the offer is in the air', async () => {
    let finish!: (v: unknown) => void;
    const original = api.getMockImplementation()!;
    api.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'POST' ? new Promise((r) => (finish = r)) : original(url, init)
    );
    await draw();
    press();
    await waitFor(() => expect((screen.getByRole('button', { name: /اعرضه من جديد/ }) as HTMLButtonElement).disabled).toBe(true));
    press();
    expect(posts()).toHaveLength(1);
    finish({ order: { orderNumber: 'ORD-NEW' } });
    await waitFor(() => expect(toast.done).toHaveBeenCalled());
  });
});

describe('when nothing is there', () => {
  it('— an empty list with nothing chosen says what the screen is for, in the OWNER’S days, not fourteen', async () => {
    total = 0;
    rule = { ...rule, coolingDays: 10 };
    await draw();
    expect(screen.getByText('لا طلبَ جاهزاً لمحاولةٍ ثانية')).toBeTruthy();
    expect(screen.getByText(/تحدّدها القاعدة أعلاه، بعد 10 يوماً،/)).toBeTruthy();
    expect(screen.queryByText(/بعد 14 يوماً،/)).toBeNull();
    expect(screen.queryByText('لا طلبات بهذه الشروط')).toBeNull();
    expect(pagerSentence(false)).toBeNull(); // no page bar over nothing
  });

  it('and an empty list BECAUSE of what was chosen says that, and offers the way out', async () => {
    await draw();
    total = 0;
    choose('الحالة', 'skipped');
    expect(await screen.findByText('لا طلبات بهذه الشروط')).toBeTruthy();
    expect(screen.queryByText('لا طلبَ جاهزاً لمحاولةٍ ثانية')).toBeNull();
    total = 60;
    fireEvent.click(screen.getByRole('button', { name: 'امسح الفلاتر' }));
    await waitFor(() => expect(lastAsked().toString()).toBe('view=ready&page=1&limit=25'));
    expect((screen.getByLabelText('الحالة') as HTMLSelectElement).value).toBe('ready');
  });

  it('and a search that finds nothing is «because of what was chosen» too', async () => {
    await draw();
    total = 0;
    fireEvent.change(search(), { target: { value: 'لا أحد' } });
    expect(await screen.findByText('لا طلبات بهذه الشروط')).toBeTruthy();
  });
});

describe('how it is built', () => {
  const src = () => stripComments(readFileSync(join(process.cwd(), 'src/components/screens/WinbackScreen.tsx'), 'utf8'));

  it('— from the kit, not a sixth copy of it: the hook, the toolbar and the page bar', () => {
    expect(src()).toContain("from '@/hooks/usePagedList'");
    expect(src()).toContain("from '@/components/ui/ListToolbar'");
    expect(src()).toContain("from '@/components/ui/Pager'");
    expect(src(), 'عادت نسخة محلّية من شريط الصفحات').not.toMatch(/الصفحة التالية/);
  });

  it('and it decides nothing about the rule: the sentence is the library’s, the verdict and the ceiling are the server’s', () => {
    expect(src()).toContain("from '@/lib/winback'");
    expect(src()).toContain('ruleSentence(rule)');
    expect(src()).not.toMatch(/winbackVerdict|maxWinbackDiscount|parseWinbackRule/);
    expect(src()).not.toMatch(/Date\.now\(\)|new Date\(\)/);
  });

  it('and the choices, their words and their order come from one module the route reads too', () => {
    expect(src()).toContain("from '@/lib/winback-filters'");
    expect(src()).not.toMatch(/'ready'|'cooling'|'skipped'/);
  });

  it('and the dialog is drawn only for who may use it — not drawn then hidden', () => {
    expect(src()).toMatch(/canEditRule && \(\s*<WinbackRuleDialog/);
  });
});
