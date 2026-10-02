import { z } from 'zod';

/**
 * A PARTIAL EDIT MAY ONLY WRITE WHAT THE CALLER SENT.
 *
 * `.partial()` in zod 4 makes a field optional. It does NOT remove the
 * field's `.default()` — so a field the caller never sent comes back
 * PRESENT, carrying its default instead of the stored value. A route that
 * then merges on `!== undefined`, or writes `parsed.data` whole, writes
 * every one of them over the row.
 *
 * That is not a theoretical shape. It was measured on four separate doors:
 *
 *   offerFields.partial().safeParse({ sortOrder: 1 })
 *     → { sortOrder: 1, quantity: 1, discount: 0, isDefault: false, ... }
 *   campaignInputSchema.omit({ code: true }).partial().safeParse({ name: 'x' })
 *     → { name: 'x', platform: 'META', status: 'ACTIVE', spend: 0 }
 *   storePageCreateSchema.partial().safeParse({ isPublished: true })
 *     → { body: '', kind: 'CUSTOM', isPublished: true, sortOrder: 0 }
 *   redirectCreateSchema.partial().safeParse({ to: '/b' })
 *     → { to: '/b', kind: 302, isActive: true }
 *
 * Renaming a campaign wiped its recorded ad spend to 0 and re-activated an
 * ENDED one. Publishing a page erased its entire text. Changing a
 * redirect's destination turned a permanent 301 into a temporary 302 and
 * switched a deliberately disabled redirect back on.
 *
 * WHY THIS LIVES IN A FILE OF ITS OWN, AND NOT IN ANY OF THE FOUR. The fix
 * first landed inside `offers.ts` (323e95a), which is where the defect was
 * found rather than where the answer belongs: `offers.ts` is a domain
 * module that knows about Prisma, and `store-pages.ts` states on its first
 * line that it is client-safe. Four copies of this helper would be the same
 * defect in a different coat — the fifth door written next year would get
 * none of them. So it sits beside `zod-message.ts`: one zod-shaped rule, no
 * domain attached, importable by anything.
 *
 * AND IT IS WRITTEN OVER THE SHAPE, NOT FIELD BY FIELD. A field added to
 * any create schema tomorrow with a `.default()` is stripped without
 * anybody remembering to strip it, which is the only version of this fix
 * that cannot rot. Each patch schema's own test walks its fields and
 * refuses any that invents a value out of `undefined`, so a zod wrapper
 * this helper does not know about — `.prefault()`, `.catch()` — fails a
 * suite instead of shipping.
 *
 * THE CREATE DOORS KEEP EVERY DEFAULT. This is only ever applied to the
 * partial-edit schema: a POST is the row being written whole, and an
 * unstated quantity on a new bundle really is 1.
 */

type NoDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;

/** Every field of a shape, optional, and absent when the caller was silent. */
export type Omitted<Shape extends z.ZodRawShape> = {
  [K in keyof Shape]: z.ZodOptional<NoDefault<Shape[K]>>;
};

/**
 * One field, as it arrives when the caller did not send it: absent.
 *
 * A shape's values are typed as zod's CORE base, which carries neither
 * `.optional()` nor the inner type of a `.default()` — `unwrap()` there
 * returns the base again. The two annotations say what the runtime already
 * guarantees; `Omitted` above is what the parse output is typed from, so
 * nothing downstream is loosened by them.
 */
function sentOrAbsent(field: unknown): z.ZodTypeAny {
  const schema = field as z.ZodTypeAny;
  const sent = schema instanceof z.ZodDefault ? (schema.unwrap() as z.ZodTypeAny) : schema;
  return sent.optional();
}

/**
 * The shape of a create schema, turned into the shape of a patch schema.
 *
 * Wrap the result in `z.object(...)` — and `.strict()` where the create
 * door is strict, so a body carrying a field nobody accepts is still
 * refused rather than quietly dropped.
 */
export function omittedMeansOmitted<Shape extends z.ZodRawShape>(shape: Shape): Omitted<Shape> {
  const out: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(shape)) out[key] = sentOrAbsent(field);
  return out as Omitted<Shape>;
}
