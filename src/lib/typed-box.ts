/**
 * THE BROWSER HALF OF THE NUMBER RULE — ONE COPY OF IT.
 *
 * `numeric-input.ts` is the DOOR's reader: it decides what a request is
 * allowed to carry and refuses the rest by name. This file is the other
 * half, and the two are deliberately not the same thing. A box in a browser
 * holds CHARACTERS, and what it must do with them is:
 *
 *   · put them on the wire exactly as typed, so the door's refusal is about
 *     what a person wrote and not about a repair made on the way;
 *   · send NOTHING when the box is empty, so «nothing was typed» and «zero
 *     was typed» stay two different statements all the way to the column;
 *   · still be able to draw a live total, which needs a number.
 *
 * Those three wants are why there are three functions rather than one.
 *
 * WHY THIS FILE EXISTS. These helpers were written once and then copied:
 * MEASURED before this file was made, `onTheWire` stood in five components
 * as five byte-identical copies, and `typedNumber` in two more. Five copies
 * of a rule are five places for it to drift, and two of the copies had
 * already drifted — `WalletsScreen` omits the `Number.isFinite` check, so
 * `typedNumber('abc')` is `NaN` there and `NOT_A_NUMBER` here. That
 * divergence is NOT merged by this file; it is left where it is, named, and
 * fixed on its own, because quietly changing one of two readings while
 * calling it de-duplication is how a defect gets a clean commit message.
 *
 * Nothing here imports zod. It runs in a browser bundle, and the door's
 * reader costs more than the three lines it would save.
 */

/**
 * What a box holds when what is in it is not a number at all.
 *
 * A symbol and not `NaN`: `NaN` is a number as far as every arithmetic
 * expression downstream is concerned, and a live total that reads «NaN» is
 * a figure nobody can tell from a missing one. The symbol cannot be added
 * to anything by accident.
 */
export const NOT_A_NUMBER = Symbol('NOT_A_NUMBER');

/**
 * THE NUMBER A BOX HOLDS — or nothing, or not a number.
 *
 * Three answers, because an empty box and a box with «2,500» in it are
 * different situations and only one of them is an error. `undefined` means
 * the box says nothing; `NOT_A_NUMBER` means it says something that is not
 * a figure, and that is for a LIVE TOTAL to render as «—», never for the
 * wire.
 *
 * `Number()` and not the door's stricter grammar, deliberately: this
 * reading decides what to DRAW, and being generous about `'0x10'` in a
 * total that is about to be refused by the door anyway costs nothing. What
 * goes on the wire is `onTheWire`, which is the characters.
 */
export function typedNumber(raw: string): number | undefined | typeof NOT_A_NUMBER {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NOT_A_NUMBER;
}

/**
 * The same reading, as a number or nothing — the symbol is not a figure.
 *
 * For the places that only want to know «is there a figure here», and for
 * arithmetic that must not be handed a symbol.
 */
export function typedFigure(raw: string): number | undefined {
  const v = typedNumber(raw);
  return typeof v === 'number' ? v : undefined;
}

/**
 * WHAT A BOX PUTS ON THE WIRE: its characters, or nothing at all.
 *
 * Not a number. `JSON.stringify` DROPS an `undefined` property, so an empty
 * box is ABSENT in the body and the door decides what absent means — which
 * is the only arrangement where a `0` in a column is a `0` somebody typed.
 */
export function onTheWire(raw: string): string | undefined {
  return raw.trim() === '' ? undefined : raw;
}
