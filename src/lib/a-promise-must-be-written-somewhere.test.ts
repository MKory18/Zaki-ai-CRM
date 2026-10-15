import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments } from './guard-source';
import {
  ANSWER_MAX,
  BUILD_FIELDS,
  BUILD_QUESTIONS,
  MAX_PROMISES,
  SOURCE_LABEL,
  answersRefusal,
  buildNoteAr,
  buildPageBrief,
  foldForMatch,
  isHealthClaim,
  productPageText,
  readBuildAnswer,
  writtenIn,
  writtenValue,
  type WrittenSpecs,
} from './landing-build';
import { modelReadsImages, visionReasonAr } from './ai-vision';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «الوعد لازم يكون مكتوباً بمكان — وإلا فهو اقتراح.»
 *
 * This is the acceptance test the owner wrote for «ابنيلي صفحة الهبوط»
 * (`S3-BUILD-MY-LANDING-PAGE.md` §٧): with a FAKE model, a promise present
 * in NEITHER the product page NOR the box text must come out as «اقتراح» —
 * not as a promise.
 *
 * It is the whole feature in one sentence, and the reason the model is made
 * to return the box text VERBATIM (§٢): without that text there is no way
 * to tell a promise READ off a box from one INVENTED about it, and the rule
 * becomes a comment. So the text is evidence, and every «من العلبة» below
 * is checked against it.
 *
 * Driven twice on purpose:
 *
 *   PART A — the reader, on its own, with answers a real model really gives:
 *   a promise the seller wrote, a promise on the box, a promise out of thin
 *   air, a size that contradicts the field, and a health claim.
 *
 *   PART B — THE DOOR, with `fetch` replaced and a fake model's JSON coming
 *   back through it. A pure function can be correct while the route that
 *   calls it drops half the reading on the floor; the §٧ claim is about what
 *   the OWNER sees, so the owner's own path is driven.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** A product page as this system holds one: name, Latin name, specs. */
const SPECS: WrittenSpecs = {
  name: 'قناع الأرز',
  nameLatin: 'ARMOR',
  description: 'قناع شعر بخلاصة الأرز، بيقوّي الشعر وبيمنع التقصّف.',
  category: 'العناية بالشعر',
  attributes: { ml: '150 مل', made: 'الأردن', ingredients: 'خلاصة أرز، جلسرين' },
};

/** The text the fake model «read» off the box. Evidence, not decoration. */
const BOX = 'قناع الأرز — ARMOR · بخلاصة الأرز · تغذية ولمعان · 150 مل · صُنع في الأردن';

describe('Ⅰ · the fold both sides of every comparison go through', () => {
  it('folds Arabic-Indic digits, so «١٥٠ مل» and «150 مل» are one bottle', () => {
    expect(foldForMatch('١٥٠ مل')).toBe(foldForMatch('150 مل'));
    expect(foldForMatch('(150 مل.)')).toBe(foldForMatch('150 مل'));
    // The conflict check ignores the space too — «150مل» is the same size.
    expect(foldForMatch('150مل').replace(/ /g, '')).toBe(foldForMatch('150 مل').replace(/ /g, ''));
  });

  it('and «الأرز» written four ways as one word', () => {
    expect(foldForMatch('خلاصة الأرز')).toBe(foldForMatch('خلاصه الارز'));
  });

  it('and a phrase is «written in» a text when the words are there, in order', () => {
    expect(writtenIn('تقوية الشعر', 'بيقوّي الشعر')).toBe(false); // «تقوية» ليست «بيقوّي»
    expect(writtenIn('تغذية ولمعان', BOX)).toBe(true);
    expect(writtenIn('خلاصة الأرز', BOX)).toBe(true);
    // الكلمات موجودة بترتيبٍ معكوس — وهذا ليس نفس الجملة
    expect(writtenIn('الأرز خلاصة بالترتيب المعكوس', BOX)).toBe(false);
  });

  it('and an empty phrase is written nowhere — otherwise everything is «من العلبة»', () => {
    expect(writtenIn('', BOX)).toBe(false);
    expect(writtenIn('١ · ٢ · ٣', BOX)).toBe(false);
    expect(writtenIn('تغذية', '')).toBe(false);
  });

  it('and the health vocabulary is the one this product already forbids', () => {
    for (const claim of ['يشفي القشرة', 'يعالج تساقط الشعر', 'مضاد حيوي طبيعي', 'يقضي على المرض']) {
      expect(isHealthClaim(claim), `«${claim}» ما انحسب ادّعاءً صحّيّاً`).toBe(true);
    }
    for (const fine of ['تغذية ولمعان', 'بيقوّي الشعر', 'ريحته حلوة']) {
      expect(isHealthClaim(fine), `«${fine}» انحسب ادّعاءً صحّيّاً بالخطأ`).toBe(false);
    }
  });
});

