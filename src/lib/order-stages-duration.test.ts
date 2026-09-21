import { describe, expect, it } from 'vitest';
import { orderStages, humanMinutes } from './order-stages';

/**
 * How long each stage took.
 *
 * The number people act on is the one that is still running: "three days in
 * confirmation" is worth seeing while it is three days, not after somebody
 * notices it became a week. So a finished stage measures to the next one
 * and the current stage measures to now.
 */

const HOUR = 60 * 60 * 1000;
const base = new Date('2026-09-01T08:00:00.000Z');
const at = (hours: number) => new Date(base.getTime() + hours * HOUR);
const NOW = at(100);

const order = (over: Record<string, unknown> = {}) => ({
  confirmationStatus: 'CONFIRMED',
  shippingStatus: 'DELIVERED',
  createdAt: base,
  claimedAt: at(2),
  confirmedAt: at(5),
  shippedAt: at(29),
  deliveredAt: at(77),
  ...over,
}) as never;

const byKey = (stages: ReturnType<typeof orderStages>) =>
  Object.fromEntries(stages.map((s) => [s.key, s]));

describe('stage durations', () => {
  it('measures a finished stage to the moment the next one began', () => {
    const s = byKey(orderStages(order(), {}, NOW));
    expect(s.INTAKE.minutes).toBe(120);        // created → claimed
    expect(s.CONFIRMATION.minutes).toBe(180);  // claimed → confirmed
    expect(s.WAREHOUSE.minutes).toBe(24 * 60); // confirmed → shipped
    expect(s.TRANSIT.minutes).toBe(48 * 60);   // shipped → delivered
  });

  it('measures the CURRENT stage to now, and says it is still running', () => {
    const s = byKey(
      orderStages(
        order({ shippingStatus: 'OUT_FOR_DELIVERY', deliveredAt: null }),
        {},
        NOW
      )
    );
    expect(s.TRANSIT.ongoing).toBe(true);
    expect(s.TRANSIT.minutes).toBe((100 - 29) * 60);
  });

  it('does not let a skipped stage swallow the time', () => {
    // Confirmed then shipped with nothing stamped in between: those hours
    // were spent in the warehouse whether or not anyone recorded it.
    const s = byKey(orderStages(order({ claimedAt: null }), {}, NOW));
    expect(s.INTAKE.minutes).toBe(5 * 60); // created → confirmed, not → claimed
  });

  it('says nothing rather than zero for a stage never entered', () => {
    // Zero would read as "instant" for something that never happened.
    const s = byKey(orderStages(order({ claimedAt: null }), {}, NOW));
    expect(s.CONFIRMATION.minutes).toBeNull();
  });

  it('never reports a negative duration', () => {
    // Imported orders carry a shipping date earlier than their creation.
    const s = byKey(orderStages(order({ claimedAt: at(-10) }), {}, NOW));
    expect(s.INTAKE.minutes).toBeGreaterThanOrEqual(0);
  });
});

describe('reading a duration', () => {
  it('stops at two units, because the third is never the question', () => {
    expect(humanMinutes(45)).toBe('45 دقيقة');
    expect(humanMinutes(60)).toBe('1 ساعة');
    expect(humanMinutes(150)).toBe('2 ساعة و30 دقيقة');
    expect(humanMinutes(1500)).toBe('1 يوم و1 ساعة');
    expect(humanMinutes(2880)).toBe('2 يوم');
  });

  it('does not round a real moment down to nothing', () => {
    expect(humanMinutes(0)).toBe('أقل من دقيقة');
  });

  it('is a dash when there is nothing to say', () => {
    expect(humanMinutes(null)).toBe('—');
  });
});
