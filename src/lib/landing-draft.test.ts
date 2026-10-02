import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE DRAFT, THE PUBLISH AND THE ONE STEP BACK.
 *
 * «حفظ كمسودة؛ النشر بتأكيد؛ الرجوع للنسخة السابقة بضغطة.»
 *
 * These four functions are SQL, and SQL is the part of this codebase a unit
 * test lies about most easily: a mock that records the string proves the
 * string was built, not that Postgres does what the string says. So what is
 * asserted here is the SHAPE of each statement — one statement per act, the
 * old row read inside it, the right columns touched — and the behaviour of
 * the one pure function in the file.
 *
 * WHAT THIS CANNOT PROVE, said plainly: that `jsonb || jsonb` merges the way
 * the comments claim, and that a SET expression sees the OLD row. Both are
 * Postgres guarantees, both are relied on, and both were checked by hand
 * against the dev database when this was written.
 */

const { db } = vi.hoisted(() => ({
  db: { $executeRawUnsafe: vi.fn(), $queryRawUnsafe: vi.fn() },
}));
vi.mock('./db', () => ({ db }));

import { CONTENT_FIELDS, draftState, publishContent, revertContent, saveContent } from './landing-draft';

const lastSql = () => (db.$executeRawUnsafe.mock.calls.at(-1)![0] as string).replace(/\s+/g, ' ');

const FULL = {
  htmlContent: '<p>x</p>',
  cssContent: 'p{}',
  pageSettings: '{"width":"full"}',
  builderMode: 'BLOCKS',
  theme: '{"accent":"#000"}',
  sections: '[{"type":"hero"}]',
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$executeRawUnsafe.mockResolvedValue(1);
  db.$queryRawUnsafe.mockResolvedValue([]);
});

describe('the six fields move together', () => {
  it('and the list is the whole editable page — no seventh, no missing one', () => {
    // A field left out of this list is a field the publish would not promote:
    // a new theme live against the old sections.
    expect([...CONTENT_FIELDS].sort()).toEqual(
      ['builderMode', 'cssContent', 'htmlContent', 'pageSettings', 'sections', 'theme'].sort()
    );
  });
});

