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
import { isValidPhoneFor, phoneErrorFor } from '@/lib/phone-rules';

/**
 * The country the page sells into, resolved server-side from
 * slug → LandingPage → Store → Country. It is never taken from the browser.
 *
 * `regions` are that country's own region names (the Region table). When a
 * country has none recorded yet, the city becomes free text instead of being
 * rejected outright — an unconfigured country must not silently stop taking
 * orders.
 */
export interface OrderLocale {
  countryCode: string | null;
  regions: string[];
}

/** Matches a submitted city against the country's regions, ignoring case and spacing. */
export function isKnownRegion(regions: string[], value: string): boolean {
  const v = value.trim().toLocaleLowerCase('ar');
  return regions.some((r) => r.trim().toLocaleLowerCase('ar') === v);
}

export function buildPublicOrderSchema(locale: OrderLocale) {
  const hasRegions = locale.regions.length > 0;

  return z.object({
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
      .refine((p) => isValidPhoneFor(locale.countryCode, p), phoneErrorFor(locale.countryCode)),
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
      .refine(
        (v) => !hasRegions || isKnownRegion(locale.regions, v),
        'يرجى اختيار المدينة من القائمة.'
      ),
    // Optional: pages WITHOUT offers fall back to the base product price.
    // When present it must reference a real offer (ownership checked in the route).
    offerId: z.string().trim().max(64, 'يرجى اختيار أحد العروض.').optional().default(''),
    notes: z.string().trim().max(500, 'الملاحظات طويلة جدًا.').optional().default(''),
    // Spam protections (checked below, never stored)
    website: z.string().max(0, 'Spam detected').optional().default(''),
    ts: z.string().max(20).optional().default(''),
  });
}

export type PublicOrderInput = z.infer<ReturnType<typeof buildPublicOrderSchema>>;

/** Any Arabic letter — the marker of a message we authored ourselves. */
const ARABIC = /[؀-ۿ]/;

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
    if (!key || fieldErrors[key]) continue;
    // Our own messages are Arabic and Zod's internals are not, so an Arabic
    // message is one we wrote and is safe to show — and more specific than
    // the fallback ("رقم هاتف أردني صحيح" instead of "رقم هاتف صحيح").
    fieldErrors[key] = ARABIC.test(issue.message)
      ? issue.message
      : FIELD_ERROR_MESSAGES[key] || 'يرجى التأكد من صحة بيانات الطلب.';
  }
  return fieldErrors;
}

/** Generic safe error response body for a failed validation. */
export const ORDER_VALIDATION_ERROR_BODY = {
  error: 'يرجى التأكد من صحة بيانات الطلب.',
};