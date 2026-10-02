import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE WORDS A SELLER WRITES WHILE CREATING A PAGE REACH THE PAGE.
 *
 * «إنشاء صفحة: اختيار المنتج ← اختيار البنية ← اختيار المظهر ← تعبئة خانات
 * النص.» The fourth step existed as a form and its answers were thrown
 * away: the route built the sections from an EMPTY copy map, so a seller
 * who filled six fields opened the editor onto six empty blocks and wrote
 * them again. Everything below is about that one sentence arriving.
 *
 * AND ABOUT THE TWO REFUSALS AROUND IT. Copy with no structure to land in
 * is refused rather than dropped — the fifteen ready-made shapes have no
 * slots, and a page the seller believes they wrote and then finds empty is
 * worse than an error. An unknown STRUCTURE is refused too, which the
 * route already did and this file holds in place.
 */

const { db } = vi.hoisted(() => ({
  db: {
    landingPage: { findFirst: vi.fn(), create: vi.fn() },
    product: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({
  requireContext: async () => ({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' }),
}));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));
vi.mock('@/lib/store-redirects', () => ({ standDownRedirectsTo: vi.fn() }));

import { POST } from './route';
import { STRUCTURE_PROBLEM_SOLUTION } from '@/lib/landing-structures';

const create = (body: Record<string, unknown>) =>
  POST(
    new Request('http://localhost/api/landing-pages', {
      method: 'POST',
      body: JSON.stringify({ name: 'صفحة', slug: 'page-1', ...body }),
    })
  );

/** The sections the route would have written, parsed back out. */
const sectionsWritten = (): Record<string, unknown>[] =>
  JSON.parse(db.landingPage.create.mock.calls[0][0].data.sections);
const themeWritten = (): Record<string, unknown> =>
  JSON.parse(db.landingPage.create.mock.calls[0][0].data.theme);

const HERO = STRUCTURE_PROBLEM_SOLUTION.slots.find((s) => s.key === 'heroTitle')!;

beforeEach(() => {
  vi.clearAllMocks();
  db.landingPage.findFirst.mockResolvedValue(null); // the slug is free
  db.landingPage.create.mockImplementation(async ({ data }: { data: { slug: string } }) => ({
    id: 'lp1',
    slug: data.slug,
  }));
});

describe('a page created from a structure', () => {
  it('carries the headline the seller typed', async () => {
    const res = await create({
      structure: 'problem-solution',
      dialect: 'levantine',
      copy: { heroTitle: { levantine: 'تعبان من وجع ضهرك؟' } },
    });

    expect(res.status).toBe(201);
    expect(sectionsWritten()[HERO.at][HERO.field]).toBe('تعبان من وجع ضهرك؟');
  });

  it('and the prose beats, each in the block its slot names', async () => {
    const why = STRUCTURE_PROBLEM_SOLUTION.slots.find((s) => s.key === 'whyItHurts')!;
    const failed = STRUCTURE_PROBLEM_SOLUTION.slots.find((s) => s.key === 'whatFailed')!;
    // The two land in DIFFERENT blocks although both are `body` on a `text`
    // section: which paragraph is «المحاولات الفاشلة» is the structure.
    expect(why.at).not.toBe(failed.at);

    await create({
      structure: 'problem-solution',
      dialect: 'levantine',
      copy: { whyItHurts: { levantine: 'بتقوم تعبان' }, whatFailed: { levantine: 'جرّبت المسكّنات' } },
    });

    const page = sectionsWritten();
    expect(page[why.at][why.field]).toBe('بتقوم تعبان');
    expect(page[failed.at][failed.field]).toBe('جرّبت المسكّنات');
  });

  it('cuts copy longer than the slot allows rather than dropping it', async () => {
    // Half a sentence is a bug somebody notices; an empty hero is one they
    // do not. The dialog says the same thing before the save.
    const tooLong = 'ن'.repeat(HERO.max + 25);
    await create({ structure: 'problem-solution', dialect: 'msa', copy: { heroTitle: { msa: tooLong } } });

    const written = sectionsWritten()[HERO.at][HERO.field] as string;
    expect([...written]).toHaveLength(HERO.max);
  });

  it('ignores a slot key the structure does not have, and keeps the ones it does', async () => {
    await create({
      structure: 'problem-solution',
      dialect: 'msa',
      copy: { heroTitle: { msa: 'عنوان' }, notASlotHere: { msa: 'نصّ غريب' } },
    });

    const page = sectionsWritten();
    expect(page[HERO.at][HERO.field]).toBe('عنوان');
    expect(JSON.stringify(page)).not.toContain('نصّ غريب');
  });

  it('starts as the story outline when nothing was written', async () => {
    await create({ structure: 'problem-solution' });

    const page = sectionsWritten();
    // The shape is there in full — the sequence, not a blank canvas.
    expect(page).toHaveLength(STRUCTURE_PROBLEM_SOLUTION.sequence.length);
    expect(page.map((s) => s.type)).toEqual([...STRUCTURE_PROBLEM_SOLUTION.sequence]);
  });

  it('reads the formal line when no dialect was named', async () => {
    // «ما لا تكتبه بلهجة يظهر بالفصحى المبسّطة» — so with two dialects
    // written and none requested, the formal one is what the page gets.
    await create({
      structure: 'problem-solution',
      copy: { heroTitle: { msa: 'بالفصحى', levantine: 'بالشامي' } },
    });
    expect(sectionsWritten()[HERO.at][HERO.field]).toBe('بالفصحى');
  });

  it('refuses an unknown structure instead of substituting another story', async () => {
    const res = await create({ structure: 'no-such-structure', copy: { heroTitle: { msa: 'ع' } } });
    expect(res.status).toBe(404);
    expect(db.landingPage.create).not.toHaveBeenCalled();
  });

  it('refuses a slot longer than any slot is allowed to be', async () => {
    // 600 is the largest `max` the contract permits a slot to declare, so
    // anything past it is not copy for a slot that exists.
    const res = await create({
      structure: 'problem-solution',
      copy: { heroTitle: { msa: 'ن'.repeat(601) } },
    });
    expect(res.status).toBe(400);
    expect(db.landingPage.create).not.toHaveBeenCalled();
  });
});

describe('the skin paints and nothing else', () => {
  it('leaves the sections identical to the bare structure', async () => {
    await create({ structure: 'problem-solution', dialect: 'msa', copy: { heroTitle: { msa: 'ع' } } });
    const bare = sectionsWritten();

    vi.clearAllMocks();
    db.landingPage.findFirst.mockResolvedValue(null);
    db.landingPage.create.mockResolvedValue({ id: 'lp2', slug: 'page-1' });
    await create({
      structure: 'problem-solution',
      skin: 'heritage',
      dialect: 'msa',
      copy: { heroTitle: { msa: 'ع' } },
    });
    const dressed = sectionsWritten();

    // Ids are random per section, so the comparison is of everything else —
    // which is what «بنية × مظهر» claims: the skin changed no beat and no
    // word.
    const strip = (page: Record<string, unknown>[]) =>
      page.map(({ id, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(strip(dressed)).toEqual(strip(bare));
    expect(themeWritten().accent).toBeTruthy();
  });

  it('refuses an unknown skin', async () => {
    const res = await create({ structure: 'problem-solution', skin: 'no-such-skin' });
    expect(res.status).toBe(404);
    expect(db.landingPage.create).not.toHaveBeenCalled();
  });
});

describe('copy with nowhere to land', () => {
  it('is refused when a ready-made shape was chosen instead of a structure', async () => {
    const res = await create({ template: 'classic', copy: { heroTitle: { msa: 'عنوان' } } });
    expect(res.status).toBe(400);
    expect(db.landingPage.create).not.toHaveBeenCalled();
  });

  it('but an empty copy map with a ready-made shape is not an error', async () => {
    const res = await create({ template: 'classic', copy: {} });
    expect(res.status).toBe(201);
  });
});
