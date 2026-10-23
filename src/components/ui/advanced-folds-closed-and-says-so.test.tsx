// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { AdvancedGroup } from './AdvancedGroup';

/**
 * «متقدم» — THE FOLD ITSELF, BEFORE ANY SCREEN USES IT.
 *
 * Phase 4 of «سلاسة مطلقة» («التنظيف») moves the controls that are not the
 * day's work on the eight busiest screens under one row called «متقدم». That
 * promise has four parts and each is held here, on the component alone, so a
 * screen test failing later points at the screen and not at the fold:
 *
 *   1. CLOSED BY DEFAULT — the row is drawn, what it holds is not.
 *   2. IT SAYS WHETHER IT IS OPEN — `aria-expanded` on the row a screen
 *      reader lands on, false while folded, true once opened, false again.
 *   3. FOLDED, NOT REMOVED — while closed, every control is still in the page
 *      (find-in-page reaches it, a name lookup finds it); only drawing stops.
 *   4. NOT REMEMBERED, AND NO NEW CSS — a fresh mount starts closed with
 *      nothing written to storage, and every class the fold uses is one the
 *      product already ships, so the stylesheet ceiling cannot move.
 *
 * MUTATION SERIES (run by hand when this file was written; each mutation made
 * at least one test below go red, and each was reverted):
 *   M1 `<details open>` (open by default)          → «starts closed» red
 *   M2 `aria-expanded` dropped from the summary     → both aria tests red
 *   M3 `onToggle` dropped (state never follows)     → «opens on a tap» red
 *   M4 open state read from / written to storage    → «not remembered» red
 *   M5 the chevron turned by a group-open variant again → «no new CSS» red
 */

/**
 * What a browser DRAWS. A closed <details> draws its <summary> and nothing
 * else; jsdom keeps both in the tree and lays out neither, so the rendering
 * rule from the HTML standard is stated here once, the way a browser applies
 * it: walk out through every enclosing <details>, and anything that is not
 * inside the summary of a closed one is not on screen.
 */
function drawn(el: Element): boolean {
  for (let box = el.closest('details'); box; box = box.parentElement?.closest('details') ?? null) {
    const summary = box.querySelector(':scope > summary');
    if (!box.open && !summary?.contains(el)) return false;
  }
  return !el.closest('[hidden]');
}

