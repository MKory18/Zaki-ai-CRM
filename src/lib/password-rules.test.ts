import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { PASSWORD_RULES, checkPassword, passwordMessage, passwordProblems } from './password-rules';
import { zodMessage } from './zod-message';

describe('one password rule', () => {
  it('accepts a password with all four', () => {
    expect(passwordProblems('Passw0rdOk')).toEqual([]);
    expect(passwordMessage('Passw0rdOk')).toBeNull();
  });

  it('names every rule a password misses, at once', () => {
    // Reported one at a time, a password lacking three things sends its
    // author round the loop three times.
    const keys = passwordProblems('abc').map((r) => r.key);
    expect(keys).toEqual(['length', 'upper', 'digit']);
  });

  it('catches the case the old form let through: long enough, and nothing else', () => {
    expect(passwordProblems('abcdefgh').map((r) => r.key)).toEqual(['upper', 'digit']);
  });

  it('treats a missing value as missing everything, not as a crash', () => {
    expect(passwordProblems(undefined as unknown as string)).toHaveLength(PASSWORD_RULES.length);
  });
});

describe('the same rule inside a schema', () => {
  const schema = z.object({ password: z.string().superRefine(checkPassword) });

  it('refuses with the sentence that names what is missing', () => {
    const parsed = schema.safeParse({ password: 'abcdefgh' });
    expect(parsed.success).toBe(false);
    const message = zodMessage(parsed.error!);
    expect(message).toContain('حرف كبير');
    expect(message).toContain('رقم');
    // Not «كلمة المرور: كلمة المرور ينقصها…» — the field is named once.
    expect(message.match(/كلمة المرور/g)).toHaveLength(1);
  });

  it('passes a sound password', () => {
    expect(schema.safeParse({ password: 'Passw0rdOk' }).success).toBe(true);
  });
});
