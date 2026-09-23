import { describe, it, expect } from 'vitest';
import { copyName } from './[id]/duplicate/route';

/**
 * A copy's name has one job: telling you which row is which, at a glance,
 * in a list. «صفحة (نسخة) (نسخة)» fails at that, and the next copy of it
 * would have grown a third.
 */
describe('naming a duplicate', () => {
  it('adds the suffix to a fresh name', () => {
    expect(copyName('عرض المنتج', new Set())).toBe('عرض المنتج (نسخة)');
  });

  it('numbers instead of stacking, when the plain copy is taken', () => {
    expect(copyName('عرض المنتج', new Set(['عرض المنتج (نسخة)']))).toBe('عرض المنتج (نسخة 2)');
  });

  // The bug: the source was itself a copy, so the suffix doubled.
  it('copies a copy without doubling the suffix', () => {
    expect(copyName('صفحة فحص البلوكات (نسخة)', new Set(['صفحة فحص البلوكات (نسخة)'])))
      .toBe('صفحة فحص البلوكات (نسخة 2)');
  });

  it('copies a numbered copy and keeps counting', () => {
    const taken = new Set(['صفحة (نسخة)', 'صفحة (نسخة 2)']);
    expect(copyName('صفحة (نسخة 2)', taken)).toBe('صفحة (نسخة 3)');
  });

  it('leaves a name that merely CONTAINS the word alone', () => {
    expect(copyName('نسخة احتياطية', new Set())).toBe('نسخة احتياطية (نسخة)');
  });

  it('never returns an empty name', () => {
    expect(copyName('(نسخة)', new Set()).length).toBeGreaterThan(0);
  });
});
