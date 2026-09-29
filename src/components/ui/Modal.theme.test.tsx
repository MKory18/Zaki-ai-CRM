// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';

import { Modal } from './Modal';

/**
 * A DIALOG WEARS THE PERSON'S THEME, NOT THE DEFAULT ONE.
 *
 * Every colour in this product is a custom property declared on
 * `[data-sys-theme]`, which `SystemFrame` renders on a div inside the
 * document element. A dialog portalled into `<body>` is that div's SIBLING,
 * so it inherited nothing and fell back to the `:root` block — the dark
 * «ops» palette.
 *
 * Nobody on the default theme could see it, which is 18 of this shop's 19
 * accounts. For the one person on «النهار», every dialog in the product
 * rendered dark over a light page. The same trap was already known for
 * fonts and worked around in `SystemFrame`; the colours were not.
 *
 * This is a render test rather than a source guard on purpose: the defect
 * was never in how the code reads, it was in where the node landed.
 */

afterEach(cleanup);

const frame = (theme: string, children: React.ReactNode) => (
  <div data-sys-theme={theme}>{children}</div>
);

describe('where a dialog lands in the DOM', () => {
  it('lands inside the themed frame, not beside it', () => {
    render(
      frame(
        'day',
        <Modal isOpen onClose={() => undefined} title="عنوان">
          <p>محتوى</p>
        </Modal>
      )
    );
    const host = document.querySelector('[data-sys-theme="day"]');
    const dialog = screen.getByText('محتوى');
    expect(host).not.toBeNull();
    expect(host!.contains(dialog), 'الحوار خارج إطار الثيم — يرث اللوحة الافتراضية').toBe(true);
  });

  /**
   * AND IT IS STILL NOT A CHILD OF WHATEVER OPENED IT.
   *
   * That is why the portal exists: a dialog opened from inside a clickable
   * row used to be a DOM child of that row, so every click inside it
   * bubbled up and opened the row behind it. Fixing the theme must not
   * bring that back.
   */
  it('and is still outside the row that opened it', () => {
    render(
      frame(
        'ops',
        <div data-testid="row">
          <Modal isOpen onClose={() => undefined} title="عنوان">
            <p>محتوى</p>
          </Modal>
        </div>
      )
    );
    const row = screen.getByTestId('row');
    expect(row.contains(screen.getByText('محتوى')), 'الحوار عاد ابناً للصفّ').toBe(false);
  });

  /** Outside the dashboard — a seller's own surface — `<body>` is right. */
  it('falls back to the body when there is no themed frame', () => {
    render(
      <Modal isOpen onClose={() => undefined} title="عنوان">
        <p>محتوى</p>
      </Modal>
    );
    expect(document.body.contains(screen.getByText('محتوى'))).toBe(true);
  });
});
