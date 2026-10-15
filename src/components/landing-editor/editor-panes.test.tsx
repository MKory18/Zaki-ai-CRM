// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PaneToggle, editPaneClass, previewPaneClass, type EditorPane } from './EditorPanes';
import { Advanced } from './Advanced';
import { UndoBar } from './UndoBar';
import { useHistory } from '@/lib/use-history';

/**
 * THE THREE PIECES EVERY EDITOR NOW SHARES, DRIVEN BY HAND.
 *
 * The guard beside this (`the-editors-stand-beside-the-page.test.ts`) reads
 * the source and holds the WIRING: that each editor has a toggle, a fold and
 * an undo. It cannot tell whether pressing them does anything. These cases
 * press them.
 *
 * What is checked is the property, not the markup: that both halves of the
 * editor are REACHABLE on a phone, that the fold hides without destroying,
 * and that the step back lands on the value from before the last change.
 * Each of those is a thing a seller would notice in the first minute and no
 * guard reading source would.
 *
 * `jest-dom` is not set up in this repo, so the assertions are plain DOM
 * reads — `getAttribute`, `.disabled`, `.className`. One matcher library
 * fewer is also one fewer thing for a reader to know.
 *
 * The repo's convention for a component test: vitest's environment is
 * `node`, so nothing unmounts between cases on its own.
 */
afterEach(cleanup);

const press = (name: string) => screen.getByRole('button', { name });

/** The toggle as an editor holds it: one piece of state, two halves. */
function TwoPanes() {
  const [pane, setPane] = useState<EditorPane>('edit');
  return (
    <div>
      <PaneToggle pane={pane} onPane={setPane} />
      <div data-testid="controls" className={editPaneClass(pane)}>
        اللون الأساسي
      </div>
      <div data-testid="preview" className={previewPaneClass(pane)}>
        معاينة مباشرة
      </div>
    </div>
  );
}

describe('the edit / preview toggle', () => {
  it('starts on the controls, because that is what a seller came to do', () => {
    render(<TwoPanes />);
    // `hidden` is the class that takes a pane off a phone; the `lg:*` half
    // brings both back above 1024px, where the toggle is not drawn at all.
    expect(screen.getByTestId('controls').className).not.toContain('hidden');
    expect(screen.getByTestId('preview').className).toContain('hidden');
  });

  it('and one tap puts the page in front of them', async () => {
    const user = userEvent.setup();
    render(<TwoPanes />);
    await user.click(press('معاينة'));

    expect(screen.getByTestId('preview').className).not.toContain('hidden');
    expect(screen.getByTestId('controls').className).toContain('hidden');
    // And it says which half you are in, for somebody who cannot see which
    // segment is coloured.
    expect(press('معاينة').getAttribute('aria-pressed')).toBe('true');
    expect(press('تعديل').getAttribute('aria-pressed')).toBe('false');
  });

  it('and one tap back, with both halves in the tree the whole time', async () => {
    /*
     * HIDDEN, NOT UNMOUNTED — and this is the case that proves it.
     *
     * Rendering the preview conditionally would rebuild the whole page on
     * every tap and lose its scroll position, its zoom and the block the
     * seller had open. Both panes are queryable in both states, which is
     * only true if neither is ever removed.
     */
    const user = userEvent.setup();
    render(<TwoPanes />);
    await user.click(press('معاينة'));
    expect(screen.getByTestId('controls')).toBeTruthy();
    await user.click(press('تعديل'));
    expect(screen.getByTestId('preview')).toBeTruthy();
    expect(screen.getByTestId('controls').className).not.toContain('hidden');
  });
});

describe('the «متقدّم» fold', () => {
  it('is closed when the editor opens, and says what is inside', () => {
    render(
      <Advanced holds="خطّك · الزوايا · خلفية الصفحة">
        <input aria-label="خلفية الصفحة كلها" />
      </Advanced>
    );
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
    // Not a mystery row: a seller who set one of these last week has to be
    // able to tell that this is where it went.
    expect(screen.getByText('خطّك · الزوايا · خلفية الصفحة')).toBeTruthy();
    expect(screen.getByText('متقدّم')).toBeTruthy();
  });

  it('opens on a press and keeps what was typed when it closes again', async () => {
    /*
     * The control is still THERE while folded — `hidden`, not unmounted —
     * so a half-typed path survives a seller folding the section to look at
     * the preview. Unmounting it would throw the value away, which reads as
     * the editor forgetting.
     */
    const user = userEvent.setup();
    render(
      <Advanced>
        <input aria-label="خلفية الصفحة كلها" />
      </Advanced>
    );
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');

    const field = screen.getByLabelText('خلفية الصفحة كلها') as HTMLInputElement;
    await user.type(field, '/api/public/media/a.webp');
    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
    expect(
      (screen.getByLabelText('خلفية الصفحة كلها') as HTMLInputElement).value,
      'الطيّ أكل اللي كُتب جوّاته'
    ).toBe('/api/public/media/a.webp');
  });
});

describe('the step back', () => {
  /** A toy editor: one value, the shared history, the shared control. */
  function Editor() {
    // `settleMs: 0` so two presses are two steps rather than one burst —
    // the merging of quick edits has its own cases in `use-history.test.ts`.
    const history = useHistory<number>(0, 0);
    return (
      <div>
        <span data-testid="value">{history.value}</span>
        <button type="button" onClick={() => history.set(history.value + 1)}>
          عدّل
        </button>
        <UndoBar
          undo={history.undo}
          redo={history.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
        />
      </div>
    );
  }

  it('is dead until there is a step to take', () => {
    render(<Editor />);
    // Not hidden: a seller has to be able to see that the editor HAS an
    // undo before they need one.
    expect((press('تراجع') as HTMLButtonElement).disabled).toBe(true);
    expect((press('إعادة') as HTMLButtonElement).disabled).toBe(true);
  });

  it('restores the value that was there before the last change', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const edit = press('عدّل');
    await user.click(edit);
    await user.click(edit);
    expect(screen.getByTestId('value').textContent).toBe('2');

    await user.click(press('تراجع'));
    expect(screen.getByTestId('value').textContent, 'التراجع ما رجّع الخطوة').toBe('1');
    await user.click(press('تراجع'));
    expect(screen.getByTestId('value').textContent).toBe('0');
    expect((press('تراجع') as HTMLButtonElement).disabled).toBe(true);
  });

  it('and the way forward stands until a new change makes it unreachable', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const edit = press('عدّل');
    await user.click(edit);
    await user.click(press('تراجع'));
    expect((press('إعادة') as HTMLButtonElement).disabled).toBe(false);

    await user.click(press('إعادة'));
    expect(screen.getByTestId('value').textContent).toBe('1');

    // Anything done after an undo makes the undone branch unreachable:
    // keeping it would offer a redo into a page that no longer exists.
    await user.click(press('تراجع'));
    await user.click(edit);
    expect((press('إعادة') as HTMLButtonElement).disabled).toBe(true);
  });

  it('and every icon-only press says what it is', () => {
    // Four of them across the toggle and this bar, and all four are
    // pictures. A screen reader announcing «button» four times is the same
    // screen as no labels at all.
    render(<UndoBar undo={vi.fn()} redo={vi.fn()} canUndo canRedo />);
    expect(press('تراجع').getAttribute('title')).toBe('تراجع — Ctrl+Z');
    expect(press('إعادة').getAttribute('title')).toBe('إعادة — Ctrl+Shift+Z');
  });
});
