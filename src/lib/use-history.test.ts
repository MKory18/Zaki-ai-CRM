// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from './use-history';

/**
 * Undo is what makes an editor safe to experiment in. These cover the
 * three ways this is usually written wrong.
 */
describe('a way back', () => {
  it('starts with nowhere to go', () => {
    const { result } = renderHook(() => useHistory('a'));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('steps back and forward again', () => {
    const { result } = renderHook(() => useHistory('a', 0));
    act(() => result.current.set('b'));
    act(() => result.current.set('c'));
    act(() => result.current.undo());
    expect(result.current.value).toBe('b');
    act(() => result.current.redo());
    expect(result.current.value).toBe('c');
  });

  // Written wrong #1: undo sets the value, which records a step, which
  // makes redo impossible and each undo bounce between two states.
  it('does not record its own moves', () => {
    const { result } = renderHook(() => useHistory('a', 0));
    act(() => result.current.set('b'));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    expect(result.current.value).toBe('a');
  });

  // Written wrong #2: every keystroke is a step, so Ctrl+Z removes one
  // letter and the person presses it thirty times.
  it('treats a burst of edits as one step', () => {
    const { result } = renderHook(() => useHistory('', 10_000));
    act(() => result.current.set('h'));
    act(() => result.current.set('he'));
    act(() => result.current.set('hea'));
    act(() => result.current.undo());
    expect(result.current.value).toBe('');
  });

  it('separates edits that are far enough apart', () => {
    const { result } = renderHook(() => useHistory('', 0));
    act(() => result.current.set('one'));
    act(() => result.current.set('two'));
    act(() => result.current.undo());
    expect(result.current.value).toBe('one');
  });

  // Written wrong #3: editing after an undo leaves a redo pointing at a
  // page that no longer exists.
  it('drops the undone branch once something new is done', () => {
    const { result } = renderHook(() => useHistory('a', 0));
    act(() => result.current.set('b'));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.set('c'));
    expect(result.current.canRedo).toBe(false);
  });

  it('loading is not an edit — it clears the way back', () => {
    const { result } = renderHook(() => useHistory('a', 0));
    act(() => result.current.set('b'));
    act(() => result.current.reset('loaded'));
    expect(result.current.value).toBe('loaded');
    expect(result.current.canUndo).toBe(false);
  });

  it('does nothing at the ends rather than throwing', () => {
    const { result } = renderHook(() => useHistory('a', 0));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.value).toBe('a');
  });
});
