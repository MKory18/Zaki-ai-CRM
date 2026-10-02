import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { omittedMeansOmitted } from './zod-patch';
import { campaignInputSchema, campaignPatchSchema } from './campaigns';
import { storePageCreateSchema, storePageUpdateSchema } from './store-pages';
import { redirectCreateSchema, redirectUpdateSchema } from './store-redirects';

/**
 * A PARTIAL EDIT MAY NOT WRITE A VALUE THE CALLER DID NOT SEND.
 *
 * `323e95a` found this on the offers door and fixed it in the schema. Three
 * more doors carried the same defect, and the guards here are written the
 * way that commit's were: they WALK EACH PATCH SCHEMA'S OWN FIELDS and
 * refuse any field that makes a value out of `undefined`. A field added to
 * any of the create schemas tomorrow with a `.default()` fails here instead
 * of wiping a seller's data in production — which a list copied out of the
 * schema would not do.
 */

/**
 * Every patch schema in the repo that is built from a create schema, with a
 * value each of its fields accepts — so the one-field edits below can be
 * parsed for real rather than asserted about.
 *
 * `fields` is NOT the guard. It is only how each test proves it read the
 * real shape before walking it; the guards themselves walk `patch.shape`.
 */
const PATCH_DOORS = [
  {
    name: 'campaignPatchSchema',
    patch: campaignPatchSchema,
    // `code` is deliberately not editable: it is stamped on every order.
    sample: {
      name: 'حملة الشتاء',
      platform: 'TIKTOK',
      landingPageId: null,
      status: 'PAUSED',
      startDate: '2026-01-01',
      endDate: null,
      spend: 1250,
      notes: null,
    },
  },
  {
    name: 'storePageUpdateSchema',
    patch: storePageUpdateSchema,
    sample: {
      slug: 'privacy',
      title: 'سياسة الخصوصية',
      body: 'نصّ السياسة',
      kind: 'PRIVACY',
      isPublished: true,
      sortOrder: 3,
    },
  },
  {
    name: 'redirectUpdateSchema',
    patch: redirectUpdateSchema,
    sample: {
      from: '/lp/old',
      to: '/lp/new',
      kind: 301,
      isActive: false,
    },
  },
] as const;

describe.each(PATCH_DOORS)('$name invents nothing', ({ name, patch, sample }) => {
  it('has every field of its create door, so the shape really was read', () => {
    // A field added to the create door with no sample here fails this line,
    // which is the point: the walk below would otherwise skip it.
    expect(Object.keys(patch.shape).sort()).toEqual(Object.keys(sample).sort());
  });

  /**
   * The guard for a field nobody has written yet. `safeParse(undefined)`
   * returning anything other than `undefined` means that field manufactures
   * a value — which catches `.default()`, `.prefault()` and `.catch()`
   * alike, rather than any one wrapper this helper happens to know about.
   */
  it('makes no value out of nothing, field by field, present and future', () => {
    const shape = patch.shape as Record<string, z.ZodTypeAny>;
    for (const field of Object.keys(shape)) {
      const r = shape[field].safeParse(undefined);
      // Reported as a quadruple so a failure names the offending field.
      expect([name, field, r.success, r.success ? r.data : 'refused']).toEqual([
        name,
        field,
        true,
        undefined,
      ]);
    }
  });

  it('parses an empty edit to an empty edit', () => {
    const r = patch.safeParse({});
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toEqual({});
    expect(Object.keys(r.data)).toEqual([]);
  });

  /**
   * AND ONE FIELD AT A TIME CARRIES ONLY THAT FIELD.
   *
   * The empty-edit case above could pass while a one-field edit still
   * dragged the rest along, if a future helper only stripped defaults when
   * the object happened to be wholly empty. So each field is sent on its
   * own and the output is required to be exactly that field.
   */
  it('carries one field when one field was sent, and not a single other', () => {
    for (const [field, value] of Object.entries(sample)) {
      const r = patch.safeParse({ [field]: value });
      expect([name, field, r.success]).toEqual([name, field, true]);
      if (!r.success) continue;
      expect(Object.keys(r.data), `${name}.${field}`).toEqual([field]);
    }
  });
});