describe('saving', () => {
  it('writes the row itself when nobody is reading the page', async () => {
    await saveContent('lp1', FULL, false);
    const sql = lastSql();
    expect(sql).toContain('"htmlContent" = $2');
    expect(sql).not.toContain('"contentDraft" = (');
    // And clears any draft left over from before the page was taken down —
    // otherwise re-publishing would promote edits the editor is not showing.
    expect(sql).toContain('"contentDraft" = NULL');
  });

  it('writes the draft alone when the page is live', async () => {
    await saveContent('lp1', FULL, true);
    const sql = lastSql();
    expect(sql).toContain('"contentDraft" =');
    // NOT ONE LIVE COLUMN. This is the whole defect being fixed: the same
    // press used to put a half-written headline in front of paid clicks.
    for (const f of CONTENT_FIELDS) expect(sql).not.toContain(`"${f}" = $`);
  });

  it('merges the patch into the draft rather than replacing it', async () => {
    // The editor sends the fields it changed. A blob written from the patch
    // alone would blank the other five, and the next publish would put a
    // page live with no sections.
    await saveContent('lp1', { sections: '[]' }, true);
    const sql = lastSql();
    expect(sql).toContain('||');
    expect(sql).toContain('COALESCE("contentDraft"::jsonb');
    // The base when no draft exists is the LIVE row, so the first partial
    // save does not blank anything either.
    expect(sql).toContain('jsonb_build_object');
    expect(JSON.parse(db.$executeRawUnsafe.mock.calls.at(-1)![2] as string)).toEqual({ sections: '[]' });
  });

  it('and does it in ONE statement, so two saves cannot lose one another', async () => {
    await saveContent('lp1', { sections: '[]' }, true);
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('sends only the fields it was given, and nulls the ones set to null', async () => {
    await saveContent('lp1', { cssContent: null }, false);
    expect(lastSql()).toContain('"cssContent" = $2');
    expect(db.$executeRawUnsafe.mock.calls.at(-1)![2]).toBeNull();
  });

  it('writes nothing at all for an empty patch', async () => {
    await saveContent('lp1', {}, true);
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe('publishing', () => {
  it('moves every field from the draft and keeps what was live as the step back', async () => {
    await publishContent('lp1');
    const sql = lastSql();
    for (const f of CONTENT_FIELDS) {
      expect(sql, f).toContain(`"${f}" = CASE WHEN "contentDraft" IS NULL THEN "${f}" ELSE "contentDraft"::json->>'${f}' END`);
      expect(sql, f).toContain(`'${f}', "${f}"`);
    }
    expect(sql).toContain('"contentDraft" = NULL');
    expect(sql).toContain('"contentPublishedAt" = NOW()');
  });

  it('leaves the step back alone when there was no draft to promote', async () => {
    // Publishing a page nobody has edited since the last publish must not
    // overwrite the version a seller may still want to return to with a copy
    // of what is already live.
    await publishContent('lp1');
    expect(lastSql()).toContain('"contentPrevious" = CASE WHEN "contentDraft" IS NULL THEN "contentPrevious"');
  });

  it('in one statement', async () => {
    await publishContent('lp1');
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});

describe('one step back', () => {
  it('restores the previous version and makes the withdrawn one the next step', async () => {
    await revertContent('lp1');
    const sql = lastSql();
    for (const f of CONTENT_FIELDS) {
      expect(sql, f).toContain(`"${f}" = CASE WHEN "contentPrevious" IS NULL THEN "${f}" ELSE "contentPrevious"::json->>'${f}' END`);
    }
    // An undo that cannot be undone is a trap wearing the word.
    expect(sql).toContain('"contentPrevious" = jsonb_build_object');
  });

  it('clears the draft, or the regretted version publishes itself again', async () => {
    await revertContent('lp1');
    expect(lastSql()).toContain('"contentDraft" = NULL');
  });

  it('refuses when there is no step to take, instead of writing nulls over the page', async () => {
    // Without the WHERE clause, every field would be set from a null blob —
    // which the CASE turns into a no-op, but the row would still be stamped
    // as freshly published and `contentPrevious` overwritten with the live
    // copy. The guard is in the statement, so the answer is the row count.
    await revertContent('lp1');
    expect(lastSql()).toContain('AND "contentPrevious" IS NOT NULL');

    db.$executeRawUnsafe.mockResolvedValue(0);
    expect(await revertContent('lp1')).toBe(false);
  });

  it('in one statement', async () => {
    await revertContent('lp1');
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});

describe('what the editor is told', () => {
  const row = (over: Record<string, unknown> = {}) =>
    db.$queryRawUnsafe.mockResolvedValue([
      { contentDraft: null, contentPrevious: null, contentPublishedAt: null, ...over },
    ]);

  it('no draft, no step back, on a page nobody has published', async () => {
    row();
    expect(await draftState('lp1')).toEqual({
      draft: null,
      hasUnpublished: false,
      canRevert: false,
      publishedAt: null,
    });
  });

  it('the draft’s own fields, parsed — and ONLY the ones it carries', async () => {
    row({ contentDraft: JSON.stringify({ sections: '[]', theme: null }) });
    const state = await draftState('lp1');
    expect(state.draft!.sections).toBe('[]');
    // An explicit null IS a value: a seller who cleared the custom CSS wrote
    // one, and it has to reach the page.
    expect(state.draft!.theme).toBeNull();

    /*
     * AND THE FOUR IT DOES NOT MENTION ARE ABSENT, NOT NULL.
     *
     * This assertion used to demand the opposite — every field present, «so
     * the overlay cannot leave undefined holes» — and that was backwards.
     * The overlay is a spread over the LIVE row, so a null for a field the
     * draft never touched blanks a live value: a draft that changed only the
     * sections set `builderMode` to null, a page with a null `builderMode`
     * reads as an HTML page, and the preview rendered an empty document with
     * the blocks gone. Found by the preview test, not by this one.
     */
    expect(Object.keys(state.draft!).sort()).toEqual(['sections', 'theme']);
    expect('builderMode' in state.draft!).toBe(false);
    expect(state.hasUnpublished).toBe(true);
  });

  it('and a blob of keys this page knows nothing about overlays nothing', async () => {
    row({ contentDraft: JSON.stringify({ somethingElse: 'x' }) });
    const state = await draftState('lp1');
    expect(state.draft).toBeNull();
    // Still an unpublished edit, though — the column holds something.
    expect(state.hasUnpublished).toBe(true);
  });

  it('an unparseable draft is still an unpublished edit', async () => {
    // Saying «no draft» would make «نشر التعديلات» disappear while the column
    // still holds something the publish would promote.
    row({ contentDraft: 'not json' });
    const state = await draftState('lp1');
    expect(state.draft).toBeNull();
    expect(state.hasUnpublished).toBe(true);
  });

  it('a step back exists only once a publish has replaced something', async () => {
    row({ contentPrevious: JSON.stringify(FULL) });
    expect((await draftState('lp1')).canRevert).toBe(true);
  });

  it('and a page that is not there answers without throwing', async () => {
    db.$queryRawUnsafe.mockResolvedValue([]);
    expect((await draftState('nope')).hasUnpublished).toBe(false);
  });
});
