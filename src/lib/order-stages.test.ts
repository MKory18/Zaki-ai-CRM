import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ db: {} }));

import { orderStages, type StageSource } from './order-stages';

/**
 * The journey an order has actually been on.
 *
 * These cards are read to answer "what happened and when", so the two ways
 * they can lie both matter: claiming a stage was worked when the order only
 * passed through it, and showing a stage as still to come when the order is
 * already finished. Both are derived from the order's own timestamps, the
 * same way the state and the zone are — nothing here is stored.
 */

const base = (over: Partial<StageSource> = {}): StageSource => ({
  createdAt: new Date('2026-09-01T08:00:00Z'),
  confirmationStatus: 'NEW',
  shippingStatus: 'NOT_READY',
  ...over,
});

const byKey = (stages: ReturnType<typeof orderStages>) =>
  Object.fromEntries(stages.map((s) => [s.key, s]));

describe('the stages of an order', () => {
  it('always lists the five stages in the order they happen', () => {
    const stages = orderStages(base());
    expect(stages.map((s) => s.key)).toEqual(['INTAKE', 'CONFIRMATION', 'WAREHOUSE', 'TRANSIT', 'CLOSED']);
  });

  it('puts a new order at intake, with everything after it still to come', () => {
    const s = byKey(orderStages(base({ moderator: { name: 'سارة' }, source: 'تيكتوك' })));
    expect(s.INTAKE.status).toBe('CURRENT');
    expect(s.INTAKE.who).toBe('سارة');
    expect(s.INTAKE.facts).toContainEqual({ label: 'القناة', value: 'تيكتوك' });
    expect(s.CONFIRMATION.status).toBe('PENDING');
    expect(s.CLOSED.status).toBe('PENDING');
  });

  it('moves to confirmation once somebody has taken it', () => {
    const s = byKey(orderStages(
      base({
        confirmationStatus: 'IN_PROGRESS',
        claimedAt: new Date('2026-09-01T09:00:00Z'),
        claimer: { name: 'ليلى' },
      }),
      { contactAttempts: 3 }
    ));

    expect(s.INTAKE.status).toBe('DONE');
    expect(s.CONFIRMATION.status).toBe('CURRENT');
    expect(s.CONFIRMATION.who).toBe('ليلى');
    expect(s.CONFIRMATION.facts).toContainEqual({ label: 'محاولات التواصل', value: '3' });
  });

  it('carries the courier and the tracking number into the transit stage', () => {
    const s = byKey(orderStages(base({
      confirmationStatus: 'CONFIRMED',
      shippingStatus: 'SHIPPED',
      shippedAt: new Date('2026-09-03T10:00:00Z'),
      confirmedAt: new Date('2026-09-02T10:00:00Z'),
      deliveryProvider: { name: 'Basha Delivery' },
      trackingNumber: '100514197781',
    })));

    expect(s.TRANSIT.status).toBe('CURRENT');
    expect(s.TRANSIT.facts).toContainEqual({ label: 'الشركة', value: 'Basha Delivery' });
    expect(s.TRANSIT.facts).toContainEqual({ label: 'التتبع', value: '100514197781' });
    expect(s.WAREHOUSE.status).toBe('DONE');
  });

  it('closes on the real ending, not on a generic "done"', () => {
    const delivered = byKey(orderStages(base({
      confirmationStatus: 'CONFIRMED',
      shippingStatus: 'DELIVERED',
      deliveredAt: new Date('2026-09-05T12:00:00Z'),
      collectedAmount: 19,
    })));
    expect(delivered.CLOSED.status).toBe('CURRENT');
    expect(delivered.CLOSED.facts).toContainEqual({ label: 'النتيجة', value: 'سُلّم' });
    expect(delivered.CLOSED.facts).toContainEqual({ label: 'المحصَّل', value: '19' });

    const returned = byKey(orderStages(base({
      confirmationStatus: 'CONFIRMED',
      shippingStatus: 'RETURNED',
      returnedAt: new Date('2026-09-06T12:00:00Z'),
    })));
    expect(returned.CLOSED.facts).toContainEqual({ label: 'النتيجة', value: 'مرتجع' });

    const partial = byKey(orderStages(base({
      confirmationStatus: 'CONFIRMED',
      shippingStatus: 'PARTIALLY_DELIVERED',
      deliveredAt: new Date('2026-09-06T12:00:00Z'),
    })));
    expect(partial.CLOSED.facts).toContainEqual({ label: 'النتيجة', value: 'سُلّم جزئياً' });
  });

  it('says a stage was passed over rather than inventing a moment for it', () => {
    // An imported order that was never claimed still reached the warehouse:
    // the confirmation stage happened to nobody and has no timestamp.
    const s = byKey(orderStages(base({
      confirmationStatus: 'CONFIRMED',
      shippingStatus: 'SHIPPED',
      shippedAt: new Date('2026-09-03T10:00:00Z'),
      claimedAt: null,
      confirmedAt: null,
    })));

    expect(s.CONFIRMATION.status).toBe('SKIPPED');
    expect(s.CONFIRMATION.at).toBeNull();
    expect(s.WAREHOUSE.status).toBe('SKIPPED');
  });

  it('records the moment each stage was entered', () => {
    const s = byKey(orderStages(base({
      claimedAt: new Date('2026-09-01T09:00:00Z'),
      confirmedAt: new Date('2026-09-02T10:00:00Z'),
      confirmationStatus: 'CONFIRMED',
      shippingStatus: 'DELIVERED',
      shippedAt: new Date('2026-09-03T10:00:00Z'),
      deliveredAt: new Date('2026-09-05T12:00:00Z'),
    })));

    expect(s.INTAKE.at?.toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(s.CONFIRMATION.at?.toISOString()).toBe('2026-09-01T09:00:00.000Z');
    expect(s.TRANSIT.at?.toISOString()).toBe('2026-09-03T10:00:00.000Z');
    expect(s.CLOSED.at?.toISOString()).toBe('2026-09-05T12:00:00.000Z');
  });

  it('shows a cancelled order as closed, not as waiting somewhere', () => {
    const s = byKey(orderStages(base({ confirmationStatus: 'CANCELLED' })));
    expect(s.CLOSED.status).toBe('CURRENT');
    expect(s.CLOSED.facts).toContainEqual({ label: 'النتيجة', value: 'ملغي' });
    expect(s.TRANSIT.status).toBe('SKIPPED');
  });

  it('never marks a later stage done while an earlier one is current', () => {
    // The cards are read left to right; a filled circle after an empty one
    // would say the order went backwards.
    for (const order of [
      base(),
      base({ confirmationStatus: 'IN_PROGRESS', claimedAt: new Date() }),
      base({ confirmationStatus: 'CONFIRMED', shippingStatus: 'PACKING' }),
      base({ confirmationStatus: 'CONFIRMED', shippingStatus: 'SHIPPED', shippedAt: new Date() }),
      base({ confirmationStatus: 'CONFIRMED', shippingStatus: 'DELIVERED', deliveredAt: new Date() }),
    ]) {
      const stages = orderStages(order);
      const current = stages.findIndex((s) => s.status === 'CURRENT');
      stages.forEach((s, i) => {
        if (i > current) expect(s.status, `${s.key} after current`).toBe('PENDING');
        if (i < current) expect(['DONE', 'SKIPPED']).toContain(s.status);
      });
      expect(stages.filter((s) => s.status === 'CURRENT')).toHaveLength(1);
    }
  });
});
