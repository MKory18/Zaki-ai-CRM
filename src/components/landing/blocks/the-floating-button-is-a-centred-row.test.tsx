// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { landingSectionSchema, newSection } from '@/lib/landing-sections';
import { BLOCK_CSS } from './styles';
import { StickyCta } from './StickyCta';

/**
 * «الـCALL TO ACTION: الخط مش مزبوط، زايح ع جنب، ولازم أنيميشن كخيار — فوق لتحت أو يمين للشمال — واللون متناسق مع اللاندنج».
 *
 * The generic button-look rule made the floating button an inline-block, so its words and its price ran together and
 * sat against one side. It stays a centred row now; colour and size still come from the page (and the block's
 * «الزر» look). And a movement is a choice on the block — none by default, and none for reduced motion.
 */

afterEach(cleanup);

const draw = (motion?: 'none' | 'bounce' | 'sway') =>
  render(
    <div className="lp-root">
      <StickyCta text="اطلب الآن" showPrice offers={[{ id: 'o1', price: 12, isDefault: true }]} basePrice={12} currency="USD" motion={motion} />
    </div>
  );

describe('the floating button’s layout', () => {
  it('a later, equally specific rule keeps it a centred flex row — after the rule that turned it inline-block', () => {
    const generic = BLOCK_CSS.indexOf('html .lp-root :is(.lp-cta, .lp-btn, .lp-sticky)');
    const fix = BLOCK_CSS.indexOf('html .lp-root .lp-sticky {');
    expect(generic).toBeGreaterThan(-1);
    expect(fix).toBeGreaterThan(generic);
    const rule = BLOCK_CSS.slice(fix, BLOCK_CSS.indexOf('}', fix));
    expect(rule).toContain('display: flex');
    expect(rule).toContain('justify-content: center');
    expect(rule).toContain('gap: 10px');
  });

  it('NEGATIVE: and it does not take the colour or the size away from the page — those stay on the generic rule', () => {
    const fix = BLOCK_CSS.indexOf('html .lp-root .lp-sticky {');
    const rule = BLOCK_CSS.slice(fix, BLOCK_CSS.indexOf('}', fix));
    expect(rule).not.toMatch(/background|color:|font-size|padding/);
  });

  it('draws the words and the price as two separate pieces', () => {
    const { container } = draw();
    const a = container.querySelector('.lp-sticky')!;
    expect(a.querySelector('span')?.textContent).toBe('اطلب الآن');
    expect(a.querySelector('b')?.textContent).toBe('12 USD');
  });
});

describe('the movement', () => {
  it('is none by default — a saved page reads as still', () => {
    expect(landingSectionSchema.parse({ id: 's', type: 'sticky', text: 'اطلب الآن' })).toMatchObject({ motion: 'none' });
    expect(newSection('sticky')).toMatchObject({ motion: 'none' });
    const { container } = draw();
    expect(container.querySelector('.lp-sticky')!.hasAttribute('data-motion')).toBe(false);
  });

  it('up and down, or side to side, when the block asks', () => {
    const a = draw('bounce');
    expect(a.container.querySelector('.lp-sticky')!.getAttribute('data-motion')).toBe('bounce');
    a.unmount();
    const b = draw('sway');
    expect(b.container.querySelector('.lp-sticky')!.getAttribute('data-motion')).toBe('sway');
  });

  it('only those two, and anything else is refused', () => {
    expect(landingSectionSchema.safeParse({ ...newSection('sticky'), motion: 'spin' }).success).toBe(false);
  });

  it('the sheet moves it: up and down for bounce, side to side for sway', () => {
    expect(BLOCK_CSS).toMatch(/\.lp-sticky\[data-motion='bounce'\] \{ animation: lp-bounce/);
    expect(BLOCK_CSS).toMatch(/\.lp-sticky\[data-motion='sway'\] \{ animation: lp-sway/);
    expect(BLOCK_CSS).toMatch(/@keyframes lp-bounce \{[^}]*translateY/);
    expect(BLOCK_CSS).toMatch(/@keyframes lp-sway \{[^}]*translateX/);
  });

  it('NEGATIVE: and holds still for anybody whose device asks for reduced motion', () => {
    expect(BLOCK_CSS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.lp-sticky\[data-motion\] \{ animation: none; \} \}/);
  });
});
