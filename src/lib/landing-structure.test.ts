import { describe, expect, it } from 'vitest';
import {
  AD_FRAMEWORKS,
  DIALECTS,
  LEGAL_PAGES,
  PROOF_ENGINE,
  PROOF_SERVED,
  SECTIONS_THE_TEN_NEED,
  copyIn,
  landingStructureSchema,
  shippedStructure,
  textSlotSchema,
} from './landing-structure';
import { SECTION_LABEL, landingSectionSchema } from './landing-sections';
import { repoFile, stripComments } from './guard-source';

/**
 * THE CONTRACT, BEFORE ANY STRUCTURE EXISTS.
 *
 * «المرحلة ١ — عقد البنية (بلا بنى لسا)». What is worth testing about a
 * contract is not that a good value passes — it is that every bad one the
 * brief names is REFUSED, because the refusals are the contract.
 */

/** A structure that obeys every rule, to be broken one rule at a time. */
const good = () => ({
  id: 'problem-solution',
  name: 'المشكلة ← الحل',
  forWhom: 'زائر بارد من إعلان يعرض المشكلة',
  adFramework: 'problemSolution' as const,
  temperature: 'cold' as const,
  length: 'medium' as const,
  sequence: ['hero', 'text', 'text', 'benefits', 'reviews', 'offers', 'form', 'sticky', 'footer'],
  heroKind: 'problem',
  slots: [
    {
      key: 'heroTitle',
      label: 'عنوان البطل',
      purpose: 'يكرّر خطّاف الإعلان بنفس الكلمات الأولى',
      avoid: 'لا تضع رقماً ولا وعداً طبياً ولا اسم علامة منافسة',
      example: 'تعبان من وجع ضهرك كل صبح؟',
      max: 40,
      at: 0,
      field: 'headline',
      required: true,
      mayContainDigits: false,
    },
  ],
  ctaRhythm: { everyNSections: 3, stickyOnMobile: true as const },
  proofAt: [4],
  proofKinds: ['deliveredCount'],
  firstScreen: {
    priceWithOffer: true as const,
    orderButton: true as const,
    codLine: true as const,
    trust: 'deliveredCount',
  },
});

const parse = (over: Record<string, unknown> = {}) =>
  landingStructureSchema.safeParse({ ...good(), ...over });

describe('a structure that obeys the contract', () => {
  it('passes', () => {
    const r = parse();
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
  });
});

describe('«ما في بنية بتحمل ألوان»', () => {
  /**
   * The architecture rule is `بنية × مظهر`, and it is only true if a
   * structure genuinely cannot carry a look. The schema is `.strict()`,
   * so this is enforced — but the thing worth guarding is the FILE: a
   * field added later with a colour in it would pass `.strict()` happily.
   */
  it('the contract names no colour, font or shape anywhere', () => {
    const src = stripComments(repoFile('src/lib/landing-structure.ts'));
    for (const look of ['accent', 'palette', 'swatch', 'font', 'corners', 'mood', '#']) {
      expect(src.includes(look), look).toBe(false);
    }
  });

  it('and refuses one handed to it anyway', () => {
    expect(parse({ accent: '#b8256e' }).success).toBe(false);
    expect(parse({ theme: { accent: '#b8256e' } }).success).toBe(false);
  });

  it('while the skin half is somebody else’s file', () => {
    // `skinToLandingTheme` is the bridge. A second one here would be the
    // duplication the whole rule exists to prevent.
    expect(stripComments(repoFile('src/lib/landing-structure.ts'))).not.toContain('skinToLandingTheme');
    expect(repoFile('src/lib/store-skin.ts')).toContain('export function skinToLandingTheme');
  });
});

describe('«هدف واحد بالصفحة»', () => {
  it('refuses a structure with no order form', () => {
    const r = parse({ sequence: ['hero', 'text', 'offers', 'sticky', 'footer', 'benefits'] });
    expect(r.success).toBe(false);
  });

  it('refuses one with no sticky order button', () => {
    expect(parse({ sequence: ['hero', 'text', 'text', 'benefits', 'reviews', 'offers', 'form', 'footer'] }).success).toBe(false);
  });

  it('refuses one with no legal footer — the platforms will not run the ad', () => {
    expect(parse({ sequence: ['hero', 'text', 'text', 'benefits', 'reviews', 'offers', 'form', 'sticky'] }).success).toBe(false);
    expect(LEGAL_PAGES).toEqual(['privacy', 'terms', 'returns']);
  });

  it('and one that does not open on the hero', () => {
    expect(parse({ sequence: ['text', 'hero', 'text', 'benefits', 'reviews', 'offers', 'form', 'sticky', 'footer'] }).success).toBe(false);
  });

  it('the sticky button cannot be turned off', () => {
    expect(parse({ ctaRhythm: { everyNSections: 3, stickyOnMobile: false } }).success).toBe(false);
  });
});

