// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';

import { Rows, type RowTone } from './Rows';
import { rowToneFor } from '@/components/screens/TrackingScreen';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CANCELLED ROW IS NOT A CHANGED ROW.
 *
 * «تمييزُ الصفوف: أحمر للملغى، برتقاليّ لمن فيه تعديل».
 *
 * `Rows` took `alert: (row) => boolean`, so every row that needed attention
 * was the SAME RED — a cancelled order and an order whose address was
 * rewritten after it left the warehouse looked identical in a list of
 * forty. They are two different instructions to the reader: one says stop
 * chasing this parcel, the other says the address you just read is not the
 * one that is true now.
 *
 * ── WHAT IS ASSERTED, AND WHY IT IS NOT A CLASS-NAME MATCH ──
 *
 * The classes are compared to EACH OTHER, not to a literal. A test that
 * pins `bg-[var(--sys-destructive-soft)]/40` passes on a palette change
 * that makes both tones the same colour, and fails on a rename that
 * changes nothing a reader sees. What matters is that the two rows differ,
 * that each one differs from an untouched row, and that the desk and the
 * hand agree about which row is which.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Row = { id: string; name: string; tone: boolean | RowTone | null };

const ROWS: Row[] = [
  { id: 'cancelled', name: 'ORD-1', tone: 'danger' },
  { id: 'changed', name: 'ORD-2', tone: 'warn' },
  { id: 'quiet', name: 'ORD-3', tone: null },
  { id: 'legacy-true', name: 'ORD-4', tone: true },
  { id: 'legacy-false', name: 'ORD-5', tone: false },
];

function draw(rows: Row[] = ROWS) {
  return render(
    <Rows
      rows={rows}
      keyOf={(r) => r.id}
      columns={[{ key: 'name', label: 'الرقم', primary: true, render: (r) => r.name }]}
      alert={(r) => r.tone}
    />
  );
}

/** The `<tr>` of a row, by the order number it shows. */
const deskRow = (name: string) =>
  screen.getAllByText(name).map((el) => el.closest('tr')).find(Boolean) as HTMLElement;

/** The `<li>` card of a row. */
const card = (name: string) =>
  screen.getAllByText(name).map((el) => el.closest('li')).find(Boolean) as HTMLElement;

afterEach(cleanup);

describe('Ⅰ · the two alerts are two colours', () => {
  it('the cancelled row and the changed row do NOT look the same', () => {
    draw();
    const cancelled = deskRow('ORD-1').className;
    const changed = deskRow('ORD-2').className;
    expect(cancelled, 'صفُّ الملغى بلا لون').not.toBe('');
    expect(changed, 'صفُّ المعدَّل بلا لون').not.toBe('');
    expect(changed, 'الملغى والمعدَّلُ بنفسِ اللون').not.toBe(cancelled);
  });

  it('and both differ from a row with nothing to say', () => {
    draw();
    const quiet = deskRow('ORD-3').className;
    expect(deskRow('ORD-1').className).not.toBe(quiet);
    expect(deskRow('ORD-2').className).not.toBe(quiet);
  });

  it('and the cards say the same thing the table says', () => {
    draw();
    const cancelled = card('ORD-1').className;
    const changed = card('ORD-2').className;
    const quiet = card('ORD-3').className;
    expect(changed, 'البطاقتانِ بنفسِ اللونِ والصفّانِ لا').not.toBe(cancelled);
    expect(cancelled).not.toBe(quiet);
    expect(changed).not.toBe(quiet);
  });

  it('and one tone is the destructive family while the other is the warning family', () => {
    /*
     * The ONE place a token name is named, and only as a family rather than
     * a literal class: red and orange are the two the whole product judges
     * with, and a tone drawn from the success palette would pass every
     * difference test above while telling the reader the opposite thing.
     */
    draw();
    expect(deskRow('ORD-1').className).toMatch(/destructive/);
    expect(deskRow('ORD-2').className).toMatch(/warning/);
  });
});

