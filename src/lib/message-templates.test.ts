import { describe, expect, it } from 'vitest';
import {
  fillTemplate,
  waNumber,
  normalizeTemplate,
  DEFAULT_TEMPLATES,
  SITUATIONS,
  SITUATION_KEYS,
  TEMPLATE_VARS,
} from './message-templates';

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


/**
 * WHEN A TEMPLATE IS SAID, AND WHETHER IT IS SAID AT ALL.
 *
 * Templates written before situations existed are in real companies' rows
 * right now, missing three fields. They must keep working: an agent is
 * mid-call, and a row with a field missing must never be the reason the
 * picker is empty.
 */
describe('a template written before situations existed', () => {
  const old = { id: 't1', name: 'قديم', channel: 'SMS', body: 'مرحبا {اسم_الزبون}' };

  it('lands in "غير مصنّفة" — never filed under a moment nobody chose', () => {
    expect(normalizeTemplate(old).situation).toBe('other');
  });

  it('stays offered, because it always was', () => {
    expect(normalizeTemplate(old).active).toBe(true);
  });

  it('and keeps its own channel and wording', () => {
    const t = normalizeTemplate(old);
    expect(t.channel).toBe('SMS');
    expect(t.body).toBe('مرحبا {اسم_الزبون}');
  });

  it('turned off stays off — only a missing flag means on', () => {
    expect(normalizeTemplate({ ...old, active: false }).active).toBe(false);
  });

  it('a situation this build does not know is dropped, not kept', () => {
    expect(normalizeTemplate({ ...old, situation: 'invented' }).situation).toBe('other');
  });

  it('a language outside the shop languages falls back to Arabic', () => {
    expect(normalizeTemplate({ ...old, lang: 'kl' }).lang).toBe('ar');
    expect(normalizeTemplate({ ...old, lang: 'tr' }).lang).toBe('tr');
  });

  it('a channel that is not a channel becomes both, not nothing', () => {
    // Nothing would be a template the picker never shows, silently.
    expect(normalizeTemplate({ ...old, channel: 'PIGEON' }).channel).toBe('BOTH');
  });
});

describe('the situations', () => {
  it('every default is filed under one this build knows', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(SITUATION_KEYS, t.id).toContain(t.situation);
    }
  });

  it('every moment the document names has a sentence to start from', () => {
    // "غير مصنّفة" is not a moment — nothing is written into it on purpose.
    const used = new Set(DEFAULT_TEMPLATES.map((t) => t.situation));
    for (const s of SITUATIONS) {
      if (s.key === 'other') continue;
      expect(used.has(s.key), s.ar).toBe(true);
    }
  });

  it('and every default is offered and in Arabic', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.active, t.id).toBe(true);
      expect(t.lang, t.id).toBe('ar');
    }
  });
});
