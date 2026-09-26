import { describe, expect, it } from 'vitest';
import { dashboardFiles } from './guard-source';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A TABLE ON A DESK, CARDS IN A HAND — FROM ONE DEFINITION.
 *
 * Thirty-eight tables were written by hand across thirty-six files.
 * Twenty-two of them squeezed on a phone: seven columns on 375px is every
 * cell wrapped to four lines and one row filling the screen. Fifteen
 * scrolled sideways, so the row's name was off-screen by the time the eye
 * reached the number it came for. And `<Rows>` — which draws both from one
 * `columns` array — was used by two.
 *
 * They are one table now, with three exceptions that are not oversights.
 */

/**
 * THE THREE THAT STAY.
 *
 * A comparison matrix is read DOWN a column — each campaign, each person,
 * against the same measures — and cards put every row's number in a
 * different place, which destroys the only thing the screen is for. Their
 * totals row has no card form at all: a card of sums beside cards of rows
 * reads as one more row.
 *
 * They scroll sideways on a phone, and for a matrix that is the honest
 * behaviour: it genuinely does not fit, and pretending otherwise costs the
 * comparison.
 */
const MATRICES = [
  '/src/components/performance/AttributionTable.tsx',
  '/src/components/performance/TeamPerformanceTable.tsx',
  '/src/components/performance/ScoreBoard.tsx',
];

/** And the shared component itself, which IS the table. */
const THE_TABLE = '/src/components/ui/Rows.tsx';

describe('a list of records', () => {
  it('is drawn once and read two ways, not written by hand per screen', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboardFiles()) {
      if (rel === THE_TABLE || MATRICES.includes(rel)) continue;
      const n = (src.match(/<table\b/g) ?? []).length;
      if (n) offenders.push(`${rel}: ${n}`);
    }
    expect(offenders, `جدولٌ مكتوبٌ باليد:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the three matrices that stay say why, where it will be read', () => {
    for (const rel of MATRICES) {
      const src = readFileSync(join(process.cwd(), rel.slice(1)), 'utf8');
      expect(src, `${rel}: يبقى جدولاً بلا سبب مكتوب`).toContain('A MATRIX, NOT A LIST');
    }
  });

  it('and the shared table is the one place a row becomes a card', () => {
    const rows = readFileSync(join(process.cwd(), 'src/components/ui/Rows.tsx'), 'utf8');
    // The desk and the hand, from the same `columns`.
    expect(rows).toContain('md:block');
    expect(rows).toContain('md:hidden');
    // And picking many at once, which is why anybody selects at all.
    expect(rows, 'لا اختيارَ للكلّ — ثلاثون طلباً ثلاثون ضغطة').toContain('onToggleAll');
  });
});
