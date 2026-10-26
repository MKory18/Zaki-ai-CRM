// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { newSection, landingSectionSchema, type LandingSection } from '@/lib/landing-sections';
import { BLOCK_CSS } from './styles';
import { richTextCss } from '@/lib/rich-text';
import { PageBlocks, type BlockContext } from './PageBlocks';

/**
 * «هاي اللوحة باللاندنج فيها مشاكل بدها حل» — the owner's screenshot: «ضمانات» selected, ORANGE ringed under
 * «لون النص», SKY ringed under «لون العناوين», and «الدفع عند الاستلام» / «ادفع عند الاستلام — لا حاجة لبطاقة» both
 * still in the store's magenta. The trust card itself was painted the accent, so every chosen colour inherited into
 * the accent. Read with the page's REAL stylesheet, through the browser's cascade.
 */

afterEach(cleanup);

const PALETTE = { '--store-accent': '#b8256e', '--store-text': '#121926', '--store-muted': '#697586', '--store-accent-text': '#ffffff' };
const ORANGE = '#f59e0b';
const SKY = '#0ea5e9';

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

/**
 * jsdom applies the cascade (specificity, :is/:not) but leaves `var(--x, fallback)` and `inherit` unresolved: resolve
 * the first from the inline custom properties above the element, the second by asking the parent.
 */
function colourOf(el: Element | null): string {
  if (!el) return '';
  let value = getComputedStyle(el).color;
  for (let guard = 0; guard < 5 && value.includes('var('); guard++) {
    value = value.replace(/var\((--[\w-]+)(?:,\s*([^)]*))?\)/, (_m, name: string, fallback?: string) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const v = (n as HTMLElement).style?.getPropertyValue(name);
        if (v) return v.trim();
      }
      return (fallback ?? '').trim();
    });
  }
  if (!value || value === 'inherit') return colourOf(el.parentElement);
  return value.startsWith('#') ? rgb(value) : value;
}

const ctx = (): BlockContext => ({
  palette: {} as BlockContext['palette'],
  productName: 'x',
  price: 1,
  currency: 'USD',
  stock: null,
  offers: [],
  form: <div />,
});

function draw(section: LandingSection) {
  const style = document.createElement('style');
  style.textContent = BLOCK_CSS + richTextCss();
  document.head.appendChild(style);
  return render(
    <html lang="ar">
      <body>
        <div className="lp-root" style={PALETTE as React.CSSProperties}>
          <PageBlocks sections={[section]} ctx={ctx()} />
        </div>
      </body>
    </html>,
    { container: document.documentElement as unknown as HTMLElement }
  );
}

const trust = (text: Partial<NonNullable<LandingSection['look']>['text']> = {}, items?: { title: string; text: string }[]) => {
  const base = landingSectionSchema.parse({ ...newSection('trust'), id: 't1', ...(items ? { items } : {}) }) as LandingSection;
  return { ...base, look: { ...base.look!, text: { ...base.look!.text, ...text } } } as LandingSection;
};

describe('«ضمانات» — the screenshot', () => {
  it('«لون النص» orange: the title and the line under it are ORANGE, not the accent', () => {
    const { container } = draw(trust({ color: ORANGE }));
    const card = container.querySelector('.lp-trust > div')!;
    expect(colourOf(card.querySelector('strong')!)).toBe(rgb(ORANGE));
    expect(colourOf(card.querySelector('span')!)).toBe(rgb(ORANGE));
  });

  it('and the icon stays the store’s accent — it is the one part that is the brand', () => {
    const { container } = draw(trust({ color: ORANGE }));
    const icon = container.querySelector('.lp-trust > div svg') as SVGElement;
    expect(icon.getAttribute('style') ?? '').toContain('var(--store-accent)');
  });

  it('«لون العناوين» sky: the title is SKY and the line keeps the text colour', () => {
    const { container } = draw(trust({ color: ORANGE, headingColor: SKY }));
    const card = container.querySelector('.lp-trust > div')!;
    expect(colourOf(card.querySelector('strong')!)).toBe(rgb(SKY));
    expect(colourOf(card.querySelector('span')!)).toBe(rgb(ORANGE));
  });

  it('typed items behave the same', () => {
    const { container } = draw(trust({ color: ORANGE }, [{ title: 'توصيل سريع', text: 'خلال يومين' }]));
    expect(colourOf(container.querySelector('.lp-trust strong')!)).toBe(rgb(ORANGE));
  });

  it('NEGATIVE: with nothing chosen the card keeps its own colours — dark title, muted line, no accent on the words', () => {
    const { container } = draw(trust());
    const card = container.querySelector('.lp-trust > div')!;
    expect(colourOf(card.querySelector('strong')!)).toBe(rgb(PALETTE['--store-text']));
    expect(colourOf(card.querySelector('span')!)).toBe(rgb(PALETTE['--store-muted']));
  });
});

