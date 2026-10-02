/**
 * DOES POSTGRES ACTUALLY DO WHAT `landing-draft.ts` CLAIMS?
 *
 * A real page, a real draft, a real publish, a real revert — then deleted.
 * It exists because the unit suite beside that module can only check the
 * SHAPE of each statement, and two of the things the module depends on are
 * database behaviour that no mock can confirm:
 *
 *   · `jsonb || jsonb` merges with the RIGHT side winning, so a partial save
 *     overlays the draft instead of replacing it.
 *   · every SET expression sees the OLD row, which is what lets promote and
 *     revert each be ONE statement — and a single statement is the only
 *     version of either that two presses a second apart cannot corrupt.
 *
 * A mutation run proved the difference: «the merge lets the OLD value win»
 * and «the step back is a one-way door» are invisible to the unit tests and
 * fail here in one line.
 *
 * IT IS FOR A DEVELOPMENT DATABASE. It creates and deletes a landing page,
 * so it refuses anything whose DATABASE_URL is not local.
 *
 *   npx tsx scripts/verify-landing-draft.ts
 */
import { PrismaClient } from '@prisma/client';
import { draftState, publishContent, revertContent, saveContent } from '../src/lib/landing-draft';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  throw new Error('هذا الفحص للتطوير فقط — DATABASE_URL ليست محليّة.');
}

const db = new PrismaClient();
const ok: string[] = [];
const bad: string[] = [];
const check = (name: string, pass: boolean, got?: unknown) =>
  pass ? ok.push(name) : bad.push(`${name} — got ${JSON.stringify(got)}`);

async function main() {
  const company = await db.company.findFirst({ select: { id: true } });
  const store = await db.store.findFirst({ select: { id: true } });
  if (!company) throw new Error('no company in this database');

  const live = async (id: string) =>
    db.landingPage.findUniqueOrThrow({
      where: { id },
      select: { htmlContent: true, sections: true, theme: true, cssContent: true },
    });

  const lp = await db.landingPage.create({
    data: {
      companyId: company.id,
      storeId: store?.id ?? null,
      name: 'ROUNDTRIP — delete me',
      slug: `roundtrip-${Date.now().toString(36)}`,
      htmlContent: 'LIVE-HTML',
      sections: 'LIVE-SECTIONS',
      theme: 'LIVE-THEME',
      isPublished: true,
    },
  });

  try {
    // ── a partial save on a live page touches no live column ──
    await saveContent(lp.id, { sections: 'DRAFT-SECTIONS' }, true);
    check('live columns untouched by a draft save', (await live(lp.id)).sections === 'LIVE-SECTIONS');
    let st = await draftState(lp.id);
    check('the draft holds the new sections', st.draft?.sections === 'DRAFT-SECTIONS', st.draft?.sections);
    // THE MERGE: the five fields it did not send came from the live row.
    check('and the untouched fields came from the live row', st.draft?.htmlContent === 'LIVE-HTML', st.draft?.htmlContent);
    check('hasUnpublished', st.hasUnpublished === true);

    // ── a second partial save merges into the draft, not over it ──
    await saveContent(lp.id, { theme: 'DRAFT-THEME' }, true);
    st = await draftState(lp.id);
    check('the second save kept the first', st.draft?.sections === 'DRAFT-SECTIONS', st.draft?.sections);
    check('and added its own', st.draft?.theme === 'DRAFT-THEME', st.draft?.theme);

    // ── publish: draft → live, live → previous, in one statement ──
    await publishContent(lp.id);
    let row = await live(lp.id);
    check('publish moved the sections live', row.sections === 'DRAFT-SECTIONS', row.sections);
    check('publish moved the theme live', row.theme === 'DRAFT-THEME', row.theme);
    check('publish kept the untouched html', row.htmlContent === 'LIVE-HTML', row.htmlContent);
    st = await draftState(lp.id);
    check('the draft is gone', st.hasUnpublished === false);
    check('and there is a step back', st.canRevert === true);
    check('publishedAt stamped', st.publishedAt instanceof Date);

    // ── revert: the OLD row inside one statement ──
    check('revert reported a step taken', (await revertContent(lp.id)) === true);
    row = await live(lp.id);
    check('revert restored the previous sections', row.sections === 'LIVE-SECTIONS', row.sections);
    check('revert restored the previous theme', row.theme === 'LIVE-THEME', row.theme);
    st = await draftState(lp.id);
    check('revert can be undone', st.canRevert === true);
    check('revert cleared the draft', st.hasUnpublished === false);

    // ── press it again: back where we were ──
    await revertContent(lp.id);
    row = await live(lp.id);
    check('pressing again returns', row.sections === 'DRAFT-SECTIONS', row.sections);

    // ── an unpublished page writes straight through ──
    await db.landingPage.update({ where: { id: lp.id }, data: { isPublished: false } });
    await saveContent(lp.id, { htmlContent: 'DIRECT' }, false);
    check('an unpublished page writes live', (await live(lp.id)).htmlContent === 'DIRECT');
    check('and keeps no draft', (await draftState(lp.id)).hasUnpublished === false);

    // ── no step back on a fresh page ──
    const fresh = await db.landingPage.create({
      data: { companyId: company.id, storeId: store?.id ?? null, name: 'ROUNDTRIP2', slug: `rt2-${Date.now().toString(36)}` },
    });
    check('a fresh page has no step back', (await revertContent(fresh.id)) === false);
    await db.landingPage.delete({ where: { id: fresh.id } });
  } finally {
    await db.landingPage.delete({ where: { id: lp.id } });
    await db.$disconnect();
  }

  console.log(`PASS ${ok.length}`);
  for (const b of bad) console.log('FAIL ' + b);
  process.exit(bad.length ? 1 : 0);

}

main();