describe('«ولا خانة بتقبل رقم كادعاء»', () => {
  it('a slot may not hold digits unless somebody asked for it', () => {
    const slot = textSlotSchema.parse({
      key: 'heroTitle',
      label: 'عنوان',
      purpose: 'يكرّر خطّاف الإعلان بنفس الكلمات',
      avoid: 'لا رقم ولا وعد طبي ولا اسم منافس',
      example: 'تعبان من وجع ضهرك؟',
      max: 40,
      at: 0,
      field: 'headline',
    });
    // The permissive case is the one that has to be asked for.
    expect(slot.mayContainDigits).toBe(false);
    expect(slot.required).toBe(true);
  });

  it('and a short slot may never hold them — that is where the claim goes', () => {
    const r = parse({
      slots: [{ ...good().slots[0], mayContainDigits: true, max: 40 }],
    });
    expect(r.success).toBe(false);
  });

  it('while a long one may — a dose, a size, a model number', () => {
    expect(parse({
      slots: [{ ...good().slots[0], key: 'spec', at: 1, field: 'body', mayContainDigits: true, max: 200, example: 'العبوة 50 مل تكفي شهر' }],
    }).success).toBe(true);
  });

  it('every slot says what it is FOR, not just what it is called', () => {
    // «عنوان البطل ٤٠ حرف — يكرر خطّاف الإعلان» is a purpose; «العنوان»
    // is a label. The writing guide is built from the first.
    //
    // A VALID KEY, deliberately. The first version passed `key: 'a'`,
    // which the key pattern refuses on its own — so the test was green
    // because of the key and said nothing about the purpose at all. A
    // mutation that made `purpose` optional was caught by nothing.
    const ok = {
      key: 'heroTitle', label: 'عنوان', max: 40, at: 0, field: 'headline',
      avoid: 'لا رقم ولا وعد طبي', example: 'تعبان من وجع ضهرك؟',
    };
    expect(textSlotSchema.safeParse({ ...ok, purpose: 'يكرّر خطّاف الإعلان بنفس الكلمات' }).success).toBe(true);
    expect(textSlotSchema.safeParse({ ...ok, purpose: 'قصير' }).success).toBe(false);
    expect(textSlotSchema.safeParse(ok).success, 'بلا غرض').toBe(false);
    // A guide with no «what not to say» is not a guide.
    expect(textSlotSchema.safeParse({ ...ok, purpose: 'يكرّر خطّاف الإعلان', avoid: undefined }).success, 'بلا ممنوع').toBe(false);
    expect(textSlotSchema.safeParse({ ...ok, purpose: 'يكرّر خطّاف الإعلان', example: undefined }).success, 'بلا مثال').toBe(false);
  });

  it('an example that does not fit the field is not an example', () => {
    // A guide showing a sixty-character headline for a forty-character
    // field teaches the seller to write something the field will cut.
    const long = 'تعبان من وجع ضهرك كل صبح وكل مسا وما بتعرف ليش ولا شو بتعمل أبداً؟';
    expect([...long].length).toBeGreaterThan(40);
    expect(parse({ slots: [{ ...good().slots[0], example: long }] }).success).toBe(false);
    // And one that does fit still passes.
    expect(parse({ slots: [{ ...good().slots[0], example: 'تعبان من وجع ضهرك؟' }] }).success).toBe(true);
  });

  it('and an example may not break its own slot’s rule about digits', () => {
    expect(parse({ slots: [{ ...good().slots[0], example: 'جرّبه 5000 زبون' }] }).success).toBe(false);
    // Arabic-Indic too — the digits a person reads are Western here.
    expect(parse({ slots: [{ ...good().slots[0], example: 'جرّبه ٥٠٠٠ زبون' }] }).success).toBe(false);
  });

  it('and the limit is in characters, because Arabic words run long', () => {
    const src = stripComments(repoFile('src/lib/landing-structure.ts'));
    expect(src).toContain('max: z.number()');
    expect(src).not.toContain('maxWords');
  });
});

