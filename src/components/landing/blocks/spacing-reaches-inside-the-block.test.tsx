// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { newSection } from '@/lib/landing-sections';
import { lookStyles } from '@/lib/block-look';
import { PageBlocks, type BlockContext } from './PageBlocks';
import { BLOCK_CSS } from './styles';

/**
 * «التباعد يتحكم بالحشوة الداخلية كمان، بلا = صفر».
 *
 * The spacing choice used to set only the space AROUND a block; a section block kept its own 30px inside and 18px under
 * its heading, so «بلا» on the product name above the posters still left a tall white box. «بلا» and «ضيّق» now reach
 * inside; «عادي» and «واسع» leave every page exactly as it was.
 */

afterEach(cleanup);

const ctx: BlockContext = {
  palette: {} as BlockContext['palette'], productName: 'x', price: 1, currency: 'SYP',
  stock: null, offers: [], form: null, store: { name: 'صحة', logo: null, phone: null },
};

const title = (space: 'none' | 'tight' | 'normal' | 'roomy') => {
  const s = newSection('text');
  return { ...s, title: 'ماء الكمأة للعين', body: 'توصيل مجاني', look: { ...s.look, space } } as ReturnType<typeof newSection>;
};

describe('the inner padding follows the spacing choice', () => {
  it('«بلا» is zero inside, with a small gap under the heading', () => {
    expect(lookStyles(title('none').look).vars).toMatchObject({ '--look-section-pad': '0', '--look-h2-gap': '6px' });
  });

  it('«ضيّق» is a little', () => {
    expect(lookStyles(title('tight').look).vars).toMatchObject({ '--look-section-pad': '8px', '--look-h2-gap': '10px' });
  });

  it('NEGATIVE: «عادي» and «واسع» do not touch the inside — every existing page reads as it did', () => {
    for (const space of ['normal', 'roomy'] as const) {
      const v = lookStyles(title(space).look).vars;
      expect(v['--look-section-pad'], space).toBeUndefined();
      expect(v['--look-h2-gap'], space).toBeUndefined();
    }
  });

  it('the block on the page carries the flag that turns the inner rule on — and only for «بلا»/«ضيّق»', () => {
    const { container: none } = render(<PageBlocks sections={[title('none')]} ctx={ctx} />);
    const flagged = none.querySelector('[data-look-pad]') as HTMLElement;
    expect(flagged).not.toBeNull();
    expect(flagged.querySelector('.lp-section')).not.toBeNull();
    cleanup();
    const { container: roomy } = render(<PageBlocks sections={[title('roomy')]} ctx={ctx} />);
    expect(roomy.querySelector('[data-look-pad]')).toBeNull();
  });

  it('and the stylesheet has that rule, stronger than a family’s own section padding', () => {
    expect(BLOCK_CSS).toContain('html [data-look-pad] .lp-section { padding-block: var(--look-section-pad); }');
    expect(BLOCK_CSS).toContain('html [data-look-pad] .lp-h2 { margin-bottom: var(--look-h2-gap); }');
  });
});
