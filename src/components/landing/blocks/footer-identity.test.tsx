// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { newSection } from '@/lib/landing-sections';
import { PageBlocks, type BlockContext } from './PageBlocks';

/**
 * THE FOOTER SHOWS THE STORE, NOT A COPY OF IT.
 *
 * Each page's footer kept its own logo and phone, a second place for the
 * store's identity to drift from the waybill and the shop. It reads the
 * store's now. A value a page saved before is shown only while the store
 * has none, so no live page lost its number when the field moved.
 */

afterEach(cleanup);

const ctx = (store: BlockContext['store']): BlockContext => ({
  palette: {} as BlockContext['palette'], productName: 'x', price: 1, currency: 'SYP',
  stock: null, offers: [], form: null, store,
});

const footer = (over: Record<string, string> = {}) => ({ ...newSection('footer'), ...over }) as ReturnType<typeof newSection>;

describe('the footer', () => {
  it('shows the store\u2019s logo and phone', () => {
    const { container } = render(
      <PageBlocks sections={[footer()]} ctx={ctx({ name: 'صحة', logo: '/api/public/store-logo/s/l.webp', phone: '0999 000 000' })} />
    );
    expect(container.querySelector('.lp-footer-logo')?.getAttribute('src')).toBe('/api/public/store-logo/s/l.webp');
    expect(container.querySelector('.lp-footer-phone')?.textContent).toContain('0999 000 000');
  });

  it('prefers the store over a value the page saved before the move', () => {
    const { container } = render(
      <PageBlocks sections={[footer({ phone: '0111', logo: '/old.webp' })]} ctx={ctx({ name: 'صحة', logo: '/store.webp', phone: '0999' })} />
    );
    expect(container.querySelector('.lp-footer-logo')?.getAttribute('src')).toBe('/store.webp');
    expect(container.querySelector('.lp-footer-phone')?.textContent).toContain('0999');
  });

  it('keeps a page\u2019s old number while its store has none — no live page loses it', () => {
    const { container } = render(
      <PageBlocks sections={[footer({ phone: '0111 222' })]} ctx={ctx({ name: 'صحة', logo: null, phone: null })} />
    );
    expect(container.querySelector('.lp-footer-phone')?.textContent).toContain('0111 222');
  });

  it('shows neither when nobody has one', () => {
    const { container } = render(<PageBlocks sections={[footer()]} ctx={ctx(null)} />);
    expect(container.querySelector('.lp-footer-logo')).toBeNull();
    expect(container.querySelector('.lp-footer-phone')).toBeNull();
  });
});