describe('Ⅱ · the brief: the two sources, the seven rules, and the verbatim text', () => {
  const brief = buildPageBrief({ specs: SPECS, hasImage: true });

  it('carries every written spec, so the model has no reason to invent one', () => {
    for (const written of ['قناع الأرز', 'ARMOR', '150 مل', 'الأردن', 'خلاصة أرز، جلسرين', 'العناية بالشعر']) {
      expect(brief, `«${written}» غائب عن البريف`).toContain(written);
    }
  });

  it('and asks for every field by the key the reader looks for', () => {
    for (const field of BUILD_FIELDS) expect(brief).toContain(`"${field.key}"`);
    expect(brief).toContain('"promises"');
    expect(brief).toContain('"packageText"');
  });

  it('and states the four rules the whole feature rests on', () => {
    expect(brief, '«المكتوب يغلب» غائبة').toContain('المكتوب بالمواصفات يغلب');
    expect(brief, 'التعارض صار اختياراً صامتاً').toContain('ولا تختر بنفسك');
    expect(brief, 'الوعد بلا مصدر صار مسموحاً').toContain('لا تكتب وعداً إلا');
    expect(brief, 'النصّ الخامّ لم يُطلب — فلا دليل على أيّ وعد').toContain('حرفيّاً كما هو');
  });

  it('and forbids a colour outright — «الألوان بالكود، مش بالموديل»', () => {
    expect(brief).toContain('لا لون ولا خطّ');
    expect(brief).toContain('بالكود');
  });

  it('and forbids a number of its own and any health claim', () => {
    expect(brief).toContain('لا رقم من عندك');
    expect(brief).toContain('ممنوع ادّعاء صحّي');
  });

  it('and with no image it says so and asks for an EMPTY box text', () => {
    const blind = buildPageBrief({ specs: SPECS, hasImage: false });
    expect(blind).toContain('لا صورة معك');
    expect(blind).toContain('packageText فارغاً');
    expect(blind).toContain('ولا تتخيّل علبة');
  });

  it('and the owner’s answers reach it under his own question’s words', () => {
    const asked = buildPageBrief({
      specs: SPECS,
      hasImage: true,
      answers: { buyer: 'شباب بيستعملوا السيشوار', problem: 'الشعر بيتقصّف' },
    });
    expect(asked).toContain('كلام المالك');
    expect(asked).toContain(BUILD_QUESTIONS[0].label);
    expect(asked).toContain('شباب بيستعملوا السيشوار');
  });

  it('and the brief builder never asks the model for a colour key', () => {
    const src = stripComments(readFileSync('src/lib/landing-build.ts', 'utf8'));
    const body = src.slice(src.indexOf('export function buildPageBrief'), src.indexOf('export type BuildSource'));
    expect(body, 'البريف صار يَطلبُ لوناً').not.toMatch(/accent|"color"|palette/i);
  });
});

describe('Ⅲ · the owner’s answers carry no number, and the refusal says why', () => {
  it('refuses a phone pasted into an answer rather than stripping it quietly', () => {
    const refusal = answersRefusal({ buyer: 'اتصل على 0799123456 واسأل' });
    expect(refusal, 'رقمٌ طويلٌ مرّ إلى نموذج').toBeTruthy();
    expect(refusal).toContain('ولا رقم زبون');
    expect(refusal).toContain(BUILD_QUESTIONS[0].label);
  });

  it('and reads a spaced number as one number — «0799 123 456» is a phone', () => {
    expect(answersRefusal({ problem: 'رقمي 0799 123 456' })).toBeTruthy();
  });

  it('and lets a size, a price and a quantity through — they are not people', () => {
    expect(answersRefusal({ problem: '150 مل بتكفي 3 أسابيع، سعرها 15' })).toBeNull();
    expect(answersRefusal({})).toBeNull();
  });

  it('and refuses an answer longer than the box allows, by name', () => {
    const refusal = answersRefusal({ different: 'ا'.repeat(ANSWER_MAX + 1) });
    expect(refusal).toContain(String(ANSWER_MAX));
  });
});

