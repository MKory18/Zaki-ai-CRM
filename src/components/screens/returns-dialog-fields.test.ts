import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A FIELD THAT NAMES NO COLOUR IS A WHITE FIELD.
 *
 *   «التنبيهات المنبثقة عند طلب مرتجع جديد غير متناسبة مع التصميم، إذا كانت
 *    بيضا فتكون أزرق»
 *   «لما أجي أختار منتج يتضوي بيضا»
 *
 * Two facts about this codebase turn a missing class into the owner's
 * complaint, and neither is obvious from reading one component:
 *
 *   1. NOTHING IN THE PRODUCT DECLARES `color-scheme`. Grep it: not in
 *      src/app/globals.css, not in src/app/(system)/system.css, nowhere. So
 *      a native control with no `background-color` of its own is painted by
 *      the user agent, and the user agent's default is WHITE — in every
 *      theme, including the dark one the warehouse runs. Three such boxes on
 *      a `--sys-card` surface is «بيضا» precisely.
 *
 *   2. system.css styles `:focus-visible` ONLY, and says why — a ring on
 *      every mouse click reads as an error. That is right for buttons and
 *      wrong as the *whole* story for a text field: a clerk who TAPS a box
 *      got no state change at all. `src/components/ui/Input.tsx` supplies
 *      the missing half, `focus:ring-[var(--sys-primary)]/25` — the blue the
 *      owner is asking for.
 *
 * So the rule is not «add a background». It is: on these dialogs a field is
 * the shared `Input`/`Select`/`Textarea`, never a hand-rolled one. A raw tag
 * is a fourth copy of a class string that already exists in one place, and
 * the copies are how this drifted — `CollectDialog` has a `<select>` that
 * was given `bg-[var(--sys-card)]` and two `<input>`s beside it that were
 * missed.
 *
 * THE ONE EXCEPTION IS THE TICK BOX. There is no system component for it and
 * `accent-color` is the only property that tints a native one, so a raw
 * checkbox is allowed and must carry the token instead.
 */

export interface FieldAudit {
  /** Hand-rolled native form controls in the source. */
  rawFields: number;
  /** Of those, the ones that are tick boxes — the documented exception. */
  checkboxes: number;
  /** Tick boxes that name `accent-[var(--sys-primary)]`. */
  tintedCheckboxes: number;
  /** Raw fields that are not tick boxes. Each one draws white. */
  unthemed: number;
}

/**
 * Counts, rather than parsing.
 *
 * A JSX tag cannot be matched with `<input[^>]*>`: an arrow function in a
 * handler — `onChange={(e) => …}` — puts a `>` inside the attribute list, so
 * the match ends in the middle of the tag and every assertion built on it is
 * measuring the wrong text. Counting tag openings and attribute literals
 * separately needs no parser and cannot be fooled that way.
 */
export function auditFields(src: string): FieldAudit {
  const n = (re: RegExp) => (src.match(re) ?? []).length;
  const rawFields = n(/<(?:input|select|textarea)\b/g);
  const checkboxes = n(/type="checkbox"/g);
  return {
    rawFields,
    checkboxes,
    tintedCheckboxes: n(/accent-\[var\(--sys-primary\)\]/g),
    unthemed: rawFields - checkboxes,
  };
}

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** The dialogs the owner named. */
const DIALOGS = [
  'src/components/screens/ReturnsScreen.tsx',
  'src/components/screens/tracking/DeliverDialog.tsx',
] as const;

describe('the returns dialogs use the system field', () => {
  it.each(DIALOGS)('%s hand-rolls no text, number or select field', (file) => {
    const audit = auditFields(read(file));
    expect(audit.unthemed, `${file}: ${audit.unthemed} حقل بلا لون من النظام`).toBe(0);
  });

  it.each(DIALOGS)('%s tints every tick box it draws', (file) => {
    const audit = auditFields(read(file));
    expect(audit.tintedCheckboxes).toBe(audit.checkboxes);
  });

  it.each(DIALOGS)('%s imports the shared field rather than restating it', (file) => {
    const src = read(file);
    expect(src).toContain("from '@/components/ui/Input'");
    // The class string that belongs in exactly one file.
    expect(src).not.toMatch(/border border-\[var\(--sys-border\)\] text-sm"\s*\n?\s*(dir|\/>)/);
  });

  it('and the shell is the system dialog, not a bespoke box', () => {
    // The shell was never the fault — both already used it. Asserted so that
    // a later «make it match» does not answer the complaint by reaching for
    // a second portal.
    for (const file of DIALOGS) expect(read(file)).toContain("from '@/components/ui/Modal'");
  });
});

/**
 * The audit is only worth anything if it is actually counting. A regression
 * that returned zero for everything would pass every assertion above.
 */
describe('the audit itself', () => {
  it('catches a hand-rolled field', () => {
    const src = '<input value={x} className="h-11 rounded-lg border border-[var(--sys-border)] text-sm" />';
    expect(auditFields(src)).toMatchObject({ rawFields: 1, checkboxes: 0, unthemed: 1 });
  });

  it('is not fooled by an arrow function inside the tag', () => {
    // `=>` puts a `>` in the attribute list; a regex that stopped there
    // would read the tag as closed and miss everything after it.
    const src = '<input onChange={(e) => go(e)} type="checkbox" className="accent-[var(--sys-primary)]" />';
    expect(auditFields(src)).toMatchObject({ rawFields: 1, checkboxes: 1, unthemed: 0, tintedCheckboxes: 1 });
  });

  it('passes the shared component', () => {
    const src = '<Input label="سليم" value={x} onChange={go} />';
    expect(auditFields(src)).toMatchObject({ rawFields: 0, unthemed: 0 });
  });

  it('flags a tick box that names no accent', () => {
    const src = '<input type="checkbox" checked={x} onChange={go} />';
    const audit = auditFields(src);
    expect(audit.unthemed).toBe(0); // a checkbox is the exception…
    expect(audit.tintedCheckboxes).not.toBe(audit.checkboxes); // …but an untinted one still fails
  });

  it('counts a select and a textarea too', () => {
    expect(auditFields('<select /><textarea />').unthemed).toBe(2);
  });
});
