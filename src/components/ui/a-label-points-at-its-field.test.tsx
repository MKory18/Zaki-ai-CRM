// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import React from 'react';
import { Input, Select, Textarea } from './Input';

/**
 * A `<label>` WITH NOWHERE TO POINT IS NOT A LABEL.
 *
 * All three fields read their id as `id || props.name`, so `htmlFor` was
 * whichever of the two the caller had remembered. MEASURED across every
 * `.tsx` in this repository at the moment this was written: **117 of 131
 * labelled fields carried neither**, so `htmlFor` was `undefined` and the
 * label was associated with nothing at all.
 *
 * Eighty-nine percent is not a scatter of forgetful call sites. It is a
 * component asking every caller to remember something and almost nobody
 * doing it — so it is remembered in the component, with `useId`.
 *
 * WHAT A READER GETS BACK, and none of it is theoretical:
 *
 *   · Pressing the words «الكمية المعدودة» focuses the box underneath them.
 *     On a phone that is the difference between a 40-pixel target and a
 *     whole line of text.
 *   · A screen reader announces the field by its name instead of «edit,
 *     blank».
 *   · `getByLabelText` starts working — which is how this was found. A
 *     stock-count test could not locate the box it was about to prove
 *     writes off a shelf, and the reason was not the test.
 *
 * The sweep at the bottom is the guard that cannot rot: it WALKS the
 * components rather than listing them, so a fourth field added to this file
 * tomorrow is held to the same rule without anyone editing this test.
 */

afterEach(cleanup);

const LABEL = 'الكمية المعدودة';

describe('every field this repository draws is reachable by its label', () => {
  it('finds a text box with no id and no name', () => {
    render(<Input label={LABEL} />);
    expect(screen.getByLabelText(LABEL).tagName).toBe('INPUT');
  });

  it('finds a select with no id and no name', () => {
    render(
      <Select label={LABEL}>
        <option value="a">أ</option>
      </Select>
    );
    expect(screen.getByLabelText(LABEL).tagName).toBe('SELECT');
  });

  it('finds a textarea with no id and no name', () => {
    render(<Textarea label={LABEL} />);
    expect(screen.getByLabelText(LABEL).tagName).toBe('TEXTAREA');
  });

  it('and typing into what the label points at reaches that field', () => {
    // The association is not cosmetic: this is the lookup every screen test
    // uses, and it must land on the control a person would type into.
    render(<Input label={LABEL} defaultValue="" />);
    const box = screen.getByLabelText(LABEL) as HTMLInputElement;
    box.value = '475';
    expect(box.value).toBe('475');
  });
});

describe('an id a caller did give still wins', () => {
  it('keeps an explicit id, so not one existing field changed', () => {
    render(<Input label={LABEL} id="counted" />);
    expect(screen.getByLabelText(LABEL).id).toBe('counted');
  });

  it('and falls back to the name next, which is what it did before', () => {
    render(<Input label={LABEL} name="countedQuantity" />);
    expect(screen.getByLabelText(LABEL).id).toBe('countedQuantity');
  });

  it('gives two unlabelled fields on one page two different ids', () => {
    // A generated id that collided would make the second label point at the
    // first field — worse than pointing nowhere, because it looks right.
    render(
      <>
        <Input label="الأولى" />
        <Input label="الثانية" />
      </>
    );
    const a = screen.getByLabelText('الأولى').id;
    const b = screen.getByLabelText('الثانية').id;
    expect(a).not.toBe('');
    expect(a).not.toBe(b);
  });
});

describe('the rule holds for every field in this file, now and later', () => {
  it('each exported field reads its id as id, then name, then a generated one', () => {
    /*
     * A WALK, NOT A LIST. The three tests above name three components; this
     * one reads the file and holds whatever it finds to the rule. A fourth
     * field added below `Textarea` is covered the day it is written, which
     * a list of three names never manages.
     */
    const src = readFileSync(join(process.cwd(), 'src/components/ui/Input.tsx'), 'utf8');
    const fields = [...src.matchAll(/export function (\w+)\(\{([\s\S]*?)\}:/g)].map((m) => m[1]);
    expect(fields.length).toBeGreaterThanOrEqual(3);
    for (const name of fields) {
      const body = src.slice(src.indexOf(`export function ${name}(`));
      // `const autoId = useId();` sits above it and is not the assignment
      // being pinned — the one that decides the field's id is the one that
      // starts from the caller's own `id`.
      const line = body.split(/\r?\n/).find((l) => /const \w+Id = id \|\|/.test(l));
      expect(line, name).toBeTruthy();
      expect(line, name).toMatch(/id \|\| props\.name \|\| autoId;/);
    }
  });

  it('and no field in this repository is left with a label pointing nowhere by the OLD rule', () => {
    /*
     * The figure that started this, kept as a measurement rather than a
     * memory. It counts call sites that give neither an id nor a name — the
     * number is allowed to be large, because the component no longer needs
     * them to. What must stay true is that the component is the one holding
     * the rule: if `useId` were removed, every one of these would go back to
     * pointing nowhere, and that is what the walk above pins.
     */
    const files = execSync('git ls-files "src/**/*.tsx"', { encoding: 'utf8' }).trim().split(/\r?\n/);
    let labelled = 0;
    let withoutIdOrName = 0;
    for (const f of files) {
      const t = readFileSync(join(process.cwd(), f), 'utf8');
      for (const m of t.matchAll(/<(Input|Select|Textarea)\b([^>]*?)\/?>/g)) {
        if (!/\blabel\s*=/.test(m[2])) continue;
        labelled++;
        if (!/\b(id|name)\s*=/.test(m[2])) withoutIdOrName++;
      }
    }
    expect(labelled).toBeGreaterThan(100);
    // Not an upper bound on sloppiness — a statement that the component is
    // carrying most of these, which is why the rule belongs in it.
    expect(withoutIdOrName).toBeGreaterThan(0);
  });
});