/**
 * WHERE EACH PIECE OF COPY LANDS.
 *
 * A structure that lists its sections and its slots separately knows what
 * a page is made of and not what goes where — so nothing could turn one
 * into a page. These three refusals were written when the renderer needed
 * the binding, and for a while they had no negative test: three mutations
 * removed them and nothing went red.
 */
describe('a slot says where it lands', () => {
  it('refuses copy aimed at a section that is not there', () => {
    // WITHIN the field's own range, beyond THIS sequence. `at: 99` is
    // refused by `max(13)` before the sequence is ever consulted — so a
    // test written with it is green because of the wrong rule, and a
    // mutation removing the right one goes unnoticed. The fixture has
    // nine sections.
    expect(good().sequence.length).toBe(9);
    expect(parse({ slots: [{ ...good().slots[0], at: 12 }] }).success, 'بعد نهاية التسلسل').toBe(false);
    expect(parse({ slots: [{ ...good().slots[0], at: 1 }] }).success, 'داخله').toBe(true);
  });

  it('refuses two slots writing the same field of the same section', () => {
    // One of them silently loses, and which one depends on the order they
    // happen to be listed in.
    expect(parse({
      slots: [
        { ...good().slots[0], key: 'slotOne', at: 0, field: 'headline' },
        { ...good().slots[0], key: 'slotTwo', at: 0, field: 'headline' },
      ],
    }).success).toBe(false);
    // The same field on a DIFFERENT section is fine.
    expect(parse({
      slots: [
        { ...good().slots[0], key: 'slotOne', at: 0, field: 'headline' },
        { ...good().slots[0], key: 'slotTwo', at: 1, field: 'headline' },
      ],
    }).success).toBe(true);
  });

  it('and refuses copy aimed at the furniture nobody writes', () => {
    // `sticky` and `footer` are the engine's; a slot pointing at one is
    // copy a seller writes and never sees.
    const seq = good().sequence;
    const sticky = seq.indexOf('sticky');
    const footer = seq.indexOf('footer');
    expect(parse({ slots: [{ ...good().slots[0], at: sticky }] }).success).toBe(false);
    expect(parse({ slots: [{ ...good().slots[0], at: footer }] }).success).toBe(false);
  });
});

describe('«الأرقام من محرّك الحقائق»', () => {
  it('refuses a kind of proof nothing serves', () => {
    // Named in the brief's context as already existing. It does not: there
    // is no review model in the schema at all.
    expect(PROOF_ENGINE.verifiedRating).toBeNull();
    expect(parse({ proofKinds: ['verifiedRating'] }).success).toBe(false);
    expect(parse({ proofKinds: ['repeatRate'] }).success).toBe(false);
  });

  it('and one nobody has heard of', () => {
    expect(parse({ proofKinds: ['fiveThousandHappyCustomers'] }).success).toBe(false);
  });

  it('accepts the ones that are actually computed', () => {
    expect(PROOF_SERVED).toEqual(['deliveredCount', 'boughtTogether', 'evidencedWas']);
    for (const kind of PROOF_SERVED) {
      expect(parse({ proofKinds: [kind], firstScreen: { ...good().firstScreen, trust: kind } }).success, kind).toBe(true);
    }
  });

  it('and every served kind names a module and an export that exist', () => {
    for (const kind of PROOF_SERVED) {
      const engine = PROOF_ENGINE[kind]!;
      const src = repoFile(`src/lib/${engine.module}.ts`);
      expect(src, `${kind} → ${engine.module}`).toContain(`export async function ${engine.export}`);
    }
  });

  it('refuses a proof placed past the end of the page', () => {
    expect(parse({ proofAt: [99] }).success).toBe(false);
  });
});

describe('«النواة المقفولة» — أربعة عناصر على أول شاشة', () => {
  it('a structure cannot declare a first screen without the price', () => {
    expect(parse({ firstScreen: { ...good().firstScreen, priceWithOffer: false } }).success).toBe(false);
  });

  it('nor without the order button', () => {
    expect(parse({ firstScreen: { ...good().firstScreen, orderButton: false } }).success).toBe(false);
  });

  it('nor without «الدفع عند الاستلام»', () => {
    expect(parse({ firstScreen: { ...good().firstScreen, codLine: false } }).success).toBe(false);
  });

  it('and its trust element must be one the facts engine serves', () => {
    expect(parse({ firstScreen: { ...good().firstScreen, trust: 'verifiedRating' } }).success).toBe(false);
    expect(parse({ firstScreen: { ...good().firstScreen, trust: 'nothing' } }).success).toBe(false);
  });

  it('there is no value that removes one — they are literals', () => {
    const src = stripComments(repoFile('src/lib/landing-structure.ts'));
    for (const core of ['priceWithOffer: z.literal(true)', 'orderButton: z.literal(true)', 'codLine: z.literal(true)']) {
      expect(src, core).toContain(core);
    }
  });
});

