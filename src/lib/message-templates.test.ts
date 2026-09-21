import { describe, expect, it } from 'vitest';
import { fillTemplate, waNumber, DEFAULT_TEMPLATES, TEMPLATE_VARS } from './message-templates';

/**
 * The sentence a customer actually receives.
 *
 * Everything here is about not sending something embarrassing: a brace the
 * customer cannot act on, a double space where a value was missing, or a
 * WhatsApp link to a number that does not exist.
 */

const ctx = {
  orderNumber: 'SY-2026-0150',
  customerName: 'محمد',
  amount: 50.01,
  currency: 'USD',
  courier: 'باشا',
  barcode: 'BC-777',
  region: 'السويداء',
  storeName: 'صحة بلس',
};

describe('filling a template', () => {
  it('puts the order’s own words in', () => {
    expect(fillTemplate('طلبك {رقم_الطلب} مع {شركة_الشحن}', ctx)).toBe('طلبك SY-2026-0150 مع باشا');
  });

  it('leaves nothing behind when a value is missing', () => {
    // A customer reading "{الباركود}" knows our system is broken and has
    // no repair to make.
    const out = fillTemplate('رقم التتبع {الباركود} شكراً', { ...ctx, barcode: null });
    expect(out).not.toContain('{');
    expect(out).toBe('رقم التتبع شكراً');
  });

  it('does not collapse a placeholder it does not know', () => {
    // Better a visible unknown than silently deleting text somebody typed.
    expect(fillTemplate('مرحبا {شيء_غريب}', ctx)).toContain('{شيء_غريب}');
  });

  it('handles a zero amount without dropping it', () => {
    expect(fillTemplate('المبلغ {المبلغ}', { ...ctx, amount: 0 })).toBe('المبلغ 0');
  });
});

describe('the WhatsApp number', () => {
  it('strips everything that is not a digit', () => {
    expect(waNumber('+963 932 374 769')).toBe('963932374769');
  });

  it('adds the country code and drops the leading zero', () => {
    expect(waNumber('0932374769', '963')).toBe('963932374769');
  });

  it('leaves a number that already carries its code', () => {
    expect(waNumber('963932374769', '963')).toBe('963932374769');
  });

  it('gives nothing for nothing, rather than a broken link', () => {
    expect(waNumber('')).toBe('');
    expect(waNumber('—')).toBe('');
  });
});

describe('the defaults', () => {
  it('only use placeholders that exist', () => {
    // A default shipping with a typo would go out to real customers.
    const known = new Set<string>(TEMPLATE_VARS.map((v) => v.key));
    for (const t of DEFAULT_TEMPLATES) {
      for (const [, name] of t.body.matchAll(/\{([^}]+)\}/g)) {
        expect(known.has(name.trim()), `${t.id}: {${name}}`).toBe(true);
      }
    }
  });

  it('leave no stray braces once filled', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(fillTemplate(t.body, ctx)).not.toContain('{');
    }
  });
});
