import { db } from './db';

/**
 * THE PAGE AS THE SELLER IS EDITING IT, AND ONE STEP BACK.
 *
 * «حفظ كمسودة؛ النشر بتأكيد؛ الرجوع للنسخة السابقة بضغطة.»
 *
 * A landing page held ONE copy of its content, so the editor's save wrote
 * what visitors were reading: pressing «حفظ كمسودة» on a published page put
 * a half-written headline in front of every click the advert was paying
 * for. The word on the button was not true.
 *
 * SO THE SIX FIELDS MOVE TOGETHER OR NOT AT ALL. `contentDraft` is one JSON
 * blob because the editor saves html, css, settings, builderMode, theme and
 * sections in a single act and publishing promotes that single act. Six
 * draft columns would be six ways for half an act to reach a visitor — a
 * new theme live against the old sections.
 *
 * AND EVERY MOVE IS ONE STATEMENT.
 *
 * Promote and revert both read the row and write the row. Done as a read
 * then a write, two presses a second apart interleave and the loser's
 * «previous» is the winner's draft — a revert that goes somewhere neither
 * press asked for. Postgres evaluates every SET expression against the OLD
 * row, which is exactly what both of these need, so each is a single
 * UPDATE and the database does the holding.
 *
 * RAW SQL, AND WHY. These three columns exist in the database and in
 * `schema.prisma`, but the generated client on this machine does not know
 * them yet: `prisma generate` fails with EPERM while the dev server holds
 * the query-engine DLL. Raw statements need no generated types, the
 * migration is real, and the day `generate` runs nothing here has to
 * change.
 */

/** Everything a visitor reads, and the exact set the editor saves at once. */
export interface PageContent {
  htmlContent: string | null;
  cssContent: string | null;
  pageSettings: string | null;
  builderMode: string | null;
  theme: string | null;
  sections: string | null;
}

export const CONTENT_FIELDS = [
  'htmlContent',
  'cssContent',
  'pageSettings',
  'builderMode',
  'theme',
  'sections',
] as const;

/** The live columns as one object — the shape both blobs hold. */
const liveAsJsonb = `jsonb_build_object(${CONTENT_FIELDS.map((f) => `'${f}', "${f}"`).join(', ')})`;

/** `col = <from that blob>`, or the live value when the blob is null. */
const takeFrom = (blob: 'contentDraft' | 'contentPrevious') =>
  CONTENT_FIELDS.map(
    (f) => `"${f}" = CASE WHEN "${blob}" IS NULL THEN "${f}" ELSE "${blob}"::json->>'${f}' END`
  ).join(', ');

/**
 * The fields a draft actually carries — PARTIAL, and that is load-bearing.
 *
 * A field the blob does not mention must leave the live value alone. Filling
 * it with null instead blanked `builderMode` on a draft that only touched the
 * sections, and a page whose `builderMode` is null reads as an HTML page — so
 * the preview rendered an empty document and the blocks were simply gone.
 *
 * `null` is still a value: a seller who cleared the custom CSS wrote null
 * into the blob, and that must reach the page. So the distinction is between
 * ABSENT and null, which is why this is a key-by-key copy rather than a cast.
 */
export type DraftContent = Partial<PageContent>;

export interface DraftState {
  /** The unpublished edits, or null when there are none. */
  draft: DraftContent | null;
  /** Whether one press would put something different in front of visitors. */
  hasUnpublished: boolean;
  /** Whether there is a step back to take. */
  canRevert: boolean;
  publishedAt: Date | null;
}