describe('item titles answer «لون العناوين» on the other blocks', () => {
  it('a benefit’s name takes the heading colour; its line does not', () => {
    const base = landingSectionSchema.parse({
      ...newSection('benefits'), id: 'b1', title: 'ليش منتجنا', items: [{ title: 'طبيعي', text: 'بدون مواد حافظة' }],
    }) as LandingSection;
    const s = { ...base, look: { ...base.look!, text: { ...base.look!.text, headingColor: SKY } } } as LandingSection;
    const { container } = draw(s);
    expect(colourOf(container.querySelector('.lp-benefits strong')!)).toBe(rgb(SKY));
    expect(colourOf(container.querySelector('.lp-benefits p')!)).not.toBe(rgb(SKY));
  });
});

describe('what keeps its own ink', () => {
  it('a word coloured by hand keeps its colour inside a coloured block', () => {
    const base = landingSectionSchema.parse({ ...newSection('text'), id: 'x1', title: 'عنوان', body: 'نص' }) as LandingSection;
    const s = { ...base, title: 'كلمة <span data-c="4">ملوّنة</span>', look: { ...base.look!, text: { ...base.look!.text, color: ORANGE } } } as LandingSection;
    const { container } = draw(s);
    const mark = container.querySelector('[data-c]');
    expect(mark).toBeTruthy();
    // The mark's own rule decides its colour; the block's «inherit» rule no longer reaches it.
    expect(colourOf(mark)).not.toBe(rgb(ORANGE));
  });

  it('the stylesheet’s inherit rule excludes marks, item titles, buttons and accent shapes', () => {
    const rule = BLOCK_CSS.match(/html \[data-look-color\] :is\([^)]*\):not\(([^{]*)\) \{/)?.[1] ?? '';
    for (const left of ['.lp-cta', '.lp-btn', '.lp-sticky', '.lp-sticky-wa', '[data-c]', '[data-it]', '[data-ink]']) expect(rule).toContain(left);
  });
});

describe('«عريض» and «كامل» widen the block', () => {
  it('the block’s own max-width gives way', () => {
    // Widened — with a ceiling, so a template that chose «كامل» still reads as lines on a wide screen.
    expect(BLOCK_CSS).toMatch(/\[data-look-wide\] :is\(\.lp-section, \.lp-trust, \.lp-hero, \.lp-urgency\) \{ max-width: min\(100%, 75rem\); \}/);
    const s = { ...trust(), look: { ...trust().look!, width: 'wide' } } as LandingSection;
    const { container } = draw(s);
    expect(container.querySelector('[data-look-wide]')).toBeTruthy();
  });
});

describe('a filled shape keeps its ink', () => {
  it('NEGATIVE: the hero offer pill keeps its own colours under a hero text colour — in every family', () => {
    const base = landingSectionSchema.parse({ ...newSection('hero'), id: 'h1', headline: 'منتج' }) as LandingSection;
    const s = { ...base, look: { ...base.look!, text: { ...base.look!.text, color: '#d6cec0' } } } as LandingSection;
    const style = document.createElement('style');
    style.textContent = BLOCK_CSS;
    document.head.appendChild(style);
    const { container } = render(
      <div className="lp-root" style={PALETTE as React.CSSProperties}>
        <PageBlocks
          sections={[s]}
          ctx={{ ...ctx(), family: 'clinic', offers: [{ id: 'o1', name: 'قطعتين', quantity: 2, freeQuantity: 0, price: 20, isDefault: true }] } as BlockContext}
        />
      </div>
    );
    const pill = container.querySelector('.lp-hero-offers');
    expect(pill).toBeTruthy();
    expect(pill!.hasAttribute('data-ink')).toBe(true);
    const name = pill!.querySelector('b');
    expect(name).toBeTruthy();
    expect(colourOf(name)).not.toBe(rgb('#d6cec0'));
  });

  it('the announcement bar takes a CHOSEN colour only — not the automatic white of a photo background', () => {
    const base = landingSectionSchema.parse({ ...newSection('announcement'), id: 'a1', text: 'شحن مجاني' }) as LandingSection;
    const chosen = { ...base, look: { ...base.look!, text: { ...base.look!.text, color: ORANGE } } } as LandingSection;
    const { container } = draw(chosen);
    expect((container.querySelector('.lp-announce') as HTMLElement).style.color).toBe('inherit');
    cleanup();
    const photo = {
      ...base,
      look: { ...base.look!, background: { ...base.look!.background, kind: 'image', image: '/x.webp', overlay: 0.4 } },
    } as LandingSection;
    const again = draw(photo);
    expect((again.container.querySelector('.lp-announce') as HTMLElement).style.color).toBe('');
  });
});