describe('Ⅳ · the reader — provenance, conflicts, and the refusal', () => {
  /** What a well-behaved model returns about this product. */
  const answer = {
    nameAr: 'قناع الأرز',
    nameLatin: 'ARMOR',
    tagline: 'درعك ضد الحرارة',
    size: '150 مل',
    ingredients: 'خلاصة أرز، جلسرين',
    madeIn: 'الأردن',
    category: 'العناية بالشعر',
    promises: ['بيمنع التقصّف', 'تغذية ولمعان'],
    packageText: BOX,
  };

  it('the written spec is the value, and it is labelled «من صفحة المنتج»', () => {
    const reading = readBuildAnswer(answer, SPECS);
    const size = reading.fields.find((f) => f.key === 'size')!;
    expect(size.value).toBe('150 مل');
    expect(size.source).toBe('product');
    expect(SOURCE_LABEL[size.source]).toBe('من صفحة المنتج');
  });

  it('and a field nothing answers in the system comes from the box, when the box says it', () => {
    const reading = readBuildAnswer({ ...answer, tagline: 'تغذية ولمعان' }, SPECS);
    const tagline = reading.fields.find((f) => f.key === 'tagline')!;
    expect(tagline.source).toBe('package');
  });

  it('and the same field is only an «اقتراح» when the box does not say it', () => {
    const reading = readBuildAnswer(answer, SPECS);
    expect(reading.fields.find((f) => f.key === 'tagline')!.source).toBe('suggestion');
  });

  it('② a conflict raises a NOTICE and the written spec still wins — never a silent choice', () => {
    const reading = readBuildAnswer({ ...answer, size: '50 مل' }, SPECS);
    expect(reading.notices).toHaveLength(1);
    expect(reading.notices[0].written).toBe('150 مل');
    expect(reading.notices[0].read).toBe('50 مل');
    expect(reading.fields.find((f) => f.key === 'size')!.value, 'الصورة غلبت المكتوب').toBe('150 مل');
    expect(buildNoteAr(reading).join(' ')).toContain('تعارض');
  });

  it('and a value that merely reads differently is not a conflict — «١٥٠ مل» is 150 ml', () => {
    const reading = readBuildAnswer({ ...answer, size: '١٥٠ مل' }, SPECS);
    expect(reading.notices, 'تنبيهٌ على فرقٍ في الرسم لا في المعنى').toEqual([]);
  });

  it('③ a promise written on the product page enters, as «من صفحة المنتج»', () => {
    const reading = readBuildAnswer(answer, SPECS);
    const p = reading.promises.find((x) => x.text === 'بيمنع التقصّف')!;
    expect(p.source).toBe('product');
    expect(p.enters).toBe(true);
  });

  it('③ a promise read off the box enters, as «من العلبة»', () => {
    const reading = readBuildAnswer(answer, SPECS);
    const p = reading.promises.find((x) => x.text === 'تغذية ولمعان')!;
    expect(p.source).toBe('package');
    expect(p.enters).toBe(true);
  });

  /**
   * ⬛ §٧ — THE ACCEPTANCE TEST ITSELF, as a pure reading.
   */
  it('③ and a promise in NEITHER source is «اقتراح» and does not enter', () => {
    const reading = readBuildAnswer(
      { ...answer, promises: ['بينبّت الشعر من جديد بأسبوعين'] },
      SPECS
    );
    const p = reading.promises[0];
    expect(p.source, 'وعدٌ مخترعٌ دخل كوعد').toBe('suggestion');
    expect(SOURCE_LABEL[p.source]).toBe('اقتراح');
    expect(p.enters, 'الاقتراح دخل الصفحة بلا موافقة').toBe(false);
    expect(buildNoteAr(reading).join(' ')).toContain('إلا بموافقتك');
  });

  it('③ and with no box text at all, nothing can be «من العلبة»', () => {
    const reading = readBuildAnswer({ ...answer, packageText: '' }, SPECS);
    expect(reading.promises.find((p) => p.text === 'تغذية ولمعان')!.source).toBe('suggestion');
    expect(buildNoteAr(reading).join(' ')).toContain('ما في نصّ علبة');
  });

  it('③ and a health claim in neither source is REFUSED, not offered for approval', () => {
    const reading = readBuildAnswer({ ...answer, promises: ['يعالج تساقط الشعر'] }, SPECS);
    const p = reading.promises[0];
    expect(p.enters).toBe(false);
    expect(p.refused, 'ادّعاءٌ صحّيٌّ صار اقتراحاً يُكبَس عليه').toBeTruthy();
    expect(buildNoteAr(reading).join(' ')).toContain('مرفوض');
  });

  it('and never more than three promises, and the extra one is named', () => {
    const reading = readBuildAnswer(
      { ...answer, promises: ['تغذية ولمعان', 'بيمنع التقصّف', 'بخلاصة الأرز', 'الرابع'] },
      SPECS
    );
    expect(reading.promises).toHaveLength(MAX_PROMISES);
    expect(reading.dropped.join(' ')).toContain('الرابع');
  });

  it('and the same promise twice is one promise', () => {
    const reading = readBuildAnswer({ ...answer, promises: ['تغذية ولمعان', 'تغذيه ولمعان'] }, SPECS);
    expect(reading.promises).toHaveLength(1);
  });

  it('and a colour the model sent is dropped and NAMED — the palette is the code’s', () => {
    const reading = readBuildAnswer({ ...answer, accent: '#b8256e', theme: 'dark' }, SPECS);
    expect(reading.dropped.join(' ')).toContain('accent');
    expect(reading.dropped.join(' ')).toContain('theme');
    expect(JSON.stringify(reading.fields), 'لونٌ من الموديل وصل الحقول').not.toContain('b8256e');
  });

  it('and the box text comes back as it was read, not tidied into a sentence', () => {
    const reading = readBuildAnswer(answer, SPECS);
    expect(reading.packageText).toBe(BOX);
  });

  it('and promises that are not a list are dropped with a reason', () => {
    const reading = readBuildAnswer({ ...answer, promises: 'تغذية ولمعان' }, SPECS);
    expect(reading.promises).toEqual([]);
    expect(reading.dropped.join(' ')).toContain('لم تَعُد قائمةً');
  });

  it('and a product with no specs at all still reads — every field becomes a suggestion or a gap', () => {
    const bare: WrittenSpecs = { name: 'منتج' };
    const reading = readBuildAnswer({ nameAr: 'منتج', packageText: '' }, bare);
    expect(reading.fields.find((f) => f.key === 'nameAr')!.source).toBe('product');
    expect(reading.missing.length).toBeGreaterThan(0);
    expect(buildNoteAr(reading).join(' ')).toContain('اكتب بنفسك');
  });

  it('and nonsense is a reading with nothing in it, not a throw', () => {
    for (const raw of [null, 7, 'لا أستطيع', [], {}]) {
      expect(() => readBuildAnswer(raw, SPECS)).not.toThrow();
    }
    expect(readBuildAnswer(null, { name: 'منتج' }).fields.map((f) => f.key)).toEqual(['nameAr']);
  });

  it('and the written lookup reads an attribute by its KEY, not by a seller’s spelling', () => {
    const size = BUILD_FIELDS.find((f) => f.key === 'size')!;
    expect(writtenValue(SPECS, size)).toBe('150 مل');
    expect(writtenValue({ name: 'x', attributes: { الحجم: '150' } }, size)).toBeNull();
  });

  it('and the product page text a promise is checked against is the whole page', () => {
    const text = productPageText(SPECS);
    for (const part of ['قناع الأرز', 'ARMOR', 'التقصّف', 'الأردن']) expect(text).toContain(part);
  });
});

