// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newSection, parseSections, SECTION_LABEL, SINGLETON } from '@/lib/landing-sections';
import { PageBlocks, type BlockContext } from './PageBlocks';

/**
 * THE SLIDER AND THE THANK-YOU PAGE — the two sections a store's front
 * needed that no landing page had. They live in the shared library, so
 * every landing page gets them too.
 */

afterEach(cleanup);

const ctx = (over: Partial<BlockContext> = {}): BlockContext => ({
  palette: {} as BlockContext['palette'],
  productName: 'كريم',
  price: 10,
  currency: 'SYP',
  stock: null,
  offers: [],
  form: <div>FORM</div>,
  ...over,
});

describe('in the library', () => {
  it('both have names, defaults, and survive a round trip through storage', () => {
    expect(SECTION_LABEL.slider).toBeTruthy();
    expect(SECTION_LABEL.thankyou).toBe('صفحة الشكر');
    const stored = JSON.stringify([newSection('slider'), newSection('thankyou')]);
    const back = parseSections(stored);
    expect(back.map((s) => s.type)).toEqual(['slider', 'thankyou']);
    const slider = back[0];
    expect(slider.type === 'slider' && slider.autoplay && slider.seconds).toBe(4);
  });

  it('a page holds one thank-you page, and any number of sliders', () => {
    expect(SINGLETON).toContain('thankyou');
    expect(SINGLETON).not.toContain('slider');
  });

  it('refuses a slider timing that would flicker or stall', () => {
    const bad = { ...newSection('slider'), seconds: 1 };
    expect(parseSections([bad])).toHaveLength(0);
  });
});

describe('the slider on the page', () => {
  const slider = (images: string[]) => ({ ...newSection('slider'), images } as ReturnType<typeof newSection>);

  it('shows every photo with a dot for each, and moves on a dot', () => {
    const { container } = render(<PageBlocks sections={[slider(['/a.jpg', '/b.jpg', '/c.jpg'])]} ctx={ctx()} />);
    expect(container.querySelectorAll('.lp-slider-slide img')).toHaveLength(3);
    const dots = screen.getAllByRole('button', { name: /الصورة/ });
    expect(dots).toHaveLength(3);
    fireEvent.click(dots[2]);
    expect(dots[2].getAttribute('aria-current')).toBe('true');
  });

  it('draws nothing with no photos', () => {
    const { container } = render(<PageBlocks sections={[slider([])]} ctx={ctx()} />);
    expect(container.querySelector('.lp-slider')).toBeNull();
  });
});

describe('the thank-you page', () => {
  const thanks = { ...newSection('thankyou'), title: 'شكراً يا غالي', message: 'نتصل بك خلال ساعة' } as ReturnType<typeof newSection>;

  it('is not part of the published page — the form turns into it after an order', () => {
    const { container } = render(<PageBlocks sections={[thanks]} ctx={ctx()} />);
    expect(container.textContent).not.toContain('شكراً يا غالي');
  });

  it('is visible and editable in the builder', () => {
    const { container } = render(<PageBlocks sections={[thanks]} ctx={ctx({ building: true })} />);
    expect(container.textContent).toContain('شكراً يا غالي');
    expect(container.textContent).toContain('نتصل بك خلال ساعة');
  });
});
