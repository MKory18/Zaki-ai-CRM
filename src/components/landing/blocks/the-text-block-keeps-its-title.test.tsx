// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import React from 'react';
import { newSection } from '@/lib/landing-sections';
import { PageBlocks, type BlockContext } from './PageBlocks';
import { plainText, useInlineEdit } from './useInlineEdit';

/**
 * «في خطأ بالنص والشرح: لما امسح النص العنوان بيختفي من الشاشة… وبعدين ما قدرت اعدّلو للنص من شاشة المعاينة».
 *
 * The «نص وشرح» block was drawn only when its body had words, so clearing the body took the title off the page —
 * the picture below rose into its place — and left nothing in the preview to click. The body was also the one text
 * on the page that could not be typed on in the preview.
 */

afterEach(cleanup);

const ctx = (placeholders = false): BlockContext => ({
  palette: {} as BlockContext['palette'], productName: 'x', price: 1, currency: 'USD', stock: null, offers: [], form: <div>FORM</div>,
  placeholders,
});
const text = (title: string, body: string) => ({ ...newSection('text'), id: 't1', title, body }) as ReturnType<typeof newSection>;

describe('the block on the page', () => {
  it('a title with no text under it is still drawn — the title does not vanish', () => {
    const { container } = render(<PageBlocks sections={[text('ماء الكمأة للعين', '')]} ctx={ctx()} />);
    expect(container.querySelector('h2')?.textContent).toBe('ماء الكمأة للعين');
    // A visitor sees no hint and no empty paragraph.
    expect(container.querySelector('.lp-prose')).toBeNull();
  });

  it('the text is drawn as its paragraphs, and is the seller’s to type on', () => {
    const { container } = render(<PageBlocks sections={[text('عنوان', 'سطر أول\n\nسطر ثاني')]} ctx={ctx()} />);
    const prose = container.querySelector('.lp-prose')!;
    expect([...prose.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['سطر أول', 'سطر ثاني']);
    expect(prose.getAttribute('data-edit')).toBe('body');
  });

  it('in the preview an empty body is a line to type on', () => {
    const { container } = render(<PageBlocks sections={[text('عنوان', '')]} ctx={ctx(true)} />);
    const prose = container.querySelector('.lp-prose')!;
    expect(prose.hasAttribute('data-edit-empty')).toBe(true);
    expect(prose.textContent).toContain('اكتب النص هنا');
  });

  it('NEGATIVE: an empty block is still nothing on the public page', () => {
    const { container } = render(<PageBlocks sections={[text('', '  ')]} ctx={ctx()} />);
    expect(container.querySelector('.lp-section')).toBeNull();
  });
});

describe('typing the body on the preview', () => {
  function mount(html: string, attrs: string) {
    // jsdom has no CSS.escape; the ids here need none.
    if (typeof CSS === 'undefined' || !CSS.escape) vi.stubGlobal('CSS', { escape: (v: string) => v });
    const root = document.createElement('div');
    root.innerHTML = `<div data-block-id="t1"><div class="lp-prose" data-edit="body" ${attrs}>${html}</div></div>`;
    document.body.appendChild(root);
    const commit = vi.fn();
    renderHook(() => useInlineEdit(root, 't1', commit));
    return { node: root.querySelector<HTMLElement>('.lp-prose')!, commit };
  }

  it('keeps the paragraphs the seller made', () => {
    const { node, commit } = mount('<p>سطر أول</p><p>سطر ثاني</p>', 'data-edit-plain=""');
    expect(node.contentEditable).toBe('true');
    node.innerHTML = '<p>سطر أول</p><p>سطر ثاني معدّل</p><p>سطر ثالث<br></p>';
    act(() => node.dispatchEvent(new FocusEvent('blur')));
    expect(commit).toHaveBeenCalledWith('t1', 'body', 'سطر أول\n\nسطر ثاني معدّل\n\nسطر ثالث');
  });

  it('Enter starts a paragraph instead of ending the edit', () => {
    const { node } = mount('<p>سطر</p>', 'data-edit-plain=""');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    node.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
  });

  it('the hint is cleared on the first click and typed over', () => {
    const { node, commit } = mount('<p>اكتب النص هنا…</p>', 'data-edit-plain="" data-edit-empty=""');
    act(() => node.dispatchEvent(new FocusEvent('focus')));
    expect(node.textContent).toBe('');
    node.innerHTML = '<p>نص جديد</p>';
    act(() => node.dispatchEvent(new FocusEvent('blur')));
    expect(commit).toHaveBeenCalledWith('t1', 'body', 'نص جديد');
  });

  it('NEGATIVE: the hint is never stored — clicking in and out writes nothing', () => {
    const { node, commit } = mount('<p>اكتب النص هنا…</p>', 'data-edit-plain="" data-edit-empty=""');
    act(() => node.dispatchEvent(new FocusEvent('focus')));
    act(() => node.dispatchEvent(new FocusEvent('blur')));
    expect(commit).not.toHaveBeenCalled();
    expect(node.textContent).toBe('اكتب النص هنا…');
  });

  it('NEGATIVE: a heading still commits on Enter, as it always did', () => {
    const { node } = mount('عنوان', '');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    node.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
  });

  it('plain text drops marks and keeps line breaks inside a paragraph', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>أول <b>غامق</b><br>سطر تحته</p><div>فقرة من div</div>';
    expect(plainText(el)).toBe('أول غامق\nسطر تحته\n\nفقرة من div');
  });
});
