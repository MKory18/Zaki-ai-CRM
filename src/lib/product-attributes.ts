import { z } from 'zod';
import { normalizeArabic } from './order-parser';

/**
 * WHAT KIND OF THING THIS IS — WRITTEN PER CATEGORY.
 *
 * «مناسب لـ» and «المكوّنات» are the right questions for a remedy and the
 * wrong ones for a shirt, which needs «المقاس» and «الخامة». So the
 * questions belong to the CATEGORY and the answers to the PRODUCT, and
 * neither is a column: a fixed set of five would be wrong for the sixth
 * kind of thing a shop starts selling.
 *
 * WHY JSON AND NOT TWO TABLES. An attribute table plus a value table is the
 * classic answer and it buys SQL filtering — which this system does not
 * need yet, because a shop's catalogue is read whole and filtered in memory
 * (see the boundary written out in store-search.ts). What it would cost is
 * two more tables, two more joins on every catalogue read, and a second
 * place for «what kind of thing is this» to live beside `Category`. The
 * same trade this repository already made for the theme, the home page's
 * sections and the shop's search vocabulary.
 *
 * THE FILTER'S OPTIONS ARE DERIVED, NEVER STORED. A filter that offers
 * «للأطفال» when no product says so is a dead end a shopper walks into
 * once. `facetsFor` reads the options off the products that actually carry
 * them — the same rule the category chips already follow.
 *
 * AND A VALUE THAT NO LONGER FITS IS DROPPED, NOT THROWN. A seller who
 * renames a field should lose an answer, not a product page.
 */

/**
 * Four kinds, and no more.
 *
 * `text` is prose — «المكوّنات» reads as a paragraph and filtering by it
 * would offer a shopper four hundred one-product options. It is shown and
 * searched, never faceted. The other three are the ones a person can
 * actually narrow a grid with.
 */
export const FIELD_KINDS = ['text', 'select', 'multi', 'number'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** The kinds a shopper may narrow the grid by. */
export const FILTERABLE_KINDS: readonly FieldKind[] = ['select', 'multi', 'number'];

/** Enough for any category anybody has described; few enough to fit a sheet. */
export const MAX_FIELDS = 12;
export const MAX_OPTIONS = 40;

const key = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,29}$/, 'المعرّف حروف لاتينية صغيرة وأرقام وشرطة سفلية');

export const attributeFieldSchema = z
  .object({
    /** Stable, and what a product's answers are keyed by. */
    key,
    /** What the shopper reads. */
    label: z.string().trim().min(1).max(40),
    kind: z.enum(FIELD_KINDS),
    /** For `select` and `multi`. Ignored otherwise — see the refinement. */
    options: z.array(z.string().trim().min(1).max(40)).max(MAX_OPTIONS).default([]),
    /** For `number`: what it is measured in, shown beside the figure. */
    unit: z.string().trim().max(12).default(''),
  })
  .strict()
  .refine((f) => !['select', 'multi'].includes(f.kind) || f.options.length > 0, {
    message: 'حقل الاختيار بلا خيارات لا يمكن الإجابة عليه',
    path: ['options'],
  })
  .refine(
    (f) => new Set(f.options.map((o) => normalizeArabic(o))).size === f.options.length,
    { message: 'خياران متطابقان بعد التطبيع', path: ['options'] }
  );

export type AttributeField = z.infer<typeof attributeFieldSchema>;

export const categoryAttributesSchema = z
  .array(attributeFieldSchema)
  .max(MAX_FIELDS)
  .refine((fs) => new Set(fs.map((f) => f.key)).size === fs.length, {
    message: 'معرّفان متكرّران — لكل حقل معرّف واحد',
  });

/**
 * A category's questions out of its column.
 *
 * Field by field when the whole list will not parse: a category whose
 * schema stopped loading should lose one question, not all of them.
 */
export function parseCategoryAttributes(raw: string | null | undefined): AttributeField[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const whole = categoryAttributesSchema.safeParse(value);
  if (whole.success) return whole.data;

  const out: AttributeField[] = [];
  for (const row of value) {
    const one = attributeFieldSchema.safeParse(row);
    if (!one.success) continue;
    if (out.some((f) => f.key === one.data.key)) continue;
    if (out.length >= MAX_FIELDS) break;
    out.push(one.data);
  }
  return out;
}

/** What one product answered. A string, a list of strings, or a number. */
export type AttributeValue = string | string[] | number;
export type ProductAttributes = Record<string, AttributeValue>;

