// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ProductPicker, type PickableProduct } from './ProductPicker';

/**
 * A FILTER AND A LINE ARE NOT THE SAME CONTROL.
 *
 * A line must end up holding a product, so its ✕ means «change this». A
 * filter starts at «كل المنتجات» and its ✕ means «switch it off» — and it
 * must never be forced to hold a product just because somebody opened the
 * box to look.
 *
 * Both behaviours live in one component on purpose: a second picker would be
 * a second answer to «how is أذن spelled». These hold the two apart, and in
 * particular they hold the LINE behaviour still — `ProductLinesEditor` has
 * shipped it for a while and this extension must not have moved it.
 */

const CATALOGUE: PickableProduct[] = [
  { id: '1', name: 'كريم البواسير', sku: 'HEM-50' },
  { id: '2', name: 'قطرة الأذن', sku: 'EAR-20' },
];

const ANY = { value: 'all', label: 'كل المنتجات' };

afterEach(cleanup);

describe('as a filter', () => {
  it('says «كل المنتجات» rather than showing an empty search box', async () => {
    // An empty box reads as «you have not chosen yet» when in fact the
    // filter is off on purpose.
    render(<ProductPicker products={CATALOGUE} value="all" onChange={vi.fn()} anyOption={ANY} />);
    expect(screen.getByText('كل المنتجات')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/ابحث/)).toBeNull();
  });

  it('offers the «all» row first when opened, so it can be returned to', async () => {
    const onChange = vi.fn();
    render(<ProductPicker products={CATALOGUE} value="1" onChange={onChange} anyOption={ANY} />);
    await userEvent.click(screen.getByText('كريم البواسير'));
    const rows = screen.getAllByRole('button').map((b) => b.textContent);
    expect(rows[0]).toContain('كل المنتجات');
  });

  it('clears in one press — the ✕ switches the filter off', async () => {
    const onChange = vi.fn();
    render(<ProductPicker products={CATALOGUE} value="1" onChange={onChange} anyOption={ANY} />);
    await userEvent.click(screen.getByRole('button', { name: 'امسح الاختيار' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('hides the «all» row once something is typed', async () => {
    // It is the row the arrow keys land on first, and Enter on it would
    // clear the filter the person is building.
    render(<ProductPicker products={CATALOGUE} value="all" onChange={vi.fn()} anyOption={ANY} />);
    await userEvent.click(screen.getByText('كل المنتجات'));
    await userEvent.type(screen.getByPlaceholderText(/ابحث/), 'كريم');
    expect(screen.queryByText('كل المنتجات')).toBeNull();
    expect(screen.getByText('كريم البواسير')).toBeTruthy();
  });
});

describe('as a line-item chooser, unchanged', () => {
  it('the ✕ opens the search to CHANGE the product, it does not empty the line', async () => {
    // A line without a product is not a line. This is what
    // `ProductLinesEditor` has always done and the extension must not move
    // it: no `onChange` fires, the search opens instead.
    const onChange = vi.fn();
    render(<ProductPicker products={CATALOGUE} value="1" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'غيّر المنتج' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/ابحث/)).toBeTruthy();
  });

  it('offers no «all» row at all', async () => {
    render(<ProductPicker products={CATALOGUE} value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByPlaceholderText(/ابحث/));
    expect(screen.queryByText('كل المنتجات')).toBeNull();
    expect(screen.getByText('قطرة الأذن')).toBeTruthy();
  });

  it('still finds a product however the hamza is written', async () => {
    render(<ProductPicker products={CATALOGUE} value="" onChange={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/ابحث/), 'اذن');
    expect(screen.getByText('قطرة الأذن')).toBeTruthy();
    expect(screen.queryByText('كريم البواسير')).toBeNull();
  });
});

describe('grouped, for browsing a catalogue you cannot name', () => {
  const skin = { id: 'c1', name: 'العناية بالبشرة' };
  const GROUPED: PickableProduct[] = [
    { id: '1', name: 'كريم البواسير', category: skin },
    { id: '2', name: 'قطرة الأذن' },
  ];

  const headings = () =>
    [...document.querySelectorAll('[data-picker-group]')].map((el) => el.textContent);

  it('draws the category headings when opened with nothing typed', async () => {
    render(<ProductPicker products={GROUPED} value="" onChange={vi.fn()} groupByCategory />);
    await userEvent.click(screen.getByPlaceholderText(/ابحث/));
    expect(headings()).toEqual(['العناية بالبشرة', 'بلا تصنيف']);
  });

  it('drops the headings the moment something is typed', async () => {
    // Ranked matches are the answer then; headings are furniture between them.
    render(<ProductPicker products={GROUPED} value="" onChange={vi.fn()} groupByCategory />);
    await userEvent.type(screen.getByPlaceholderText(/ابحث/), 'كريم');
    expect(headings()).toEqual([]);
    expect(screen.getByText('كريم البواسير')).toBeTruthy();
  });

  it('draws none at all unless the caller asks for grouping', async () => {
    render(<ProductPicker products={GROUPED} value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByPlaceholderText(/ابحث/));
    expect(headings()).toEqual([]);
  });

  it('a heading cannot be chosen — it is not a row', async () => {
    // Arrow-down once must land on the FIRST PRODUCT, not on the heading
    // above it, or the highlight sits one place above what Enter selects.
    const onChange = vi.fn();
    render(<ProductPicker products={GROUPED} value="" onChange={onChange} groupByCategory />);
    const box = screen.getByPlaceholderText(/ابحث/);
    await userEvent.click(box);
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('and the headings are not buttons, so a click cannot land on one', async () => {
    render(<ProductPicker products={GROUPED} value="" onChange={vi.fn()} groupByCategory />);
    await userEvent.click(screen.getByPlaceholderText(/ابحث/));
    for (const el of document.querySelectorAll('[data-picker-group]')) {
      expect(el.querySelector('button')).toBeNull();
      expect(el.getAttribute('role')).toBe('presentation');
    }
  });
});