function fold() {
  render(
    <div>
      <button type="button">الزرّ الأساسي</button>
      <AdvancedGroup holds="تصدير · استيراد">
        <button type="button">تصدير</button>
        <button type="button">استيراد</button>
      </AdvancedGroup>
    </div>
  );
  const summary = screen.getByText('متقدم').closest('summary') as HTMLElement;
  const details = summary.closest('details') as HTMLDetailsElement;
  const inside = ['تصدير', 'استيراد'].map((name) => screen.getByRole('button', { name, hidden: true }));
  return { summary, details, inside, primary: screen.getByRole('button', { name: 'الزرّ الأساسي', hidden: true }) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('«متقدم» — the fold the busiest screens put their second-line controls in', () => {
  it('starts closed: the row is drawn, what it holds is not, and the main button beside it is untouched', () => {
    const { summary, details, inside, primary } = fold();

    expect(details.open, 'يفتح وحده — المطويّ لازم يبدأ مطويًّا').toBe(false);
    expect(drawn(summary), 'سطر «متقدم» نفسه لازم يبان').toBe(true);
    for (const b of inside) expect(drawn(b), `«${b.textContent}» ظاهر قبل ما ينفتح «متقدم»`).toBe(false);
    expect(drawn(primary), 'الزرّ الأساسي اختفى مع المطويّ').toBe(true);
    expect(primary.closest('details'), 'الزرّ الأساسي صار جوّا «متقدم»').toBeNull();
  });

  it('says it is closed — aria-expanded="false" on the row a screen reader lands on', () => {
    const { summary } = fold();
    expect(summary.getAttribute('aria-expanded'), 'بلا aria-expanded القارئ ما بيعرف إنّه مطويّ').toBe('false');
  });

  it('opens on a tap, draws what it holds, and says so', async () => {
    const user = userEvent.setup();
    const { summary, details, inside } = fold();

    await user.click(summary);

    await waitFor(() => expect(summary.getAttribute('aria-expanded'), 'انفتح وما قال').toBe('true'));
    expect(details.open).toBe(true);
    for (const b of inside) expect(drawn(b), `«${b.textContent}» ما بان بعد الفتح`).toBe(true);
  });

  it('and closes again on a second tap, saying that too', async () => {
    const user = userEvent.setup();
    const { summary, details, inside } = fold();

    await user.click(summary);
    await waitFor(() => expect(summary.getAttribute('aria-expanded')).toBe('true'));
    await user.click(summary);

    await waitFor(() => expect(summary.getAttribute('aria-expanded'), 'انطوى وضلّ يقول مفتوح').toBe('false'));
    expect(details.open).toBe(false);
    for (const b of inside) expect(drawn(b), `«${b.textContent}» ضلّ ظاهر بعد الطيّ`).toBe(false);
  });

  it('folds, it does not remove: while closed every control is still in the page and still named', () => {
    const { details, inside } = fold();
    for (const b of inside) {
      expect(details.contains(b), `«${b.textContent}» انشال من الصفحة بدل ما ينطوي`).toBe(true);
      expect(b.closest('[data-advanced-group]')).toBe(details);
    }
  });

  it('names what it holds on the folded row itself, so whoever used one last week knows where it went', () => {
    const { summary } = fold();
    expect(summary.textContent).toContain('متقدم');
    expect(summary.textContent, 'السطر ما بيقول شو جوّاه').toContain('تصدير · استيراد');
  });

  it('is not remembered: nothing is written to storage, and a fresh mount starts closed again', async () => {
    const wrote = vi.spyOn(Storage.prototype, 'setItem');
    const cookieBefore = document.cookie;
    const user = userEvent.setup();

    const first = fold();
    await user.click(first.summary);
    await waitFor(() => expect(first.details.open).toBe(true));
    cleanup();

    const second = fold();
    expect(second.details.open, 'تذكّر إنّه كان مفتوح').toBe(false);
    expect(second.summary.getAttribute('aria-expanded')).toBe('false');
    expect(wrote, 'كتب حالة الفتح في التخزين').not.toHaveBeenCalled();
    expect(document.cookie, 'كتب حالة الفتح في كوكي').toBe(cookieBefore);
  });
});

describe('«متقدم» draws with what the product already ships — no new CSS', () => {
  /**
   * The stylesheet ceiling (CSS_BUDGET_KB in quality-gates.test.ts) is only
   * measured once `.next/static` exists, i.e. after a build. This holds the
   * same promise before one: every utility class written in AdvancedGroup.tsx
   * must already be written somewhere else in src/, because Tailwind emits a
   * rule once per class — a class already used elsewhere costs zero bytes, a
   * class used nowhere else is a new rule. The first version of AdvancedGroup
   * turned its chevron with a group-open variant and hid the browser's
   * triangle with an arbitrary webkit-details-marker variant — two utilities
   * no other file used; this test is why they are gone.
   *
   * TAILWIND READS COMMENTS TOO. It scans every file in the tree — tests,
   * markdown, JSON, comments included — and ships a rule for every class-like
   * string it finds. This file once named those two utilities verbatim in
   * this very comment, and CI's «Payload budget» step measured the branch 94
   * bytes over the ceiling for it while every className was clean. So they
   * are described here in words, never spelled as a class; do the same in any
   * comment, commit-tracked doc or fixture that talks about a utility.
   */
  const ROOT = join(process.cwd(), 'src');
  const SELF = join(ROOT, 'components/ui/AdvancedGroup.tsx');

  function corpus(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) corpus(p, out);
      else if (/\.(tsx?|css)$/.test(name) && !name.includes('.test.') && p !== SELF) out.push(readFileSync(p, 'utf8'));
    }
    return out;
  }

  it('uses no utility class that appears nowhere else in src/', () => {
    const self = readFileSync(SELF, 'utf8');
    const classes = new Set<string>();
    for (const m of self.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const text = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, (expr) => ` ${expr.match(/'([^']+)'/g)?.join(' ') ?? ''} `);
      for (const token of text.replace(/'/g, ' ').split(/\s+/)) if (token && !token.includes('$')) classes.add(token);
    }
    expect(classes.size, 'ما لقى ولا كلاس — تغيّر شكل الملف؟').toBeGreaterThan(10);

    const elsewhere = corpus(ROOT).join('\n');
    const fresh = [...classes].filter((c) => !elsewhere.includes(c));
    expect(fresh, `كلاسات جديدة على الستايل (كل واحد قاعدة CSS جديدة) — ${relative(process.cwd(), SELF)}`).toEqual([]);
  });
});
