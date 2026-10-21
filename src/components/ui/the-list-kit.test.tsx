// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import React from 'react';
import { repoFile, stripComments } from '@/lib/guard-source';

/**
 * THE KIT THE FOUR LISTS ARE BUILT FROM.
 *
 * «متابعة الشحن · المرتجعات · الطلبات المؤجلة · استرجاع الملغى — صفحات +
 * فلاتر + بحث». The orders screen and the customers screen each hold the same
 * sixty lines for it; four more copies of them would have been four more
 * places where «التالي» does something slightly different. What is held here
 * is the kit itself: the page bar, the toolbar, and the hook that reads a list
 * in pages with what the reader chose.
 */

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: (...a: unknown[]) => api(...a) }));

import { Pager } from './Pager';
import { ListToolbar, withChosen } from './ListToolbar';
import { usePagedList, type PagedRead } from '@/hooks/usePagedList';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  api.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ───────────────────────── the page bar ─────────────────────────

describe('the page bar', () => {
  const bar = (over: Partial<React.ComponentProps<typeof Pager>> = {}) => {
    const onPage = vi.fn();
    render(<Pager page={3} totalPages={13} total={312} shown={25} noun="طلب" onPage={onPage} {...over} />);
    return onPage;
  };

  it('— says what is shown against the whole list, and where the page stands', () => {
    bar();
    expect(screen.getByText(/عرض/).textContent).toBe('عرض 25 من 312 طلب');
    expect(screen.getByText('صفحة 3 من 13')).toBeTruthy();
  });

  it('and the arrows turn the page by one, in the direction their names say', () => {
    const onPage = bar();
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة السابقة' }));
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    expect(onPage.mock.calls).toEqual([[2], [4]]);
  });

  it('and there is no way past either end', () => {
    const first = bar({ page: 1 });
    expect((screen.getByRole('button', { name: 'الصفحة السابقة' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة السابقة' }));
    expect(first).not.toHaveBeenCalled();
    cleanup();

    const last = bar({ page: 13 });
    expect((screen.getByRole('button', { name: 'الصفحة التالية' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    expect(last).not.toHaveBeenCalled();
  });

  it('and an empty list is «صفحة 1 من 1», never «من 0»', () => {
    bar({ page: 1, totalPages: 0, total: 0, shown: 0 });
    expect(screen.getByText('صفحة 1 من 1')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'الصفحة التالية' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('and while a page is in the air neither arrow answers — the rows in hand are still the truth of the page in hand', () => {
    const onPage = bar({ loading: true });
    for (const name of ['الصفحة السابقة', 'الصفحة التالية']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled, name).toBe(true);
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(onPage).not.toHaveBeenCalled();
  });

  it('and «التالي» is the right chevron turned by icon-mirror — it LOOKS left on an RTL screen, where the next page is', () => {
    bar();
    const prev = screen.getByRole('button', { name: 'الصفحة السابقة' }).querySelector('svg')!;
    const next = screen.getByRole('button', { name: 'الصفحة التالية' }).querySelector('svg')!;
    for (const icon of [prev, next]) expect(icon.getAttribute('class')).toContain('icon-mirror');
    // Different glyphs: one is the other's mirror image, not the same drawing twice.
    expect(prev.innerHTML).not.toBe(next.innerHTML);
    const src = stripComments(repoFile('src/components/ui/Pager.tsx'));
    expect(src.indexOf('RiArrowLeftSLine className')).toBeLessThan(src.indexOf('RiArrowRightSLine className'));
  });
});

// ───────────────────────── the toolbar ─────────────────────────

describe('the toolbar', () => {
  const filters = (onChange = vi.fn()) => [
    {
      key: 'when',
      label: 'الموعد',
      value: 'all',
      options: [
        { value: 'all', label: 'كل المواعيد (40)' },
        { value: 'overdue', label: 'متأخر (3)' },
      ],
      onChange,
    },
    {
      key: 'kind',
      label: 'النوع',
      value: 'all',
      options: [
        { value: 'all', label: 'الكل' },
        { value: 'followup', label: 'بحاجة متابعة (7)' },
      ],
      onChange: vi.fn(),
    },
  ];
  const draw = (over: Partial<React.ComponentProps<typeof ListToolbar>> = {}) => {
    const props = { search: '', onSearch: vi.fn(), placeholder: 'بحث برقم الطلب أو اسم العميل…', filters: filters(), activeCount: 0, onReset: vi.fn(), ...over };
    render(<ListToolbar {...props} />);
    return props;
  };

  it('— a search box that says what it searches, and gives what was typed', () => {
    const p = draw({ search: 'سارة' });
    const box = screen.getByRole('textbox', { name: 'بحث برقم الطلب أو اسم العميل…' }) as HTMLInputElement;
    expect(box.value).toBe('سارة');
    expect(box.getAttribute('placeholder')).toBe('بحث برقم الطلب أو اسم العميل…');
    fireEvent.change(box, { target: { value: 'سارة ع' } });
    expect(p.onSearch).toHaveBeenCalledWith('سارة ع');
  });

  it('and every dropdown is on the screen with its label above it — none is behind a button', () => {
    draw();
    expect(screen.getByLabelText('الموعد')).toBeTruthy();
    expect(screen.getByLabelText('النوع')).toBeTruthy();
    expect(within(screen.getByLabelText('الموعد')).getAllByRole('option').map((o) => o.textContent)).toEqual(['كل المواعيد (40)', 'متأخر (3)']);
  });

  it('and choosing one says which', () => {
    const onChange = vi.fn();
    draw({ filters: filters(onChange) });
    fireEvent.change(screen.getByLabelText('الموعد'), { target: { value: 'overdue' } });
    expect(onChange).toHaveBeenCalledWith('overdue');
  });

  it('and «إعادة تعيين» appears only while something is chosen, with how many — and presses to clear', () => {
    draw();
    expect(screen.queryByRole('button', { name: /إعادة تعيين/ })).toBeNull();
    cleanup();

    const p = draw({ activeCount: 2 });
    const reset = screen.getByRole('button', { name: /إعادة تعيين \(2\)/ });
    fireEvent.click(reset);
    expect(p.onReset).toHaveBeenCalledTimes(1);
  });

  it('and a list with no dropdowns and nothing chosen draws only the box', () => {
    const { container } = render(
      <ListToolbar search="" onSearch={() => undefined} placeholder="بحث" filters={[]} activeCount={0} onReset={() => undefined} />
    );
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('.grid')).toBeNull();
  });

  it('and it carries no state of its own — what is chosen is the screen’s, drawn back', () => {
    const src = stripComments(repoFile('src/components/ui/ListToolbar.tsx'));
    expect(src).not.toMatch(/useState|useReducer/);
  });

  describe('for a desk that scans', () => {
    const bare = (extra: Partial<React.ComponentProps<typeof ListToolbar>> = {}) =>
      render(<ListToolbar search="" onSearch={() => undefined} placeholder="بحث" filters={[]} activeCount={0} onReset={() => undefined} {...extra} />);

    it('— a screen that asks for none of it gets the box as it always was: no cursor in it, no direction of its own, no button', () => {
      bare();
      const box = screen.getByRole('textbox', { name: 'بحث' }) as HTMLInputElement;
      expect(box.getAttribute('dir')).toBeNull();
      expect(document.activeElement).not.toBe(box);
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('and one that scans puts the cursor in the box, makes it left-to-right for codes, and draws its button beside it', () => {
      bare({ searchExtra: <button type="button">امسح</button>, searchAutoFocus: true, searchDir: 'ltr' });
      const box = screen.getByRole('textbox', { name: 'بحث' });
      expect(box.getAttribute('dir')).toBe('ltr');
      expect(document.activeElement).toBe(box);
      expect(screen.getByRole('button', { name: 'امسح' })).toBeTruthy();
    });

    it('and a screen that wants a REAL label gets one — a `<label htmlFor>` the thumb can hit, and no aria-label competing with it', () => {
      bare({ searchLabel: 'بحث' });
      const box = screen.getByLabelText('بحث') as HTMLInputElement;
      expect(box.tagName).toBe('INPUT');
      expect(box.id).toBeTruthy();
      const label = document.querySelector(`label[for="${box.id}"]`);
      expect(label, 'لا تسميةَ تُشيرُ إلى الحقل').toBeTruthy();
      expect(label!.textContent).toBe('بحث');
      expect(box.getAttribute('aria-label')).toBeNull();
    });

    it('and one that does not is named by its placeholder alone, as every list was — no label, no id', () => {
      bare();
      const box = screen.getByRole('textbox', { name: 'بحث' }) as HTMLInputElement;
      expect(box.getAttribute('aria-label')).toBe('بحث');
      expect(box.id).toBe('');
      expect(document.querySelector('label')).toBeNull();
    });

    it('and the box and its button share one row — the button is not on a line of its own', () => {
      bare({ searchExtra: <button type="button">امسح</button> });
      const row = screen.getByRole('button', { name: 'امسح' }).parentElement!;
      expect(row.className).toContain('flex');
      expect(row.contains(screen.getByRole('textbox', { name: 'بحث' }))).toBe(true);
    });
  });
});

// ───────────────────────── the chosen value stays in its box ─────────────────────────

describe('a chosen value is always in its box', () => {
  const options = [
    { value: 'all', label: 'كل الشركات' },
    { value: 'a', label: 'ناقل (3)' },
  ];

  it('— left as it is while the counts still hold it, or while it is «all» — even from a list that forgot to name «all»', () => {
    expect(withChosen('a', options)).toBe(options);
    expect(withChosen('all', options)).toBe(options);
    const forgot = [{ value: 'a', label: 'ناقل (3)' }];
    expect(withChosen('all', forgot)).toBe(forgot);
  });

  it('and a value the new counts have lost stays in the list, last, with a zero — the box never snaps back behind the reader', () => {
    expect(withChosen('gone', options)).toEqual([...options, { value: 'gone', label: 'gone (0)' }]);
  });
});

// ───────────────────────── the hook ─────────────────────────

const read = (body: unknown): PagedRead<string, { note: string }> => {
  const b = body as { rows: string[]; pagination: { total: number; page: number; limit: number; totalPages: number }; note: string };
  return { rows: b.rows, pagination: b.pagination, extra: { note: b.note } };
};

/** A route with 60 rows in pages of 25: whatever page is asked is the page answered (clamped to 3). */
const route = () =>
  api.mockImplementation(async (url: string) => {
    const q = new URL(url, 'http://x').searchParams;
    const page = Math.min(Number(q.get('page')), 3);
    return { rows: [`صفّ-${page}`], pagination: { total: 60, page, limit: Number(q.get('limit')), totalPages: 3 }, note: q.toString() };
  });

const asked = () => api.mock.calls.map((c) => new URL(c[0] as string, 'http://x').searchParams);
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const mount = (params: Record<string, string | undefined> = {}, limit?: number) =>
  renderHook((p: { params: Record<string, string | undefined> }) => usePagedList({ url: '/api/list', params: p.params, limit, read }), {
    initialProps: { params },
  });

describe('reading a list in pages', () => {
  it('— asks at once on opening: the screen is never empty for a quarter of a second — for page one, 25 to a page', async () => {
    route();
    const { result } = mount();
    await settle();
    expect(asked()).toHaveLength(1);
    expect(asked()[0].get('page')).toBe('1');
    expect(asked()[0].get('limit')).toBe('25');
    expect(result.current.rows).toEqual(['صفّ-1']);
    expect(result.current.pagination).toEqual({ total: 60, page: 1, limit: 25, totalPages: 3 });
    expect(result.current.loading).toBe(false);
  });

  it('and only what was chosen is sent — empty, «all» and undefined are no filter, and the keys are in a fixed order', async () => {
    route();
    mount({ q: '', kind: 'all', when: 'overdue', agent: undefined, a: 'x' });
    await settle();
    expect(asked()[0].toString()).toBe('a=x&when=overdue&page=1&limit=25');
  });

  it('and a change of choice starts again at page one, after the burst', async () => {
    route();
    const { result, rerender } = mount({ when: 'all' });
    await settle();
    act(() => result.current.goTo(3));
    await settle();
    expect(asked().at(-1)!.get('page')).toBe('3');

    rerender({ params: { when: 'overdue' } });
    await wait(249);
    expect(asked()).toHaveLength(2); // still waiting out the burst
    await wait(1);
    expect(asked()).toHaveLength(3);
    expect(asked().at(-1)!.get('page')).toBe('1');
    expect(asked().at(-1)!.get('when')).toBe('overdue');
  });

  it('and a burst of changes asks once, for the lot', async () => {
    route();
    const { rerender } = mount({ q: '' });
    await settle();
    for (const q of ['س', 'سا', 'سار', 'سارة']) {
      rerender({ params: { q } });
      await wait(100);
    }
    await wait(250);
    // The opening ask, and ONE for the word — not one per letter.
    expect(asked()).toHaveLength(2);
    expect(asked().at(-1)!.get('q')).toBe('سارة');
  });

  it('and a new object with the same choices is not a new question', async () => {
    route();
    const { rerender } = mount({ when: 'overdue', q: 'x' });
    await settle();
    rerender({ params: { q: 'x', when: 'overdue' } });
    await wait(1000);
    expect(asked()).toHaveLength(1);
  });

  it('and turning the page keeps the choices', async () => {
    route();
    const { result } = mount({ when: 'overdue' });
    await settle();
    act(() => result.current.goTo(2));
    await settle();
    expect(asked().at(-1)!.get('page')).toBe('2');
    expect(asked().at(-1)!.get('when')).toBe('overdue');
    expect(result.current.pagination.page).toBe(2);
  });

  it('and the server’s word is the page: asking for the ninth of three is answered with the third, and the hook says third', async () => {
    route();
    const { result } = mount();
    await settle();
    act(() => result.current.goTo(9));
    await settle();
    expect(result.current.pagination.page).toBe(3);
    expect(result.current.rows).toEqual(['صفّ-3']);
  });

  it('and latest wins: a slow answer to an old question is never drawn over the fast answer to the new one', async () => {
    let slow!: (v: unknown) => void;
    api.mockImplementationOnce(() => new Promise((resolve) => { slow = resolve; }));
    const { result, rerender } = mount({ q: 'old' });
    await settle();
    // The new question is asked, and answered, while the old one is still in the air.
    route();
    rerender({ params: { q: 'new' } });
    await wait(250);
    expect(result.current.rows).toEqual(['صفّ-1']);
    expect(result.current.extra?.note).toContain('q=new');
    // Now the old one arrives.
    await act(async () => slow({ rows: ['قديم'], pagination: { total: 1, page: 1, limit: 25, totalPages: 1 }, note: 'q=old' }));
    expect(result.current.rows).toEqual(['صفّ-1']);
    expect(result.current.extra?.note).toContain('q=new');
    expect(result.current.loading).toBe(false);
  });

  it('and «reload» asks for the page the reader is ON, with the same choices', async () => {
    route();
    const { result } = mount({ when: 'overdue' });
    await settle();
    act(() => result.current.goTo(2));
    await settle();
    await act(async () => { await result.current.reload(); });
    expect(asked().at(-1)!.get('page')).toBe('2');
    expect(asked().at(-1)!.get('when')).toBe('overdue');
  });

  it('and coming back to the tab reloads the page the reader was on, not the first', async () => {
    route();
    const { result } = mount();
    await settle();
    act(() => result.current.goTo(2));
    await settle();
    const before = api.mock.calls.length;
    await wait(4000);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await settle();
    expect(api.mock.calls.length).toBe(before + 1);
    expect(asked().at(-1)!.get('page')).toBe('2');
  });

  it('and a failure keeps the rows in hand and says why; the next success clears it', async () => {
    route();
    const { result } = mount();
    await settle();
    api.mockRejectedValueOnce(new Error('انتهت مهلة الطلب'));
    act(() => result.current.goTo(2));
    await settle();
    expect(result.current.error).toBe('انتهت مهلة الطلب');
    expect(result.current.rows).toEqual(['صفّ-1']);
    expect(result.current.loading).toBe(false);

    act(() => result.current.goTo(2));
    await settle();
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toEqual(['صفّ-2']);
  });

  it('and the page size is the caller’s, 25 when it does not say', async () => {
    route();
    mount({}, 50);
    await settle();
    expect(asked()[0].get('limit')).toBe('50');
  });

  it('and it never writes the address — a list’s choices in the bar are saved views, a feature the orders list has and this does not claim', () => {
    const src = stripComments(repoFile('src/hooks/usePagedList.ts'));
    expect(src).not.toMatch(/history\.|router\.(push|replace)|location\./);
  });
});