describe('the sections come from the library that already exists', () => {
  it('a structure may only order blocks the library draws', () => {
    expect(parse({ sequence: ['hero', 'comparison', 'offers', 'form', 'sticky', 'footer'] }).success).toBe(false);
  });

  it('and the contract holds no second list of block names', () => {
    const src = stripComments(repoFile('src/lib/landing-structure.ts'));
    expect(src).toContain('Object.keys(SECTION_LABEL)');
    // Every type the sequence accepts is one the library labels.
    expect(Object.keys(SECTION_LABEL).length).toBeGreaterThan(10);
  });

  it('nothing that may appear once appears twice', () => {
    expect(parse({
      sequence: ['hero', 'hero', 'text', 'benefits', 'reviews', 'offers', 'form', 'sticky', 'footer'],
    }).success).toBe(false);
  });

  it('and the length agrees with the sequence', () => {
    // A «short» structure with nine sections is a long page wearing a
    // label, and a seller picking by length would be misled by it.
    expect(parse({ length: 'short' }).success).toBe(false);
    expect(parse({ length: 'medium' }).success).toBe(true);

    // COUNTED IN CONTENT, NOT IN FURNITURE. `sticky` and `footer` are
    // required of every structure and are the same two on a short page and
    // a long one; counting them would allow a «short» page two fewer
    // paragraphs than it should have. The fixture is nine sections, seven
    // of them content.
    expect(parse({ length: 'long' }).success, 'سبعة محتوى ليست طويلة').toBe(false);

    // THE SEAMS OVERLAP, ON PURPOSE. «قصيرة · متوسطة · طويلة» is a label a
    // seller browses by, not a measurement, so eight content sections are
    // honestly either medium or long and both are accepted.
    const eight = ['hero', 'text', 'text', 'benefits', 'gallery', 'reviews', 'offers', 'form', 'sticky', 'footer'];
    expect(parse({ length: 'medium', sequence: eight, proofAt: [5] }).success).toBe(true);
    expect(parse({ length: 'long', sequence: eight, proofAt: [5] }).success).toBe(true);
    expect(parse({ length: 'short', sequence: eight, proofAt: [5] }).success).toBe(false);
  });
});

describe('the ad that sent them', () => {
  it('the framework is a closed list, not free text', () => {
    expect(parse({ adFramework: 'somethingElse' }).success).toBe(false);
    expect(AD_FRAMEWORKS).toHaveLength(10);
  });

  it('and the platform adapters are a different thing entirely', () => {
    // `src/lib/ads/` spends the money; this says what the creative claims.
    // A structure pointing at «meta» would be a category error.
    expect(AD_FRAMEWORKS as readonly string[]).not.toContain('meta');
    expect(AD_FRAMEWORKS as readonly string[]).not.toContain('tiktok');
  });

  it('a hesitant visitor is a temperature this system knows', () => {
    expect(parse({ temperature: 'hesitant' }).success).toBe(true);
    expect(parse({ temperature: 'lukewarm' }).success).toBe(false);
  });
});

describe('one slot, four dialects', () => {
  it('answers in the dialect asked for', () => {
    const copy = { levantine: 'بتجرب؟', egyptian: 'تجرب؟', msa: 'هل تجرب؟' };
    expect(copyIn(copy, 'levantine')).toBe('بتجرب؟');
    expect(copyIn(copy, 'egyptian')).toBe('تجرب؟');
  });

  it('and falls back rather than showing a blank page', () => {
    const copy = { msa: 'هل تجرب؟' };
    // A market with no copy written yet still has a page.
    expect(copyIn(copy, 'hassaniya')).toBe('هل تجرب؟');
    expect(copyIn(copy, 'levantine')).toBe('هل تجرب؟');
  });

  it('treats whitespace as unwritten', () => {
    expect(copyIn({ levantine: '   ', msa: 'نص' }, 'levantine')).toBe('نص');
  });

  it('says nothing when nothing was written at all', () => {
    expect(copyIn(undefined, 'msa')).toBe('');
    expect(copyIn({}, 'msa')).toBe('');
  });

  it('and the four are the four the brief names', () => {
    expect(DIALECTS).toEqual(['levantine', 'egyptian', 'hassaniya', 'msa']);
  });
});

