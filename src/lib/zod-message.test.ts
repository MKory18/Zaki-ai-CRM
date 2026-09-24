import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodMessage } from './zod-message';

/**
 * What a person reads when a button refuses them.
 *
 * Forty-eight routes used to hand the raw library text to the screen, so an
 * Arabic user pressing save got "Too small: expected string to have >=10
 * characters". Which field? Too small next to what? The message named none
 * of it, and the usual cause was a dropdown nobody had chosen.
 */

const fail = (schema: z.ZodType, value: unknown) => {
  const r = schema.safeParse(value);
  if (r.success) throw new Error('expected the schema to refuse this');
  return zodMessage(r.error);
};

describe('an id that was never chosen', () => {
  it('says to choose one, not that a string is too short', () => {
    // This is the exact failure the user hit.
    const schema = z.object({ productId: z.string().min(10).max(64) });
    expect(fail(schema, { productId: '' })).toBe('اختر المنتج أولاً');
  });

  it('says the same for a missing one', () => {
    const schema = z.object({ productId: z.string().min(10) });
    expect(fail(schema, {})).toBe('المنتج مطلوب');
  });

  it('names the id inside a list of lines', () => {
    // `items.0.productId` — the deepest named key is the useful one.
    const schema = z.object({ items: z.array(z.object({ productId: z.string().min(10) })) });
    expect(fail(schema, { items: [{ productId: '' }] })).toBe('اختر المنتج أولاً');
  });
});

describe('ordinary fields', () => {
  it('says how many characters a name needs', () => {
    const schema = z.object({ name: z.string().min(3) });
    expect(fail(schema, { name: 'a' })).toBe('الاسم: 3 أحرف على الأقل');
  });

  it('says the ceiling when something is too long', () => {
    const schema = z.object({ reason: z.string().max(5) });
    expect(fail(schema, { reason: 'طويلة جداً' })).toBe('السبب: 5 حرفاً على الأكثر');
  });

  it('does not talk about characters for a number', () => {
    const schema = z.object({ quantity: z.number().min(1) });
    expect(fail(schema, { quantity: 0 })).toBe('الكمية: 1 على الأقل');
  });

  it('calls a malformed email invalid rather than quoting a regex', () => {
    const schema = z.object({ email: z.string().email() });
    expect(fail(schema, { email: 'nope' })).toBe('البريد الإلكتروني غير صالح');
  });
});

describe('when it does not recognise the field', () => {
  it('keeps the original message rather than hiding the problem', () => {
    // A generic "بيانات غير صالحة" would hide which of eleven fields is
    // wrong, which is worse than English.
    const schema = z.object({ somethingNew: z.string().min(4) });
    expect(fail(schema, { somethingNew: 'a' })).toBeTruthy();
    expect(fail(schema, { somethingNew: 'a' })).not.toBe('بيانات غير صالحة');
  });

  it('has something to say about an empty error', () => {
    expect(zodMessage({ issues: [] } as never)).toBe('بيانات غير صالحة');
  });
});

describe("a schema author’s own Arabic sentence", () => {
  it('is kept for a failed pattern, instead of «غير صالح»', () => {
    // «رمز العملة ثلاثة أحرف (ISO)» already says what to do; replacing it
    // with «رمز العملة غير صالح» threw away the only helpful part.
    const schema = z.object({ currencyCode: z.string().regex(/^[A-Z]{3}$/, 'رمز العملة ثلاثة أحرف (ISO)') });
    const parsed = schema.safeParse({ currencyCode: 'دينار' });
    expect(zodMessage(parsed.error!)).toContain('رمز العملة ثلاثة أحرف (ISO)');
  });

  it("still says «غير صالح» when the only message is zod’s own English", () => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse({ email: 'nope' });
    expect(zodMessage(parsed.error!)).toBe('البريد الإلكتروني غير صالح');
  });
});

