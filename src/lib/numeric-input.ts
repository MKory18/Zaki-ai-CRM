import { z } from 'zod';

/**
 * A NUMBER THAT ARRIVED FROM OUTSIDE — READ STRICTLY.
 *
 * `z.coerce.number()` is `Number(value)`, and `Number()` is more generous
 * than anyone writing a schema intends. Measured against the order and
 * inventory schemas as they stood:
 *
 *     null      → 0        an absent price became a free line
 *     []        → 0        so did an empty array
 *     "0x10"    → 16       a hex string became a quantity
 *     " 5 "     → 5        harmless, and the only one worth keeping
 *
 * None of these was reachable past the bounds checks with a LARGER number,
 * so nothing was being overcharged. What they did was turn malformed input
 * into a silent, plausible figure — and a zero price that should have been
 * a validation error is the kind of thing found weeks later in a margin.
 *
 * So: a number, or a string that is written the way a number is written.
 * Everything else fails the schema and the caller is told, which is what a
 * malformed request deserves.
 *
 * Query strings still work — `?limit=25` is a decimal string. Scientific
 * notation is allowed because a form may legitimately produce `5e-1`; the
 * bounds then decide whether the value is sane.
 */
const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * A string written the way a number is written becomes one; a number stays
 * one; everything else is handed on untouched so the schema refuses it and
 * the error names the field.
 */
function read(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // The empty string is `Number('') === 0` — the same silent zero.
    if (trimmed !== '' && NUMERIC.test(trimmed)) return Number(trimmed);
  }
  return value;
}

/**
 * The bounds are built FIRST and wrapped afterwards: `z.preprocess` returns
 * a wrapper with no `.int()` or `.min()` on it, so a chain written the
 * other way round does not compile — which is the schema telling the truth
 * about what it is.
 */
export const numeric = () => z.preprocess(read, z.number());

/** A count of things: whole, and never negative. */
export const count = (max: number, min = 0) => z.preprocess(read, z.number().int().min(min).max(max));

/** An amount of money: never negative, bounded so a typo cannot be a fortune. */
export const money = (max: number) => z.preprocess(read, z.number().min(0).max(max));
