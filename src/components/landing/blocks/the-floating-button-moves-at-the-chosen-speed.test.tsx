// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { landingSectionSchema, newSection } from '@/lib/landing-sections';
import { BLOCK_CSS } from './styles';
import { StickyCta } from './StickyCta';

/**
 * «اضف سرعة حركة الزر العائم، اقدر اظبط السرعة بصفحات الهبوط».
 *
 * The movement the block already offers (up and down / side to side) now has a speed: slow, normal or fast. Normal is
 * the speed it always had, so every saved page reads as before; a still button has no speed at all.
 */

afterEach(cleanup);

type Motion = 'none' | 'bounce' | 'sway';
type Speed = 'slow' | 'normal' | 'fast';
const draw = (motion: Motion, motionSpeed?: Speed) =>
  render(
    <div className="lp-root">
      <StickyCta text="اطلب الآن" showPrice offers={[{ id: 'o1', price: 12, isDefault: true }]} basePrice={12} currency="USD" motion={motion} motionSpeed={motionSpeed} />
    </div>
  ).container.querySelector('.lp-sticky') as HTMLElement;

describe('the speed of the floating button', () => {
  it('is normal on a saved page that never chose one', () => {
    const s = landingSectionSchema.parse({ ...newSection('sticky'), motion: 'bounce' }) as { motionSpeed: Speed };
    expect(s.motionSpeed).toBe('normal');
  });

  it('only slow, normal or fast — anything else is refused', () => {
    expect(landingSectionSchema.safeParse({ ...newSection('sticky'), motionSpeed: 'fast' }).success).toBe(true);
    expect(landingSectionSchema.safeParse({ ...newSection('sticky'), motionSpeed: 'turbo' }).success).toBe(false);
  });

  it('a slow or fast choice reaches the button', () => {
    expect(draw('bounce', 'slow').getAttribute('data-speed')).toBe('slow');
    expect(draw('sway', 'fast').getAttribute('data-speed')).toBe('fast');
  });

  it('NEGATIVE: normal adds nothing, and a still button has no speed at all', () => {
    expect(draw('bounce', 'normal').hasAttribute('data-speed')).toBe(false);
    expect(draw('none', 'fast').hasAttribute('data-speed')).toBe(false);
  });

  it('the sheet stretches the same movement: slower is longer, faster is shorter, normal is the old timing', () => {
    expect(BLOCK_CSS).toContain("animation: lp-bounce calc(1.8s * var(--look-k, 1)) ease-in-out infinite;");
    expect(BLOCK_CSS).toContain("animation: lp-sway calc(2.2s * var(--look-k, 1)) ease-in-out infinite;");
    const k = (speed: string) => Number(BLOCK_CSS.match(new RegExp(`data-speed='${speed}'\\] \\{ --look-k: ([0-9.]+); \\}`))?.[1]);
    expect(k('slow')).toBeGreaterThan(1);
    expect(k('fast')).toBeLessThan(1);
  });

  it('NEGATIVE: and reduced motion still holds it still, whatever the speed', () => {
    expect(BLOCK_CSS).toContain('@media (prefers-reduced-motion: reduce) { .lp-sticky[data-motion] { animation: none; } }');
  });
});
