// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { landingSectionSchema, newSection, SECTION_LABEL, type LandingSection, type SectionType } from '@/lib/landing-sections';
import { lookForType, lookPartReason, lookParts, lookStyles } from '@/lib/block-look';
import { LookControls, SWATCHES } from './LookControls';
import { PageBlocks, type BlockContext, type BlockSelection } from './PageBlocks';

/**
 * «هاي اللوحة باللاندنج فيها مشاكل بدها حل». The block's panel: what each control says, what it does on THIS block,
 * and where the bar sits on the page.
 */

afterEach(cleanup);

const lookOf = (type: SectionType) => (landingSectionSchema.parse({ ...newSection(type), id: 'b1' }) as LandingSection).look!;

const panel = (type: SectionType, extra: Partial<React.ComponentProps<typeof LookControls>> = {}) => {
  const onChange = vi.fn();
  render(<LookControls look={lookOf(type)} type={type} onChange={onChange} {...extra} />);
  return onChange;
};

describe('the four tabs', () => {
  it('say their names in words — not two palettes and a brush', () => {
    panel('trust');
    for (const name of ['التنسيق', 'النص', 'الزر', 'الخلفية']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    }
  });

  it('a part that does nothing on this block is still there, and says why when pressed', () => {
    panel('trust');
    fireEvent.click(screen.getByRole('button', { name: /الزر/ }));
    expect(screen.getByText('هالقسم ما فيه زر.')).toBeTruthy();
  });

  it('«لون العناوين» on a block with no heading says so instead of offering colours that change nothing', () => {
    panel('announcement');
    fireEvent.click(screen.getByRole('button', { name: /النص/ }));
    expect(screen.getByText(/هالقسم ما فيه عناوين/)).toBeTruthy();
  });

  it('NEGATIVE: on the trust block the heading colour is live — its item titles are headings', () => {
    panel('trust');
    fireEvent.click(screen.getByRole('button', { name: /النص/ }));
    expect(screen.getAllByRole('button', { name: /لون العناوين #/ }).length).toBe(SWATCHES.length);
  });
});

describe('the colours', () => {
  it('the chosen swatch is marked, even when it is the accent or white', () => {
    const look = { ...lookOf('text'), text: { ...lookOf('text').text, color: '#b8256e' } };
    render(<LookControls look={look} type="text" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /النص/ }));
    const picked = screen.getByRole('button', { name: 'لون النص #b8256e' });
    expect(picked.getAttribute('aria-pressed')).toBe('true');
    expect((picked as HTMLElement).style.boxShadow).not.toBe('');
  });

  it('the clear chips say what clearing does', () => {
    panel('text');
    fireEvent.click(screen.getByRole('button', { name: /النص/ }));
    expect(screen.getByRole('button', { name: 'تلقائي' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'مثل لون النص' })).toBeTruthy();
  });

  it('a colour that is not one of the eight is shown as the custom one — not a magenta square nobody chose', () => {
    const look = { ...lookOf('text'), text: { ...lookOf('text').text, color: '#123456' } };
    render(<LookControls look={look} type="text" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /النص/ }));
    const input = screen.getByLabelText('لون النص — لون آخر') as HTMLInputElement;
    expect(input.value).toBe('#123456');
    expect(input.closest('label')?.getAttribute('title')).toContain('#123456');
  });

  it('NEGATIVE: with nothing chosen the colour box is a «+», not a fake colour', () => {
    panel('text');
    fireEvent.click(screen.getByRole('button', { name: /النص/ }));
    expect((screen.getByLabelText('لون النص — لون آخر') as HTMLInputElement).value).toBe('#000001');
  });

  it('the picker opens on the colour the block has now', () => {
    const look = { ...lookOf('text'), text: { ...lookOf('text').text, color: '#0ea5e9' } };
    render(<LookControls look={look} type="text" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /النص/ }));
    expect((screen.getByLabelText('لون النص — لون آخر') as HTMLInputElement).value).toBe('#0ea5e9');
  });
});

describe('the font list', () => {
  it('offers the store’s uploaded fonts, and B / I say they style the whole block', () => {
    panel('text', { fonts: [{ key: 'u:abc', label: 'خطّي', stack: 'x', note: 'خطّك' }] });
    fireEvent.click(screen.getByRole('button', { name: /النص/ }));
    expect(screen.getByRole('option', { name: /خطّي/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'عريض — للقسم كله' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'مائل — للقسم كله' })).toBeTruthy();
  });
});