/**
 * THE CREATE DOORS STILL FILL A ROW IN.
 *
 * The defaults are RIGHT on POST — a new campaign really has spent nothing,
 * a new page really is a draft, a new redirect really should be a 302. If
 * these ever fail while the guards above pass, the fix was applied to the
 * wrong schema.
 */
describe('every create door keeps applying its defaults', () => {
  it('a new campaign: META, ACTIVE, spend 0', () => {
    expect(campaignInputSchema.parse({ name: 'حملة', startDate: '2026-01-01' })).toMatchObject({
      platform: 'META',
      status: 'ACTIVE',
      spend: 0,
    });
  });

  it('a new page: empty body, CUSTOM, unpublished, first in order', () => {
    expect(storePageCreateSchema.parse({ slug: 'about', title: 'من نحن' })).toEqual({
      slug: 'about',
      title: 'من نحن',
      body: '',
      kind: 'CUSTOM',
      isPublished: false,
      sortOrder: 0,
    });
  });

  it('a new redirect: 302, and on', () => {
    expect(redirectCreateSchema.parse({ from: '/lp/a', to: '/lp/b' })).toEqual({
      from: '/lp/a',
      to: '/lp/b',
      kind: 302,
      isActive: true,
    });
  });
});

/**
 * THE STRICTNESS EACH DOOR HAD IS STILL THERE.
 *
 * `.partial().strict()` became `z.object(omittedMeansOmitted(...)).strict()`,
 * and dropping the `.strict()` on the way would turn a form sending a field
 * nobody accepts from a 400 into silence.
 */
describe('a body carrying a field the door does not have', () => {
  it('is refused by the page door', () => {
    expect(storePageUpdateSchema.safeParse({ title: 'عنوان', theme: 'dark' }).success).toBe(false);
  });

  it('is refused by the redirect door', () => {
    expect(redirectUpdateSchema.safeParse({ to: '/b', suggested: false }).success).toBe(false);
  });
});

/** The helper itself, on a shape owned by nobody. */
describe('omittedMeansOmitted', () => {
  const shape = {
    withDefault: z.string().default('x'),
    plain: z.number(),
    alreadyOptional: z.boolean().optional(),
    nullableWithDefault: z.string().nullable().default(null),
  };
  const patched = z.object(omittedMeansOmitted(shape));

  it('strips the default and leaves the field optional', () => {
    expect(patched.parse({})).toEqual({});
    expect(patched.parse({ withDefault: 'sent' })).toEqual({ withDefault: 'sent' });
  });

  it('keeps the inner rule the default was wrapping', () => {
    expect(patched.safeParse({ withDefault: 7 }).success).toBe(false);
    expect(patched.safeParse({ nullableWithDefault: null }).success).toBe(true);
    expect(patched.safeParse({ plain: 'not a number' }).success).toBe(false);
  });

  it('leaves a field that was already optional alone', () => {
    expect(patched.parse({ alreadyOptional: true })).toEqual({ alreadyOptional: true });
  });

  it('typechecks the output rather than widening it to unknown', () => {
    const out = patched.parse({ withDefault: 'sent', plain: 2 });
    // This line does not compile if the mapped type was lost — the route
    // would then be writing `unknown` into every column.
    const typed: { withDefault?: string; plain?: number } = out;
    expect(typed.withDefault).toBe('sent');
  });
});

/**
 * ONE IMPLEMENTATION, NOT FOUR.
 *
 * Four copies of this fix is the same defect in a different coat: the fifth
 * door written next year would inherit none of them. So no schema file may
 * define its own, and none may go back to `.partial()` on a create schema.
 */
describe('the helper exists once', () => {
  const owners = [
    'src/lib/offers.ts',
    'src/lib/campaigns.ts',
    'src/lib/store-pages.ts',
    'src/lib/store-redirects.ts',
  ];

  it.each(owners)('%s imports it and defines no copy', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    expect(src).toContain("from './zod-patch'");
    expect(/function\s+omittedMeansOmitted/.test(src), rel).toBe(false);
    expect(/function\s+sentOrAbsent/.test(src), rel).toBe(false);
  });

  it.each(owners)('%s turns no create schema into a patch schema with .partial()', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    // Code only: the comments in these files quote the broken expression on
    // purpose, to say what was measured.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    expect(/(?:CreateSchema|InputSchema|Fields)[^\n]*\.partial\(\)/.test(code), rel).toBe(false);
  });
});
