'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * UNDO, AND THE PERMISSION TO EXPERIMENT.
 *
 * A visual editor without it makes people cautious: you do not try the
 * bolder colour, you do not delete a block to see how the page reads
 * without it, because getting back means rebuilding by hand. Caution costs
 * more than any missing feature.
 *
 * ONE piece of state holds all three parts. An earlier version kept past,
 * present and future as three separate `useState`s and a ref to stop undo
 * from recording itself — and that ref, still set when the next edit
 * arrived, swallowed the edit and left a redo pointing at a page that no
 * longer existed. Three values that must agree are one value.
 *
 * It does NOT record every keystroke. Typing a headline is one change, not
 * forty, so edits arriving within `settleMs` of each other extend the entry
 * already on the stack. Otherwise Ctrl+Z undoes one letter.
 */

interface State<T> {
  past: T[];
  value: T;
  future: T[];
}

export interface History<T> {
  value: T;
  /** Records a step. Merges with the last if it lands inside settleMs. */
  set: (next: T) => void;
  /** Replaces without touching history — for loading, not for editing. */
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const LIMIT = 50;

export function useHistory<T>(initial: T, settleMs = 600): History<T> {
  const [state, setState] = useState<State<T>>({ past: [], value: initial, future: [] });
  const lastAt = useRef(0);

  const set = useCallback(
    (next: T) => {
      const now = Date.now();
      const quick = now - lastAt.current < settleMs;
      lastAt.current = now;

      setState((s) => ({
        // A burst of quick edits is one step: the value already on the
        // stack stays, and only the working value moves.
        past: quick ? s.past : [...s.past, s.value].slice(-LIMIT),
        value: next,
        // Anything done after an undo makes the undone branch unreachable.
        // Keeping it would offer a redo into a page that no longer exists.
        future: [],
      }));
    },
    [settleMs]
  );

  const reset = useCallback((next: T) => {
    lastAt.current = 0;
    setState({ past: [], value: next, future: [] });
  }, []);

  const undo = useCallback(() => {
    lastAt.current = 0;
    setState((s) =>
      s.past.length === 0
        ? s
        : {
            past: s.past.slice(0, -1),
            value: s.past[s.past.length - 1],
            future: [s.value, ...s.future].slice(0, LIMIT),
          }
    );
  }, []);

  const redo = useCallback(() => {
    lastAt.current = 0;
    setState((s) =>
      s.future.length === 0
        ? s
        : {
            past: [...s.past, s.value].slice(-LIMIT),
            value: s.future[0],
            future: s.future.slice(1),
          }
    );
  }, []);

  return {
    value: state.value,
    set,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
