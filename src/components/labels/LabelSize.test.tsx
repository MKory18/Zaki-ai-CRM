// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { LabelSizePicker, forgetLabelSize, useLabelSize } from './LabelSize';

/**
 * PICKING A SIZE AND PRINTING IT.
 *
 * The complaint from every warehouse: choosing a label size has no effect.
 * The reproduction is below, and it is not the @page rule — that rule is
 * written with a literal value.
 *
 * `useLabelSize()` is a hook over localStorage with NO shared state. A
 * screen that prints calls it once for the size, and renders
 * `<LabelSizePicker />`, which calls it again for the dropdown. Two calls,
 * two independent pieces of React state, and nothing connecting them:
 *
 *   - `setItem` does not notify the document that called it. The `storage`
 *     event fires in OTHER tabs, never in this one — by specification.
 *   - There is no context, no custom event, no external store.
 *
 * So the dropdown changes, localStorage changes, and the print button goes
 * on sending the size that was in storage when the screen mounted. It
 * starts working after a reload, which is why it reads as "sometimes" and
 * why nobody could pin it down.
 */

/** A screen: it prints with one instance and renders the picker, which has another. */
function ScreenThatPrints() {
  const forPrinting = useLabelSize();
  return (
    <div>
      <output data-testid="will-print">
        {forPrinting.dims.width}×{forPrinting.dims.height}
      </output>
      <LabelSizePicker />
    </div>
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  // The store is one module-level value shared by every caller — which is
  // the whole point of it, and which means a test must clear it too.
  forgetLabelSize();
});

describe('the size the print button will actually send', () => {
  it('starts at the default', async () => {
    await act(async () => {
      render(<ScreenThatPrints />);
    });
    expect(screen.getByTestId('will-print').textContent).toBe('100×150');
  });

  it('FOLLOWS the dropdown in the same tab — the defect', async () => {
    await act(async () => {
      render(<ScreenThatPrints />);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('مقاس البوليصة'), { target: { value: '100x100' } });
    });

    // The choice reached storage...
    expect(JSON.parse(localStorage.getItem('salesflow.labelSize')!).key).toBe('100x100');
    // ...and it must reach the thing that prints, in this tab, now.
    expect(screen.getByTestId('will-print').textContent).toBe('100×100');
  });

  it('and a custom size in millimetres reaches it too', async () => {
    await act(async () => {
      render(<ScreenThatPrints />);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('مقاس البوليصة'), { target: { value: 'custom' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('العرض بالمليمتر'), { target: { value: '80' } });
      fireEvent.change(screen.getByLabelText('الارتفاع بالمليمتر'), { target: { value: '60' } });
    });

    expect(screen.getByTestId('will-print').textContent).toBe('80×60');
  });

  it('survives a reload — the size is remembered, not just current', async () => {
    await act(async () => {
      render(<ScreenThatPrints />);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('مقاس البوليصة'), { target: { value: 'a6' } });
    });

    cleanup();
    await act(async () => {
      render(<ScreenThatPrints />);
    });
    expect(screen.getByTestId('will-print').textContent).toBe('105×148');
  });
});

/**
 * THE GUARD FOR THE DEFECT ITSELF.
 *
 * The cure is one external store instead of a `useState` per caller. These
 * check the property that matters — every reader agrees, now — rather than
 * the mechanism, so a future rewrite that keeps the promise still passes.
 */
describe('every reader agrees', () => {
  function ThreeReaders() {
    const a = useLabelSize();
    const b = useLabelSize();
    return (
      <div>
        <output data-testid="a">{a.dims.width}</output>
        <output data-testid="b">{b.dims.width}</output>
        <LabelSizePicker />
      </div>
    );
  }

  it('three instances in one tree move together', async () => {
    await act(async () => {
      render(<ThreeReaders />);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('مقاس البوليصة'), { target: { value: 'a4' } });
    });
    expect(screen.getByTestId('a').textContent).toBe('210');
    expect(screen.getByTestId('b').textContent).toBe('210');
  });

  it('and a change made in another tab reaches this one', async () => {
    await act(async () => {
      render(<ThreeReaders />);
    });
    // What the browser does when a second tab writes the key.
    localStorage.setItem('salesflow.labelSize', JSON.stringify({ key: '100x100', custom: { width: 100, height: 150 } }));
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'salesflow.labelSize' }));
    });
    expect(screen.getByTestId('a').textContent).toBe('100');
  });
});

describe('the preview shows what will print', () => {
  it('names the millimetres that will be sent', async () => {
    await act(async () => {
      render(<LabelSizePicker />);
    });
    expect(screen.getByTestId('preview-mm').textContent).toBe('100×150 mm');
  });

  it('and follows the choice', async () => {
    await act(async () => {
      render(<LabelSizePicker />);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('مقاس البوليصة'), { target: { value: 'a6' } });
    });
    expect(screen.getByTestId('preview-mm').textContent).toBe('105×148 mm');
    // A6 on A4 is four to a sheet — the dropdown's claim, shown.
    expect(screen.getByText('4 لكل ورقة')).toBeTruthy();
  });
});
