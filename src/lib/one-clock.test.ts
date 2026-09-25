import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ONE CLOCK.
 *
 * Two endpoints used to time the same thing differently: the confirmation
 * performance route counted wall-clock hours, and the team screen and the
 * performance score counted WORKING minutes. One agent, one week, two
 * numbers — and nothing in the system could say which was right.
 *
 * Wall clock is the wrong one, and not by a little. An order pulled at
 * five on a Thursday evening and confirmed at ten on Saturday morning is
 * forty-one hours of somebody being slow by that reading. It is one
 * working hour. The difference is a weekend the company chose.
 *
 * So this is a structural test: no reader of a claim-to-action duration may
 * divide milliseconds into hours by hand. If a third screen ever needs one,
 * it calls the same function as the other two.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Every place that times how long a person took over an order. */
const CLOCK_READERS = [
  'src/app/api/orders/confirmation/performance/route.ts',
  'src/lib/team-performance.ts',
  'src/lib/performance-metrics.ts',
];

describe('how long somebody took', () => {
  it('is counted in working minutes, by the one function that knows the calendar', () => {
    for (const file of CLOCK_READERS) {
      const src = read(file);
      if (!/claimedAt|firstAction|ResponseMinutes|medianFirstActionMinutes/.test(src)) continue;
      expect(
        src.includes('businessMinutesBetween') || src.includes('medianFirstActionMinutes'),
        `${file} times work without the company calendar`
      ).toBe(true);
    }
  });

  it('and nobody divides into hours by hand again', () => {
    for (const file of CLOCK_READERS) {
      // 60 * 60 * 1000 — the wall-clock hour that started the disagreement.
      expect(read(file), `${file} still converts milliseconds to hours itself`).not.toContain('(60 * 60 * 1000)');
    }
  });

  it('the confirmation route reports minutes, and says which minutes they are', () => {
    const src = read('src/app/api/orders/confirmation/performance/route.ts');
    expect(src).toContain('medianConfirmMinutes');
    // The old field name promised hours while holding something else.
    expect(src).not.toContain('avgConfirmationHours');
    expect(src).toContain('not wall clock');
  });
});
