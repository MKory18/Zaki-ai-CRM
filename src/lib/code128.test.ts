import { describe, it, expect } from 'vitest';
import { code128Bars, encodableCode128 } from './labels';

/**
 * Code 128 is read by width. A symbol that is a module short, or that ends
 * on a space, prints fine and fails at the scanner — at a courier's depot,
 * where nobody can see why.
 */
describe('Code 128B, to the specification', () => {
  const value = 'JO7000000123';
  const bars = code128Bars(value);
  const modules = bars.reduce((a, b) => a + b, 0);

  it('is start + data + check (11 modules each) + stop (13 modules)', () => {
    expect(modules).toBe(11 * (value.length + 2) + 13);
  });

  it('ends on a BAR — the termination bar the old stop pattern left out', () => {
    // Elements alternate bar, space, bar…: an odd count ends on a bar.
    expect(bars.length % 2).toBe(1);
    expect(bars.slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2]);
  });

  it('starts with Start B', () => {
    expect(bars.slice(0, 6)).toEqual([2, 1, 1, 2, 1, 4]);
  });

  it('uses only widths 1 to 4', () => {
    expect(bars.every((w) => w >= 1 && w <= 4)).toBe(true);
  });
});

describe('what is encoded is what is captioned', () => {
  it('keeps printable ASCII', () => {
    expect(encodableCode128('JO7000000123')).toBe('JO7000000123');
  });

  it('drops what code set B cannot hold', () => {
    expect(encodableCode128('SY-٢٠٢٦-طلب-0097')).toBe('SY---0097');
  });

  it('caps at forty characters', () => {
    expect(encodableCode128('X'.repeat(50))).toHaveLength(40);
  });

  it('never encodes nothing', () => {
    expect(encodableCode128('')).toBe('0');
    expect(encodableCode128('طلب')).toBe('0');
  });
});
