// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { newSection } from '@/lib/landing-sections';
import { repoFile, stripComments } from '@/lib/guard-source';
import { PageBlocks, type BlockContext } from './PageBlocks';

/**
 * «هل صفحة اللاندنج ح تفتح بسرعة بسوريا؟» — measured on the live kamaa page: the first poster, the largest thing on the
 * screen, was `loading="lazy"`, so the browser held it until layout; and the server asked the database four
 * independent questions one after another before it sent a byte.
 */

afterEach(cleanup);

const ctx: BlockContext = {
  palette: {} as BlockContext['palette'], productName: 'x', price: 1, currency: 'USD',
  stock: null, offers: [], form: null, store: { name: 'صحة', logo: null, phone: null },
};
type Section = ReturnType<typeof newSection>;
const gallery = (images: string[]) => ({ ...newSection('gallery'), images }) as Section;
const text = () => ({ ...newSection('text'), title: 'ماء الكمأة للعين', body: 'توصيل مجاني' }) as Section;
const imgs = (c: HTMLElement) => [...c.querySelectorAll('.lp-gallery img')] as HTMLImageElement[];

describe('the first poster', () => {
  it('loads at once and first — eager, high priority — even under a title block', () => {
    const { container } = render(<PageBlocks sections={[text(), gallery(['/a.webp', '/b.webp', '/c.webp'])]} ctx={ctx} />);
    const [first, second] = imgs(container);
    expect(first.getAttribute('loading')).toBe('eager');
    expect(first.getAttribute('fetchpriority')).toBe('high');
    expect(second.getAttribute('loading')).toBe('lazy');
    expect(second.hasAttribute('fetchpriority')).toBe(false);
  });

  it('NEGATIVE: a second gallery, and a gallery far down the page, stay lazy — only one image jumps the queue', () => {
    const late = [text(), text(), text(), gallery(['/far.webp'])];
    const { container } = render(<PageBlocks sections={late} ctx={ctx} />);
    expect(imgs(container)[0].getAttribute('loading')).toBe('lazy');
    cleanup();
    const two = render(<PageBlocks sections={[gallery(['/a.webp']), gallery(['/z.webp'])]} ctx={ctx} />).container;
    expect(imgs(two).map((i) => i.getAttribute('loading'))).toEqual(['eager', 'lazy']);
  });
});

describe('the server', () => {
  it('asks the four independent questions at once, not one after another', () => {
    const src = stripComments(repoFile('src/components/landing/LandingPageView.tsx'));
    const all = src.indexOf('const [[offers, recs], regions, currency, trackingPixels] = await Promise.all([');
    expect(all).toBeGreaterThan(-1);
    const block = src.slice(all, src.indexOf(']);', all));
    for (const read of ['loadLpData(', 'db.region', 'sellingCurrency(', 'getTrackingPixelsForPage(']) expect(block, read).toContain(read);
    // NEGATIVE: none of them is awaited on its own any more.
    expect(src).not.toMatch(/await db\.region\.findMany/);
    expect(src).not.toMatch(/await sellingCurrency\(/);
    expect(src).not.toMatch(/await getTrackingPixelsForPage\(/);
  });
});