describe('which parts mean anything on which block', () => {
  it('every block type has a whole answer', () => {
    for (const type of Object.keys(SECTION_LABEL) as SectionType[]) {
      const p = lookParts(type);
      for (const k of ['box', 'text', 'textColor', 'heading', 'button'] as const) expect(typeof p[k], `${type}.${k}`).toBe('boolean');
    }
  });

  it('the button only where a button is drawn; the floating button keeps its font controls but not a box', () => {
    expect(lookParts('hero').button).toBe(true);
    expect(lookParts('trust').button).toBe(false);
    expect(lookParts('trust').heading).toBe(true);
    expect(lookParts('announcement').heading).toBe(false);
    expect(lookParts('sticky')).toEqual({ box: false, text: true, textColor: false, heading: false, button: true });
    expect(lookParts('thankyou')).toEqual({ box: false, text: false, textColor: false, heading: false, button: false });
  });

  it('NEGATIVE: the order form is not told it has no button — it is told where its colour comes from', () => {
    expect(lookPartReason('form', 'button')).not.toContain('ما فيه زر');
  });

  it('a pasted look keeps only the parts that mean something on the block it lands on', () => {
    const loud = { ...lookOf('text'), width: 'full' as const, background: { ...lookOf('text').background, kind: 'solid' as const, from: '#000000' } };
    const onSticky = lookForType('sticky', loud, lookOf('sticky'));
    expect(onSticky.width).toBe(lookOf('sticky').width);
    expect(onSticky.background.kind).toBe('none');
    expect(lookForType('text', loud, lookOf('text')).width).toBe('full');
  });

  it('alignment reaches a grid of cards — only when it is not the centre', () => {
    expect(lookStyles({ ...lookOf('trust'), align: 'start' }).vars['--look-justify']).toBe('right');
    expect(lookStyles({ ...lookOf('trust'), align: 'center' }).vars['--look-justify']).toBeUndefined();
  });
});

describe('the bar on the block', () => {
  const ctx = (): BlockContext => ({
    palette: {} as BlockContext['palette'], productName: 'x', price: 1, currency: 'USD', stock: null, offers: [], form: <div />, building: true,
  });
  const selection = (over: Partial<BlockSelection> = {}): BlockSelection => ({
    activeId: 'b1', onSelect: vi.fn(), label: () => 'ضمانات', ...over,
  });
  const section = (enabled = true) => ({ ...(landingSectionSchema.parse({ ...newSection('trust'), id: 'b1' }) as LandingSection), enabled });

  it('sits AFTER the block’s content, in the page — it covers nothing below it, and stays on screen', () => {
    const { container } = render(<PageBlocks sections={[section()]} ctx={ctx()} selection={selection({ zoom: 1.5 })} />);
    const block = container.querySelector('[data-block-id="b1"]')!;
    const bar = screen.getByRole('button', { name: 'تعديل' }).parentElement as HTMLElement;
    expect(block.lastElementChild).toBe(bar);
    expect(bar.style.position).toBe('sticky');
    expect(bar.className).not.toMatch(/\babsolute\b/);
    // Drawn at its own size whatever the preview is zoomed to.
    expect(Number(bar.style.zoom)).toBeCloseTo(1 / 1.5, 3);
  });

  it('a hidden block dims its content, not the bar', () => {
    const { container } = render(<PageBlocks sections={[section(false)]} ctx={ctx()} selection={selection()} />);
    const bar = screen.getByRole('button', { name: 'تعديل' }).parentElement as HTMLElement;
    const dimmed = container.querySelector('.lp-trust')!.closest('[style*="opacity"]') as HTMLElement;
    expect(dimmed.style.opacity).toBe('0.45');
    // The bar is outside the dimmed box — on the old code the whole block, bar included, was the dimmed element.
    expect(dimmed.contains(bar)).toBe(false);
    expect(bar.closest('[style*="opacity"]')).toBeNull();
  });

  it('Enter on a control inside the bar is that control’s — the block is not re-selected', () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    render(<PageBlocks sections={[section()]} ctx={ctx()} selection={selection({ onSelect, onEdit })} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'تعديل' }), { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('copy and paste are a clipboard pair, and the source block offers no paste onto itself', () => {
    render(<PageBlocks sections={[section()]} ctx={ctx()} selection={selection({ hasCopiedLook: true, copiedFromId: 'b1' })} />);
    expect(screen.getByRole('button', { name: 'نُسخ — الصقه على قسم ثاني' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'لصق الشكل' })).toBeNull();
    cleanup();
    render(<PageBlocks sections={[section()]} ctx={ctx()} selection={selection({ hasCopiedLook: true, copiedFromId: 'other' })} />);
    expect(screen.getByRole('button', { name: 'لصق الشكل' })).toBeTruthy();
  });

  it('the floating-button block gets a strip where it sits, in the builder', () => {
    const sticky = landingSectionSchema.parse({ ...newSection('sticky'), id: 'b1' }) as LandingSection;
    render(<PageBlocks sections={[sticky]} ctx={ctx()} selection={selection()} />);
    expect(screen.getByText(/الزر العائم — بيطفو أسفل الشاشة/)).toBeTruthy();
  });

  it('NEGATIVE: the published page draws no stand-ins', () => {
    const sticky = landingSectionSchema.parse({ ...newSection('sticky'), id: 'b1' }) as LandingSection;
    render(<PageBlocks sections={[sticky]} ctx={{ ...ctx(), building: false }} />);
    expect(screen.queryByText(/الزر العائم — بيطفو أسفل الشاشة/)).toBeNull();
  });
});