function parse(blob: unknown): DraftContent | null {
  if (typeof blob !== 'string' || !blob) return null;
  try {
    const o = JSON.parse(blob) as Record<string, unknown>;
    const out: DraftContent = {};
    for (const f of CONTENT_FIELDS) {
      // ABSENT is not null. See `DraftContent`.
      if (!(f in o)) continue;
      out[f] = typeof o[f] === 'string' ? (o[f] as string) : null;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    // A blob nobody can parse is a blob nobody should be shown. Saying
    // «no draft» loses the edits; pretending it parsed would put fragments
    // of one live. The editor then shows the live page, which is true.
    return null;
  }
}

/** What the editor needs to know about this page beyond its live content. */
export async function draftState(id: string): Promise<DraftState> {
  const rows = await db.$queryRawUnsafe<
    { contentDraft: string | null; contentPrevious: string | null; contentPublishedAt: Date | null }[]
  >(
    `SELECT "contentDraft", "contentPrevious", "contentPublishedAt" FROM "landing_pages" WHERE "id" = $1`,
    id
  );
  const row = rows[0];
  if (!row) return { draft: null, hasUnpublished: false, canRevert: false, publishedAt: null };
  return {
    draft: parse(row.contentDraft),
    // The column, not the parsed blob: an unparseable draft is still an
    // unpublished edit sitting there, and saying otherwise would make
    // «نشر» look like it had nothing to do.
    hasUnpublished: Boolean(row.contentDraft),
    canRevert: Boolean(row.contentPrevious),
    publishedAt: row.contentPublishedAt,
  };
}

/**
 * SAVE. Into the draft for a live page, straight through for one that is not.
 *
 * An unpublished page has no audience to protect, and routing its saves
 * through a draft would mean the preview, the duplicate and the store's own
 * front page each had to learn where to look. Nothing reads the draft except
 * the editor and the publish.
 *
 * THE PATCH IS PARTIAL, THE DRAFT IS WHOLE. The editor saves the fields it
 * changed, and a blob written from a patch alone would blank the five it did
 * not send — the next publish would put a page live with no sections. So the
 * patch is MERGED, and merged inside one statement (`jsonb || jsonb`, right
 * side winning) over the draft that exists or the live row when none does.
 * Done as read-then-write, two saves a keystroke apart lose one of them.
 */
export async function saveContent(
  id: string,
  patch: Partial<PageContent>,
  isPublished: boolean
): Promise<void> {
  const fields = CONTENT_FIELDS.filter((f) => patch[f] !== undefined);
  if (fields.length === 0) return;

  if (!isPublished) {
    await db.$executeRawUnsafe(
      `UPDATE "landing_pages" SET ${fields.map((f, i) => `"${f}" = $${i + 2}`).join(', ')}, "contentDraft" = NULL WHERE "id" = $1`,
      id,
      ...fields.map((f) => patch[f] ?? null)
    );
    return;
  }
  await db.$executeRawUnsafe(
    `UPDATE "landing_pages"
        SET "contentDraft" = (COALESCE("contentDraft"::jsonb, ${liveAsJsonb}) || $2::jsonb)::text
      WHERE "id" = $1`,
    id,
    JSON.stringify(Object.fromEntries(fields.map((f) => [f, patch[f] ?? null])))
  );
}

/**
 * PUBLISH. The draft becomes what visitors read; what they were reading
 * becomes the one step back.
 *
 * It runs for a page with no draft too, and sets `contentPublishedAt`
 * without disturbing the step back — publishing a page nobody has edited
 * since the last publish should not overwrite the version a seller might
 * still want to return to with an identical copy of what is already live.
 */
export async function publishContent(id: string): Promise<void> {
  await db.$executeRawUnsafe(
    `UPDATE "landing_pages" SET
       "contentPrevious" = CASE WHEN "contentDraft" IS NULL THEN "contentPrevious" ELSE ${liveAsJsonb}::text END,
       ${takeFrom('contentDraft')},
       "contentDraft" = NULL,
       "contentPublishedAt" = NOW()
     WHERE "id" = $1`,
    id
  );
}

/**
 * ONE STEP BACK, IN ONE PRESS.
 *
 * What was live before the last publish goes live again, and the thing
 * being undone becomes the next step back — so a seller who reverts by
 * mistake presses again and is where they were. An undo that cannot be
 * undone is a trap wearing the word.
 *
 * AND THE DRAFT IS CLEARED. A revert that put the old page live and left
 * the regretted one sitting in the editor would publish it again the next
 * time anybody pressed «نشر».
 *
 * @returns false when there was no step to take.
 */
export async function revertContent(id: string): Promise<boolean> {
  const n = await db.$executeRawUnsafe(
    `UPDATE "landing_pages" SET
       "contentPrevious" = ${liveAsJsonb}::text,
       ${takeFrom('contentPrevious')},
       "contentDraft" = NULL,
       "contentPublishedAt" = NOW()
     WHERE "id" = $1 AND "contentPrevious" IS NOT NULL`,
    id
  );
  return n > 0;
}