describe('Ⅴ · whether the chosen model can read a box at all — and the line that says it cannot', () => {
  it('knows the models that read images', () => {
    expect(modelReadsImages('OPENAI', 'gpt-4o-2024-11-20')).toBe(true);
    expect(modelReadsImages('ANTHROPIC', 'claude-sonnet-4-5')).toBe(true);
    expect(modelReadsImages('OPENROUTER', 'qwen/qwen2.5-vl-72b-instruct')).toBe(true);
    expect(modelReadsImages('LOCAL', 'llava:13b')).toBe(true);
  });

  it('and treats one it has never met as a text model — the safe direction', () => {
    expect(modelReadsImages('LOCAL', 'phi3:mini')).toBe(false);
    expect(modelReadsImages('OPENROUTER', 'mistralai/mistral-7b-instruct')).toBe(false);
    expect(modelReadsImages('ANTHROPIC', 'claude-2.1')).toBe(false);
    expect(modelReadsImages('OPENAI', '')).toBe(false);
  });

  it('and says WHY the box was not read, in the owner’s words', () => {
    const blind = visionReasonAr({ provider: 'LOCAL', model: 'phi3:mini' }, { image: true });
    expect(blind).toContain('ما بيقرا صور');
    expect(blind, 'ما قال وين يغيّره').toContain('إعدادات الذكاء');

    const none = visionReasonAr({ provider: 'OPENAI', model: 'gpt-4o' }, { image: false });
    expect(none).toContain('ما في صورة');
  });

  it('and says nothing at all when the picture did go — a line that always shows is a line nobody reads', () => {
    expect(visionReasonAr({ provider: 'OPENAI', model: 'gpt-4o' }, { image: true })).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PART B — THE DOOR, WITH A FAKE MODEL BEHIND IT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `fetch` is replaced and the route is driven. What is being proved is not
 * that the reader works — Part A did that — but that THE OWNER'S OWN PATH
 * carries the reading to the screen: the §٧ promise comes out of the HTTP
 * body as «اقتراح», and the door writes nothing while doing it.
 *
 * The route is resolved to a LOCAL model (`provider: 'LOCAL'`) for the same
 * reason the order-intake test does: a route that resolves to nothing asks
 * no model at all, and then every assertion below would pass by accident.
 */

const { db, requireContext, requirePermission } = vi.hoisted(() => ({
  db: {
    product: { findFirst: vi.fn() },
    company: { findUnique: vi.fn() },
    systemSetting: { findUnique: vi.fn() },
    landingPage: { create: vi.fn(), update: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: () => true,
}));

const { POST } = await import('@/app/api/ai/landing-build/route');

let calledHosts: string[];
const realFetch = globalThis.fetch;

/** What the fake model answers. Set per test — it IS the test’s input. */
let modelAnswer: unknown;

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/ai/landing-build', { method: 'POST', body: JSON.stringify(body) }));

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.resetAllMocks();
  calledHosts = [];

  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'المالك', role: 'ADMIN' },
    companyId: 'c1',
    storeId: 's1',
    countryId: 'jo',
    country: { currencyCode: 'JOD', minorUnit: 3, orderPrefix: 'JO', allowNegativeStock: false },
  });
  requirePermission.mockResolvedValue(undefined);

  // A local model that reads images — so the route is live and the picture
  // half is reachable. The product below has no image, which is the case
  // every assertion here is about.
  db.company.findUnique.mockResolvedValue({ settings: null });
  db.systemSetting.findUnique.mockResolvedValue({
    value: JSON.stringify({ provider: 'LOCAL', localBaseUrl: 'http://localhost:11434', model: 'llava:13b' }),
  });

  db.product.findFirst.mockResolvedValue({
    id: PRODUCT_ID,
    name: 'قناع الأرز',
    nameEn: 'ARMOR',
    description: 'قناع شعر بخلاصة الأرز، بيقوّي الشعر وبيمنع التقصّف.',
    attributes: JSON.stringify({ ml: '150 مل', made: 'الأردن' }),
    category: {
      name: 'العناية بالشعر',
      attributeSchema: JSON.stringify([
        { key: 'ml', label: 'الحجم', kind: 'text', options: [] },
        { key: 'made', label: 'بلد الصنع', kind: 'text', options: [] },
      ]),
    },
    images: [],
  });

  modelAnswer = {};
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    calledHosts.push(String(input instanceof Request ? input.url : input));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelAnswer) } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Ⅵ · «ابنيلي صفحة الهبوط» — the door, driven', () => {
  it('asks the model that was configured — the witness that the fake is reachable', async () => {
    modelAnswer = { nameAr: 'قناع الأرز', packageText: '' };
    const res = await post({ productId: PRODUCT_ID });
    expect(res.status).toBe(200);
    expect(calledHosts).toEqual(['http://localhost:11434/v1/chat/completions']);
  });

  /**
   * ⬛ §٧ THROUGH THE DOOR: a promise in neither source comes out «اقتراح».
   */
  it('turns a promise in NEITHER source into «اقتراح» in the answer it hands the owner', async () => {
    modelAnswer = {
      nameAr: 'قناع الأرز',
      tagline: 'درعك ضد الحرارة',
      promises: ['بينبّت الشعر من جديد بأسبوعين'],
      packageText: BOX,
    };
    const body = await (await post({ productId: PRODUCT_ID })).json();

    expect(body.promises).toHaveLength(1);
    expect(body.promises[0].source, 'وعدٌ مخترعٌ وصل المالكَ كوعد').toBe('suggestion');
    expect(body.promises[0].enters).toBe(false);
    expect(body.notes.join(' ')).toContain('إلا بموافقتك');
  });

  it('and a promise the box really carries comes out «من العلبة», with the box text beside it', async () => {
    modelAnswer = { nameAr: 'قناع الأرز', promises: ['تغذية ولمعان'], packageText: BOX };
    const body = await (await post({ productId: PRODUCT_ID })).json();
    expect(body.promises[0].source).toBe('package');
    expect(body.promises[0].enters).toBe(true);
    expect(body.packageText, 'النصّ الخامّ ما وصل — فما في دليل على الوعد').toBe(BOX);
  });

  it('and the written spec beats the picture, with the conflict named for the owner', async () => {
    modelAnswer = { nameAr: 'قناع الأرز', size: '50 مل', packageText: BOX };
    const body = await (await post({ productId: PRODUCT_ID })).json();
    expect(body.notices).toHaveLength(1);
    expect(body.fields.find((f: { key: string }) => f.key === 'size').value).toBe('150 مل');
    expect(body.notes.join(' ')).toContain('تعارض');
  });

  it('and it writes NOTHING — not a page, not a draft', async () => {
    modelAnswer = { nameAr: 'قناع الأرز', promises: ['تغذية ولمعان'], packageText: BOX };
    await post({ productId: PRODUCT_ID });
    expect(db.landingPage.create).not.toHaveBeenCalled();
    expect(db.landingPage.update).not.toHaveBeenCalled();
  });

  it('and says it could not read a box, because this product has no photograph', async () => {
    modelAnswer = { nameAr: 'قناع الأرز', packageText: '' };
    const body = await (await post({ productId: PRODUCT_ID })).json();
    expect(body.imageWhy).toContain('ما في صورة');
    expect(body.route.readsImages).toBe(true);
  });

  it('and refuses an answer carrying a phone BEFORE it asks any model', async () => {
    const res = await post({ productId: PRODUCT_ID, answers: { buyer: 'رقمي 0799123456' } });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('ANSWER_REFUSED');
    expect(calledHosts, 'رقمٌ خرج إلى نموذج قبل أن يُرفض').toEqual([]);
  });

  it('and another company’s product is «غير موجود», not somebody else’s page', async () => {
    db.product.findFirst.mockResolvedValue(null);
    const res = await post({ productId: PRODUCT_ID });
    expect(res.status).toBe(404);
    expect(calledHosts).toEqual([]);
  });

  it('and an unreadable answer is said plainly rather than returned as an empty page', async () => {
    modelAnswer = 'ما بقدر أساعدك';
    db.product.findFirst.mockResolvedValue({
      id: PRODUCT_ID,
      name: '',
      nameEn: null,
      description: null,
      attributes: null,
      category: null,
      images: [],
    });
    const res = await post({ productId: PRODUCT_ID });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('UNREADABLE');
  });
});
