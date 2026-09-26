// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { Modal } from './Modal';

/**
 * TYPING IN A DIALOG USED TO MOVE THE CURSOR OUT OF THE FIELD.
 *
 * Reported as «the site is stuck and nothing works — I cannot scroll until I
 * click on the screen», and the cause was one dependency.
 *
 * The scroll-lock-and-focus-trap effect listed `onClose` in its deps. 63
 * places render this component and 73 pass their closer as an arrow written
 * in place — `onClose={() => setOpenForm(null)}` — a new function identity on
 * every render. So the effect tore down and set up again on EVERY render of
 * the parent while the dialog was open, and its cleanup calls
 * `opener.focus()` before the setup re-focuses the panel's first control.
 *
 * Any field whose value lives in the parent's state re-renders the parent on
 * every keystroke. So every letter typed threw the caret back to the top of
 * the dialog, and the scroll lock was released and retaken in between.
 *
 * This is the test that reproduces it. It fails against the old component.
 */

afterEach(cleanup);

/** A dialog with a controlled field — the shape every form in this product has. */
function Host() {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState('');
  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} title="عنوان">
      <input aria-label="first" />
      <input aria-label="note" value={value} onChange={(e) => setValue(e.target.value)} />
    </Modal>
  );
}

describe('a dialog with a field in it', () => {
  it('keeps the cursor where the person is typing', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const note = screen.getByLabelText('note');
    await user.click(note);
    expect(document.activeElement).toBe(note);

    // Each keystroke re-renders the parent, which used to re-run the effect
    // and pull focus to the first control.
    await user.type(note, 'مرحبا');

    expect((note as HTMLInputElement).value).toBe('مرحبا');
    expect(
      document.activeElement,
      'التركيز قُفز خارج الحقل أثناء الكتابة'
    ).toBe(note);
  });

  /**
   * AND THE SCROLL LOCK IS PUT BACK AS IT WAS FOUND.
   *
   * The cleanup used to write `'unset'`, which is not «what it was» but
   * «scrollable». `MobileNav` locks the same property for its drawer and
   * restores the previous value properly; a dialog opened and closed above an
   * open drawer handed the page its scroll back underneath it.
   */
  it('gives the page back the scroll setting it found, not a guess', async () => {
    document.body.style.overflow = 'hidden'; // as a drawer would leave it

    function Toggle() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(false)}>اقفل</button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="عنوان">
            <input aria-label="x" />
          </Modal>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Toggle />);
    expect(document.body.style.overflow).toBe('hidden');

    await user.click(screen.getAllByText('اقفل')[0]);
    expect(document.body.style.overflow, 'أعاد التمرير لصفحةٍ كان تمريرُها مقفولاً').toBe('hidden');

    document.body.style.overflow = '';
  });

  it('and locks the page while it is open, then releases it', async () => {
    function Toggle() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>افتح</button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="عنوان">
            <button>تمّ</button>
          </Modal>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Toggle />);
    expect(document.body.style.overflow).toBe('');

    await user.click(screen.getByText('افتح'));
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });
});
