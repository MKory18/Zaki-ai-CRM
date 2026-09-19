import { z } from 'zod';

/** Request schemas for /api/geo/* — shared so create and update stay identical. */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'الوقت يجب أن يكون بصيغة HH:mm');

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'منطقة زمنية غير صالحة');

export const countryCreateSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'رمز البلد حرفان (ISO)'),
  name: z.string().trim().min(2).max(60),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'رمز العملة ثلاثة أحرف (ISO)'),
  minorUnit: z.number().int().min(0).max(4),
  workHoursStart: hhmm.default('09:00'),
  workHoursEnd: hhmm.default('17:00'),
  weekendDays: z
    .array(z.number().int().min(0).max(6))
    .max(6)
    .refine((d) => new Set(d).size === d.length, 'أيام العطلة مكررة')
    .default([5]),
  timezone: timezone.default('Asia/Damascus'),
  orderPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, 'بادئة الطلب 1-6 أحرف/أرقام').default('ORD'),
  allowNegativeStock: z.boolean().default(false),
});

// Update: every field optional, no defaults re-applied; isActive replaces delete.
export const countryUpdateSchema = z
  .object({
    code: countryCreateSchema.shape.code,
    name: countryCreateSchema.shape.name,
    currencyCode: countryCreateSchema.shape.currencyCode,
    minorUnit: countryCreateSchema.shape.minorUnit,
    workHoursStart: hhmm,
    workHoursEnd: hhmm,
    weekendDays: z
      .array(z.number().int().min(0).max(6))
      .max(6)
      .refine((d) => new Set(d).size === d.length, 'أيام العطلة مكررة'),
    timezone,
    orderPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/),
    allowNegativeStock: z.boolean(),
    isActive: z.boolean(),
  })
  .partial()
  .strict();

export const regionCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const STORE_STATUSES = ['ACTIVE', 'PAUSED'] as const;
export const STORE_TYPES = ['MULTI_PRODUCT', 'SINGLE_PRODUCT'] as const;

export const storeCreateSchema = z.object({
  countryId: z.string().uuid('يجب اختيار البلد'),
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'المعرّف: أحرف إنجليزية صغيرة وأرقام وشرطات'),
  logo: z.string().url().max(500).optional(),
  status: z.enum(STORE_STATUSES).default('ACTIVE'),
  type: z.enum(STORE_TYPES).default('MULTI_PRODUCT'),
});

// countryId is intentionally absent: a store never moves between countries.
export const storeUpdateSchema = z
  .object({
    name: storeCreateSchema.shape.name,
    slug: storeCreateSchema.shape.slug,
    logo: z.string().url().max(500).nullable(),
    status: z.enum(STORE_STATUSES),
    type: z.enum(STORE_TYPES),
  })
  .partial()
  .strict();

export const contextSelectSchema = z.object({
  countryId: z.string().uuid(),
  storeId: z.string().uuid().nullable().optional(),
});

export const geoAccessSchema = z.object({
  countryIds: z.array(z.string().uuid()).max(200),
  storeIds: z.array(z.string().uuid()).max(500).default([]),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message || 'بيانات غير صالحة';
}
