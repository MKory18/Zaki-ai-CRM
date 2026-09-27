// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TemplatePreview } from './TemplatePreview';
import { PAGE_TEMPLATES, buildTemplate } from '@/lib/page-templates';

/**
 * THE PREVIEW ACTUALLY DRAWS THE TEMPLATE.
 *
 * Reading the source proves it calls the right renderer; this proves
 * something comes out. The failure worth catching is the quiet one — a
 * gallery of fifteen empty grey rectangles, which looks like a loading
 * state and is indistinguishable from a broken feature until somebody
 * opens the screen.
 */

afterEach(cleanup);

const product = { name: 'ماء الكمأ', price: 45000, currency: 'ل.س' };

describe('a template preview', () => {
  it('draws every template with something in it', () => {
    for (const t of PAGE_TEMPLATES) {
      const built = buildTemplate(t.key);
      const { container, unmount } = render(
        <TemplatePreview sections={built.sections} theme={built.theme} product={product} />
      );
      // Blocks, not an empty box: the smallest template still has several.
      expect(container.querySelectorAll('section, header, footer').length, `${t.key} فارغ`).toBeGreaterThan(1);
      unmount();
    }
  });

  it('sells the product it was given', () => {
    const built = buildTemplate('classic');
    const { container } = render(
      <TemplatePreview sections={built.sections} theme={built.theme} product={product} />
    );
    expect(container.textContent).toContain('ماء الكمأ');
    // The price too — a hero that shows one must show this product's.
    expect(container.textContent).toContain('45,000');
  });

  it('and says «منتجك» only when it was given none', () => {
    const built = buildTemplate('classic');
    const { container } = render(<TemplatePreview sections={built.sections} theme={built.theme} />);
    expect(container.textContent).toContain('منتجك');
    expect(container.textContent).not.toContain('ماء الكمأ');
  });

  it('shows where the photographs go, and never takes an order', () => {
    const built = buildTemplate('classic');
    const { container } = render(
      <TemplatePreview sections={built.sections} theme={built.theme} product={product} />
    );
    expect(container.textContent).toContain('صورة المنتج');
    expect(container.textContent).toContain('نموذج الطلب');
    // Inert: no field a person could type into, and nothing to submit.
    expect(container.querySelectorAll('input, textarea, button, form')).toHaveLength(0);
  });
});