describe('a structure that breaks the contract cannot ship', () => {
  it('throws at module load, naming what it broke', () => {
    expect(() => shippedStructure({ ...good(), proofKinds: ['verifiedRating'] })).toThrow(/verifiedRating/);
    expect(() => shippedStructure({ ...good(), sequence: ['hero'] })).toThrow();
  });

  it('and names the structure, so the build error says which one', () => {
    expect(() => shippedStructure({ ...good(), id: 'bad', length: 'short' })).toThrow(/bad/);
  });

  it('returns the parsed value when it is good', () => {
    expect(shippedStructure(good()).id).toBe('problem-solution');
  });
});

describe('what the library still owes the ten', () => {
  /**
   * Five of the ten sequences the brief writes out cannot be built with
   * the blocks that exist. Writing that down here, in the file a structure
   * is parsed by, is the honest place for it: the contract is where the
   * gap is discovered.
   */
  it('names the five blocks that do not exist yet', () => {
    expect(Object.keys(SECTIONS_THE_TEN_NEED)).toEqual([
      'comparison', 'timeline', 'quiz', 'objections', 'mechanism',
    ]);
  });

  it('and every one of them is now in the library', () => {
    // This test used to assert the opposite — that none of them existed —
    // and it went red the moment they were built, which is how the
    // delivery announced itself.
    for (const built of Object.keys(SECTIONS_THE_TEN_NEED)) {
      expect(Object.keys(SECTION_LABEL), built).toContain(built);
    }
  });

  it('so a structure may now order one', () => {
    // Four content sections, so the label has to be «short» — the length
    // rule is what refuses this otherwise, not the block.
    const short = { length: 'short' as const, proofAt: [2] };
    expect(parse({ ...short, sequence: ['hero', 'comparison', 'offers', 'form', 'sticky', 'footer'] }).success).toBe(true);
    expect(parse({ ...short, sequence: ['hero', 'quiz', 'offers', 'form', 'sticky', 'footer'] }).success).toBe(true);
    expect(parse({ ...short, sequence: ['hero', 'objections', 'offers', 'form', 'sticky', 'footer'] }).success).toBe(true);
    expect(parse({ ...short, sequence: ['hero', 'timeline', 'offers', 'form', 'sticky', 'footer'] }).success).toBe(true);
    expect(parse({ ...short, sequence: ['hero', 'mechanism', 'offers', 'form', 'sticky', 'footer'] }).success).toBe(true);
  });

  it('while the blocks the other five need ARE there', () => {
    for (const have of ['hero', 'text', 'benefits', 'reviews', 'offers', 'faq', 'urgency', 'form', 'trust', 'sticky', 'footer']) {
      expect(Object.keys(SECTION_LABEL), have).toContain(have);
    }
  });
});

/**
 * THE FIVE BLOCKS, AND THE RULES THAT ARE STRUCTURAL.
 *
 * Each of these was named in the brief with a rule attached, and the
 * strongest place to keep a rule is where it cannot be written down
 * wrongly: there is no field for a competitor's name, no image on the
 * timeline, no fourth question on the quiz, no percentage on an
 * ingredient. A seller cannot break one from a panel that offers nowhere
 * to do it.
 */