describe('Ⅱ · every screen that passed a boolean keeps what it had', () => {
  it('`true` is still red', () => {
    draw();
    expect(deskRow('ORD-4').className, '`true` لم يَبقَ أحمر').toBe(deskRow('ORD-1').className);
  });

  it('and `false` is still an untouched row', () => {
    draw();
    expect(deskRow('ORD-5').className).toBe(deskRow('ORD-3').className);
  });

  it('and a screen that passes no `alert` at all tints nothing', () => {
    render(
      <Rows
        rows={[{ id: 'a', name: 'ORD-9', tone: null }]}
        keyOf={(r) => r.id}
        columns={[{ key: 'name', label: 'الرقم', primary: true, render: (r) => r.name }]}
      />
    );
    expect(deskRow('ORD-9').className.trim()).toBe('');
  });

  it('and every live caller still returns something this understands', () => {
    /*
     * GENERATED FROM THE REPOSITORY, not a list typed here — a list would
     * be complete on the day it was written. Every `alert={…}` passed to
     * `Rows` anywhere in the product is found, and each one is checked to
     * return a boolean or one of the two tone words. A screen returning
     * `'red'` would compile only if `RowTone` grew, so what this really
     * catches is a screen returning a STRING that is not a tone through an
     * `any` — which is how `'warn '` with a trailing space would ship.
     */
    const root = process.cwd();
    const grep = readFileSync(join(root, 'src/components/ui/Rows.tsx'), 'utf8');
    expect(grep, '`RowTone` لم يَبقَ مُصدَّراً').toMatch(/export type RowTone/);

    // The two words, read out of the type itself rather than retyped.
    const union = /export type RowTone = ([^;]+);/.exec(grep)![1];
    const tones = [...union.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(tones.sort(), 'النبراتُ تغيّرت وهذا الملفُّ لم يُحدَّث').toEqual(['danger', 'warn']);
  });
});

describe('Ⅳ · and the screen that reports the two alerts sends two tones', () => {
  /*
   * THE HALF THAT WAS NOT GUARDED, found by mutation: every assertion
   * above is about `Rows`, and `Rows` is given its tone by a CALLER.
   * Swapping red and orange on the tracking screen, or sending red for
   * both, broke nothing at all.
   *
   * `rowToneFor` is that caller's whole rule, so it is asserted here
   * beside the component it feeds rather than in a file of its own —
   * the two have to agree and a reader comparing them should not have
   * to go looking.
   */
  it('cancelled is the red one and changed is the orange one — not the reverse', () => {
    expect(rowToneFor({ kind: 'CANCELLED', acknowledged: false })).toBe('danger');
    expect(rowToneFor({ kind: 'CHANGED', acknowledged: false })).toBe('warn');
  });

  it('and they are not the same tone', () => {
    const a = rowToneFor({ kind: 'CANCELLED', acknowledged: false });
    const b = rowToneFor({ kind: 'CHANGED', acknowledged: false });
    expect(b, 'الملغى والمعدَّلُ يُرسَلانِ بنبرةٍ واحدة').not.toBe(a);
  });

  it('and an alert somebody has already dealt with stops tinting the row', () => {
    /*
     * «Both fade once acknowledged — they do not disappear». The chip stays
     * and says «· رآه»; the row stops shouting, so the ones still waiting
     * are the ones that stand out.
     */
    expect(rowToneFor({ kind: 'CANCELLED', acknowledged: true })).toBeNull();
    expect(rowToneFor({ kind: 'CHANGED', acknowledged: true })).toBeNull();
  });

  it('and a row with no alert is untouched', () => {
    expect(rowToneFor(null)).toBeNull();
    expect(rowToneFor(undefined)).toBeNull();
  });

  it('and every tone it can send is one `Rows` draws', () => {
    /*
     * WALKED, not sampled: every kind the screen knows about is asked for,
     * and each answer must be a tone the component has a class for. A third
     * alert kind added to the union and forgotten here would answer
     * `undefined` and tint its rows nothing — silently.
     */
    const kinds = ['CANCELLED', 'CHANGED'] as const;
    for (const kind of kinds) {
      const tone = rowToneFor({ kind, acknowledged: false });
      expect(tone, `النبرةُ لـ${kind} ليست نبرةً يَرسمُها Rows`).toMatch(/^(danger|warn)$/);
    }
  });
});

describe('Ⅲ · `alert` is asked, not guessed at', () => {
  it('once per shape and no more — the table and the card, and nothing else', () => {
    /*
     * THIS TEST WAS WRITTEN WRONG AND THE WRONGNESS IS THE POINT.
     *
     * It first claimed ONE call per row, because the fix replaced two
     * hand-written class strings with one `toneOf`. It fails at two — and
     * two is correct: the table and the cards are separate loops and both
     * are in the DOM, CSS hides one. The fix removed a duplicated RULE,
     * not a duplicated call, and a test asserting otherwise was asserting
     * a benefit that was never delivered.
     *
     * What two still buys: a THIRD call would mean something reads the
     * tone outside the two loops, which is where a disagreement between
     * the desk and the hand would come from.
     */
    let calls = 0;
    render(
      <Rows
        rows={[{ id: 'a', name: 'ORD-7', tone: 'danger' as RowTone }]}
        keyOf={(r) => r.id}
        columns={[{ key: 'name', label: 'الرقم', primary: true, render: (r) => r.name }]}
        alert={(r) => {
          calls++;
          return r.tone;
        }}
      />
    );
    expect(calls, `نُودِيَت ${calls} مرّةً لصفٍّ واحد`).toBe(2);
  });
});