/**
 * A product's answers, kept only where they still fit the category's
 * questions.
 *
 * An answer to a question that was deleted is dropped. An option that was
 * removed from a `select` is dropped. A number that arrived as text is read
 * as a number when it is one and dropped when it is not. The product keeps
 * every answer that still means something, which is what a seller who
 * edited a category expects and what a crash is not.
 */
export function parseProductAttributes(
  raw: string | null | undefined,
  fields: AttributeField[]
): ProductAttributes {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const row = value as Record<string, unknown>;
  const out: ProductAttributes = {};
  for (const field of fields) {
    const answer = row[field.key];
    if (answer === undefined || answer === null) continue;

    if (field.kind === 'text') {
      if (typeof answer === 'string' && answer.trim()) out[field.key] = answer.trim().slice(0, 2000);
      continue;
    }

    if (field.kind === 'number') {
      const n = typeof answer === 'number' ? answer : Number(answer);
      if (Number.isFinite(n)) out[field.key] = n;
      continue;
    }

    const allowed = new Map(field.options.map((o) => [normalizeArabic(o), o]));
    if (field.kind === 'select') {
      const hit = typeof answer === 'string' ? allowed.get(normalizeArabic(answer)) : undefined;
      if (hit) out[field.key] = hit;
      continue;
    }

    // multi
    const picked = (Array.isArray(answer) ? answer : [answer])
      .flatMap((a) => (typeof a === 'string' ? [allowed.get(normalizeArabic(a))] : []))
      .filter((a): a is string => Boolean(a));
    const unique = [...new Set(picked)];
    if (unique.length) out[field.key] = unique;
  }
  return out;
}

/** One narrowing a shopper can make, with the choices that lead somewhere. */
export interface Facet {
  key: string;
  label: string;
  kind: FieldKind;
  unit: string;
  /** For select / multi: each option and how many products carry it. */
  options: { value: string; count: number }[];
  /** For number: the range the products actually span. */
  range: { min: number; max: number } | null;
}

/**
 * THE NARROWINGS THIS PAGE CAN ACTUALLY OFFER.
 *
 * Derived from the products in front of the shopper, never from the
 * category's list of options — an option no product carries is a filter
 * that empties the grid, and a shopper who hits one stops trusting the
 * others. A field every product answers the same way is dropped too: it
 * narrows nothing, and it costs a row on a phone.
 */
export function facetsFor(
  fields: AttributeField[],
  products: { attributes: ProductAttributes }[]
): Facet[] {
  const out: Facet[] = [];
  for (const field of fields) {
    if (!FILTERABLE_KINDS.includes(field.kind)) continue;

    if (field.kind === 'number') {
      const numbers = products
        .map((p) => p.attributes[field.key])
        .filter((v): v is number => typeof v === 'number');
      if (numbers.length === 0) continue;
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      if (min === max) continue; // nothing to slide between
      out.push({ key: field.key, label: field.label, kind: field.kind, unit: field.unit, options: [], range: { min, max } });
      continue;
    }

    const counts = new Map<string, number>();
    for (const p of products) {
      const v = p.attributes[field.key];
      for (const one of Array.isArray(v) ? v : typeof v === 'string' ? [v] : []) {
        counts.set(one, (counts.get(one) ?? 0) + 1);
      }
    }
    // One option that everything carries narrows nothing.
    if (counts.size < 2) continue;

    out.push({
      key: field.key,
      label: field.label,
      kind: field.kind,
      unit: field.unit,
      // The order the seller wrote them in, so a size list reads S · M · L
      // rather than by however many of each happen to be in stock.
      options: field.options
        .filter((o) => counts.has(o))
        .map((o) => ({ value: o, count: counts.get(o)! })),
      range: null,
    });
  }
  return out;
}

/**
 * Does this product answer the narrowing a shopper asked for?
 *
 * Several values of ONE field are an «or» — somebody who ticked أحمر and
 * أزرق wants either. Several FIELDS are an «and» — they narrowed twice on
 * purpose. That is what every shop does and what a shopper expects without
 * being told.
 */
export function matchesAttributes(
  attributes: ProductAttributes,
  wanted: Record<string, string[]>
): boolean {
  for (const [key, values] of Object.entries(wanted)) {
    if (values.length === 0) continue;
    const has = attributes[key];
    const mine = Array.isArray(has) ? has : has === undefined ? [] : [String(has)];
    if (!values.some((v) => mine.includes(v))) return false;
  }
  return true;
}
