// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { PageBlocks, type BlockContext } from './PageBlocks';
import { sectionsFor } from '../../../../scripts/sehha/pages';
import { CATALOG } from '../../../../scripts/sehha/catalog';

/**
 * «اكتب اسم المنتج أعلى اللاندنج نص بخط جميل».
 *
 * The page's first block must actually DRAW the name — as the block's heading, in the display face, above the
 * posters — and not be one of the blocks that render nothing (a `text` block with no body does).
 */

afterEach(cleanup);

const ctx = (): BlockContext => ({
  palette: {} as BlockContext['palette'], productName: 'x', price: 1, currency: 'USD', stock: null, offers: [], form: <div>FORM</div>,
});

describe('the page’s first block', () => {
  const item = CATALOG[0];
  const draw = () => render(<PageBlocks sections={sectionsFor(['/p/1.webp'], { name: item.pageName, line: item.strip })} ctx={ctx()} />);

  it('draws the product’s name as a heading, with the delivery line under it', () => {
    const { container } = draw();
    const h2 = container.querySelector('h2');
    expect(h2?.textContent).toBe(item.pageName);
    expect(container.textContent).toContain(item.strip);
  });

  it('comes before the posters', () => {
    const { container } = draw();
    const heading = container.querySelector('h2')!;
    const poster = container.querySelector('.lp-gallery')!;
    expect(heading.compareDocumentPosition(poster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('wears the display face — «المصيري» — and a larger size, on the block that holds the name', () => {
    const { container } = draw();
    const h2 = container.querySelector('h2')!;
    // the block's own styles (font, size, weight) are on an ancestor; the sheet's [data-look-*] rules carry them to the heading
    const styled = h2.closest('[style*="font-family"]') as HTMLElement;
    expect(styled.style.fontFamily).toContain('El Messiri');
    expect(styled.style.fontWeight).toBeTruthy();
    expect(styled.style.fontSize).toBe('1.18em');
    expect(h2.closest('[data-look-font]')).not.toBeNull();
    expect(h2.closest('[data-look-size]')).not.toBeNull();
  });
});
