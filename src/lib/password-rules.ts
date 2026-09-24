/**
 * WHAT A PASSWORD MUST HAVE — said once.
 *
 * The rule lived in four routes (register, reset, profile, create-employee)
 * and a fifth time as a sentence under the password box, and the form that
 * creates an employee checked only the length. So the button said ready for
 * "abcdefgh", the server refused it, and the refusal arrived as «كلمة المرور
 * غير صالح» — no word about what was missing — in a line that could sit
 * below the fold of a long form. The owner's report was the only accurate
 * summary: «ما بنشء موظف».
 *
 * Now the routes and the form read the same list, the form shows each rule
 * ticking as it is met, and a refusal names exactly what is missing.
 *
 * Pure and dependency-free: the form runs in the browser.
 */

export interface PasswordRule {
  key: 'length' | 'upper' | 'lower' | 'digit';
  ar: string;
  test: (password: string) => boolean;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const PASSWORD_RULES: PasswordRule[] = [
  { key: 'length', ar: `${PASSWORD_MIN} أحرف على الأقل`, test: (p) => p.length >= PASSWORD_MIN },
  { key: 'upper', ar: 'حرف كبير (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', ar: 'حرف صغير (a-z)', test: (p) => /[a-z]/.test(p) },
  { key: 'digit', ar: 'رقم (0-9)', test: (p) => /[0-9]/.test(p) },
];

/** The rules this password does not meet yet, in order. */
export function passwordProblems(password: string): PasswordRule[] {
  const p = String(password ?? '');
  return PASSWORD_RULES.filter((r) => !r.test(p));
}

/**
 * The refusal as one sentence, or null when the password is acceptable.
 *
 * Names every missing rule at once. Reporting them one by one sends the
 * person round the loop three times for a password that lacked three things.
 */
export function passwordMessage(password: string): string | null {
  const missing = passwordProblems(password);
  if (missing.length === 0) return null;
  return `كلمة المرور ينقصها: ${missing.map((r) => r.ar).join('، ')}`;
}

/**
 * The same rule for a zod schema's superRefine, so every route refuses with
 * the same sentence:
 *
 *     password: z.string().max(PASSWORD_MAX).superRefine(checkPassword)
 */
export function checkPassword(
  password: string,
  ctx: { addIssue: (issue: { code: 'custom'; message: string }) => void }
): void {
  const message = passwordMessage(password);
  if (message) ctx.addIssue({ code: 'custom', message });
}
