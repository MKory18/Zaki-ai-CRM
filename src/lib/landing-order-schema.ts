/**
 * Shared validation for the PUBLIC landing-page order form (server-side).
 *
 * Security contract: price / productId / companyId / quantity / freeQuantity /
 * status / userId are NOT part of the schema — any client-sent value is
 * ignored. quantity/price derive server-side from slug → LandingPage →
 * LandingPageOffer → DB.
 *
 * Human-readable Arabic field errors replace raw Zod messages (which must
 * never leak to visitors).
 */

import { z } from 'zod';
import { isSyrianLocation } from '@/lib/locations/syria';

/**
 * Syrian phone validation:
 *  - accepts: 09XXXXXXXX / 9XXXXXXXX (mobile), landlines with area codes
 *    (011/021/031/033/041/043/051/052/053/06…), with or without
 *    +963 / 00963 / 963 prefixes, spaces/dashes/parentheses tolerated.
 *  - rejects: letters, very short numbers (<9 digits), nonsense values.
 */
export function isValidSyrianPhone(raw: string): boolean {
  if (!/^[+0-9()\s-]+$/.test(raw)) return false;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00963')) digits = digits.slice(5);
  else if (digits.startsWith('963') && digits.length > 9) digits = digits.slice(3);
  // After prefix stripping: 9–12 digits.
  //  - mobile: 09XXXXXXXX (10 digits) or 9XXXXXXXX (9 digits)
  //  - landline: 0 + area code + number (10 digits, e.g. 011/021/033/041…)
  if (digits.length < 9 || digits.length > 12) return false;
  if (!/^(?:0[1-9]|9)/.test(digits)) return false; // 0XXXXXXXX or 9XXXXXXXX
  return true;
}

export const publicOrderSchema = z.object({
  full_name: z
    .string({ message: 'يرجى إدخال الاسم الكامل.' })
    .trim()
    .min(2, 'يرجى إدخال الاسم الكامل.')
    .max(80, 'الاسم طويل جدًا.'),
  phone: z
    .string({ message: 'يرجى إدخال رقم هاتف صحيح.' })
    .trim()
    .min(6, 'يرجى إدخال رقم هاتف صحيح.')
    .max(25, 'رقم الهاتف طويل جدًا.')
    .refine(isValidSyrianPhone, 'يرجى إدخال رقم هاتف سوري صحيح.'),
  address: z
    .string({ message: 'يرجى إدخال العنوان.' })
    .trim()
    .min(5, 'يرجى إدخال العنوان بشكل أوضح.')
    .max(200, 'العنوان طويل جدًا.'),
  city: z
    .string({ message: 'يرجى اختيار المدينة.' })
    .trim()
    .min(2, 'يرجى اختيار المدينة.')
    .max(60, 'يرجى اختيار المدينة.')
    .refine((v) => isSyrianLocation(v), 'يرجى اختيار المدينة من القائمة.'),
  // Optional: pages WITHOUT offers fall back to the base product price.
  // When present it must reference a real offer (ownership checked in the route).
  offerId: z.string().trim().max(64, 'يرجى اختيار أحد العروض.').optional().default(''),
  notes: z.string().trim().max(500, 'الملاحظات طويلة جدًا.').optional().default(''),
  // Spam protections (checked below, never stored)
  website: z.string().max(0, 'Spam detected').optional().default(''),
  ts: z.string().max(20).optional().default(''),
});

export type PublicOrderInput = z.infer<typeof publicOrderSchema>;

/** Zod issue path → Arabic field error (path key → message). */
const FIELD_ERROR_MESSAGES: Record<string, string> = {
  full_name: 'يرجى إدخال الاسم الكامل.',
  phone: 'يرجى إدخال رقم هاتف صحيح.',
  address: 'يرجى إدخال العنوان.',
  city: 'يرجى اختيار المدينة.',
  offerId: 'يرجى اختيار أحد العروض.',
  notes: 'الملاحظات طويلة جدًا.',
};

/**
 * Maps Zod issues to safe Arabic field errors. NEVER returns Zod internals
 * ("Too small: expected string…" etc.) to the client.
 */
export function mapZodFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (!key) continue;
    if (!fieldErrors[key]) fieldErrors[key] = FIELD_ERROR_MESSAGES[key] || 'يرجى التأكد من صحة بيانات الطلب.';
  }
  return fieldErrors;
}

/** Generic safe error response body for a failed validation. */
export const ORDER_VALIDATION_ERROR_BODY = {
  error: 'يرجى التأكد من صحة بيانات الطلب.',
};