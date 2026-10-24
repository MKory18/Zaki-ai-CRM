// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { landingSectionSchema, newSection } from '@/lib/landing-sections';
import { BLOCK_CSS } from './styles';
import { PageBlocks, type BlockContext } from './PageBlocks';

/**
 * «صفحات الهبوط اعملهم زي هيك» — a poster is the page: one under another, whole.
 *
 * The gallery drew every picture as a square and cut a 9:16 poster to its middle band, words and all. `layout:
 * 'stack'` is the additive answer; the saved pages that lack the field must read as the grid they always were.
 */

afterEach(cleanup);

describe('the gallery block', () => {
  it('reads a page saved before the option existed as the grid it always was', () => {
    const old = { id: 'g1', type: 'gallery', title: '', images: ['/a.webp'] };
    expect(landingSectionSchema.parse(old)).toMatchObject({ layout: 'grid' });
  });

  it('accepts stack, and refuses anything else', () => {
    expect(landingSectionSchema.safeParse({ ...newSection('gallery'), layout: 'stack' }).success).toBe(true);
    expect(landingSectionSchema.safeParse({ ...newSection('gallery'), layout: 'masonry' }).success).toBe(false);
  });

  it('a new gallery is a grid unless asked', () => {
    expect(newSection('gallery')).toMatchObject({ layout: 'grid' });
  });
});

describe('the sheet', () => {
  it('draws a stack whole: one column, no cropping, no square', () => {
    const rule = BLOCK_CSS.match(/\.lp-gallery\[data-layout='stack'\] img \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('aspect-ratio: auto');
    expect(rule).toContain('height: auto');
    expect(rule).toContain('object-fit: contain');
    expect(BLOCK_CSS).toMatch(/\.lp-gallery\[data-layout='stack'\] \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  });

  it('and the grid is untouched: its pictures are still squares cut to fill', () => {
    const rule = BLOCK_CSS.match(/\.lp-gallery img \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('aspect-ratio: 1 / 1');
    expect(rule).toContain('object-fit: cover');
  });

});

describe('the block', () => {
  const ctx = (): BlockContext => ({
    palette: {} as BlockContext['palette'], productName: 'x', price: 1, currency: 'USD', stock: null, offers: [], form: <div>FORM</div>,
  });

  it('tells the sheet which layout it is, and draws every picture', () => {
    const stack = { ...newSection('gallery'), images: ['/a.webp', '/b.webp'], layout: 'stack' } as ReturnType<typeof newSection>;
    const grid = { ...newSection('gallery'), images: ['/a.webp'] } as ReturnType<typeof newSection>;
    const a = render(<PageBlocks sections={[stack]} ctx={ctx()} />);
    expect(a.container.querySelector('.lp-gallery')?.getAttribute('data-layout')).toBe('stack');
    expect(a.container.querySelectorAll('.lp-gallery img')).toHaveLength(2);
    a.unmount();
    const b = render(<PageBlocks sections={[grid]} ctx={ctx()} />);
    expect(b.container.querySelector('.lp-gallery')?.getAttribute('data-layout')).toBe('grid');
  });
});