describe('the five blocks keep their rules by having no field for breaking them', () => {
  const parseBlock = (type: string, over: Record<string, unknown> = {}) =>
    landingSectionSchema.safeParse({ id: type, type, enabled: true, ...over });

  /**
   * THE FIELD DOES NOT SURVIVE — which is the claim worth making.
   *
   * These schemas strip unknown keys rather than refusing them, and that
   * is right: sections stored before a field was renamed still have to
   * parse. What matters for a RULE is that the forbidden thing cannot
   * reach a page, and a key that is dropped on the way in cannot.
   */
  it('the comparison table has no field for a competitor’s name', () => {
    const r = parseBlock('comparison', {
      rows: [{ aspect: 'الملمس', ours: 'خفيف', theirs: 'دهني' }],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    // «ما في تشهير بعلامة منافسة بالاسم» — enforced by absence.
    expect(Object.keys(r.data)).not.toContain('competitor');
    expect(Object.keys(r.data)).not.toContain('brand');
    const smuggled = parseBlock('comparison', { competitor: 'علامة ما' });
    expect(smuggled.success).toBe(true);
    if (smuggled.success) expect(Object.keys(smuggled.data)).not.toContain('competitor');
  });

  it('and refuses a table longer than a comparison', () => {
    const rows = Array.from({ length: 7 }, () => ({ aspect: 'ا', ours: 'ب', theirs: 'ج' }));
    expect(parseBlock('comparison', { rows }).success).toBe(false);
  });

  it('the timeline carries no photograph at all', () => {
    // «خط زمني بدل صور قبل/بعد — لأن منصات الإعلان بتقيّد صور قبل/بعد».
    // A page that cannot hold the picture cannot have the ad refused for it.
    const r = parseBlock('timeline', { points: [{ when: 'الأسبوع الأول', what: 'شيء' }] });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(Object.keys(r.data)).not.toContain('image');
    expect(Object.keys(r.data)).not.toContain('images');
    const smuggled = parseBlock('timeline', { image: '/a.webp' });
    expect(smuggled.success).toBe(true);
    if (smuggled.success) expect(Object.keys(smuggled.data)).not.toContain('image');
  });

  it('the quiz asks three at most — three taps is the design', () => {
    const q = (n: number) => Array.from({ length: n }, () => ({ ask: 'سؤال', options: ['أ', 'ب'] }));
    expect(parseBlock('quiz', { questions: q(3) }).success).toBe(true);
    expect(parseBlock('quiz', { questions: q(4) }).success).toBe(false);
  });

  it('and offers four answers at most to any one of them', () => {
    expect(parseBlock('quiz', { questions: [{ ask: 'س', options: ['أ', 'ب', 'ج', 'د', 'هـ'] }] }).success).toBe(false);
  });

  it('an ingredient says what it DOES and carries no percentage', () => {
    const r = parseBlock('mechanism', { ingredients: [{ name: 'جلسرين', does: 'يسحب الرطوبة' }] });
    expect(r.success).toBe(true);
    if (!r.success) return;
    // A number here is a claim, and numbers come from the facts engine.
    const smuggled = parseBlock('mechanism', { ingredients: [{ name: 'جلسرين', percent: 15 }] });
    expect(smuggled.success).toBe(true);
    if (smuggled.success) {
      expect(Object.keys((smuggled.data as { ingredients: object[] }).ingredients[0])).not.toContain('percent');
    }
  });

  it('the objections block is not the FAQ beside it', () => {
    // A question is something a visitor wants to know; an objection is a
    // reason they have already decided not to buy.
    const r = parseBlock('objections', { items: [{ doubt: 'غالي', answer: 'يكفي شهر' }] });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(Object.keys(r.data)).toContain('guarantee');
    // The FAQ's own shape does not survive here, so the two cannot be
    // confused: a q/a pair arrives as an empty doubt and an empty answer
    // and the renderer draws nothing rather than a half-built block.
    const asFaq = parseBlock('objections', { items: [{ q: 'س', a: 'ج' }] });
    expect(asFaq.success).toBe(true);
    if (asFaq.success) {
      const item = (asFaq.data as { items: Record<string, string>[] }).items[0];
      expect(item.q).toBeUndefined();
      expect(item.doubt).toBe('');
    }
  });

  it('every one of the five is drawn, and drawn in the shop’s own colours', () => {
    const css = repoFile('src/components/landing/blocks/styles.ts');
    const renderer = repoFile('src/components/landing/blocks/PageBlocks.tsx');
    const editor = repoFile('src/components/landing-editor/BlockBuilder.tsx');
    for (const type of Object.keys(SECTIONS_THE_TEN_NEED)) {
      expect(renderer, `renderer: ${type}`).toContain(`case '${type}'`);
      expect(editor, `editor: ${type}`).toContain(`case '${type}'`);
    }
    for (const cls of ['lp-compare', 'lp-timeline', 'lp-quiz', 'lp-objection', 'lp-mechanism']) {
      expect(css, cls).toContain(`.${cls}`);
    }
    // Not one hex among them: a block drawn under one skin and the same
    // block under another are the same shape in two palettes.
    const ours = css.slice(css.indexOf('.lp-compare'), css.indexOf('.lp-ingredients dd'));
    expect(ours).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
