import { describe, expect, it } from 'vitest';
import { LANDING_STRUCTURES, STRUCTURE_PROBLEM_SOLUTION } from './landing-structures';
import {
  landingStructureSchema,
  PROOF_ENGINE,
  SECTIONS_THE_TEN_NEED,
  structureToSections,
} from './landing-structure';
import { SECTION_LABEL } from './landing-sections';
import { STORE_TEMPLATES } from './store-templates';
import { repoFile, stripComments } from './guard-source';

/**
 * THE TRIAL THREE.
 *
 * «ابنِ ثلاثة كتجربة، سلّمهم، بعدين السبعة الباقية.»
 *
 * Every one of these is parsed by `shippedStructure` when the module
 * loads, so a structure that breaks the contract fails the build rather
 * than a test. What is left to check is the things a schema cannot say:
 * that the three are genuinely different, that the writing guides are
 * guides and not labels, and that no colour got in.
 */

describe('three, and three that differ', () => {
  it('there are ten', () => {
    expect(LANDING_STRUCTURES).toHaveLength(10);
  });

  it('each parses against the contract — the build proved it, this says it', () => {
    for (const s of LANDING_STRUCTURES) {
      const r = landingStructureSchema.safeParse(s);
      expect(r.success, s.id + (r.success ? '' : ': ' + JSON.stringify(r.error.issues))).toBe(true);
    }
  });

  it('one ad framework each — the join between the ad and the page', () => {
    // «الزائر الي شاف إعلان بإطار معيّن بينزل على صفحة بتكمّل نفس القصة».
    // Two structures answering one framework would make that join
    // ambiguous: which page does that ad land on?
    const frameworks = LANDING_STRUCTURES.map((s) => s.adFramework);
    expect(new Set(frameworks).size).toBe(10);
  });

  it('while length and temperature repeat, because the design repeats them', () => {
    // There are three lengths and four temperatures for ten structures,
    // so repetition is arithmetic, not sloppiness. An earlier version of
    // this file demanded they all differ and the structures were right.
    expect(new Set(LANDING_STRUCTURES.map((s) => s.length)).size).toBe(3);
    expect(new Set(LANDING_STRUCTURES.map((s) => s.temperature)).size).toBe(4);
  });

  it('and no two tell the same story in the same order', () => {
    const shapes = LANDING_STRUCTURES.map((s) => s.sequence.join('>'));
    expect(new Set(shapes).size).toBe(10);
  });

  it('each has its own id and a name a seller reads', () => {
    expect(new Set(LANDING_STRUCTURES.map((s) => s.id)).size).toBe(10);
    for (const s of LANDING_STRUCTURES) {
      expect(s.name.length, s.id).toBeGreaterThan(2);
      expect(s.forWhom.length, s.id).toBeGreaterThan(8);
    }
  });
});

describe('«ما في بنية بتحمل ألوان»', () => {
  it('not one of the three names a colour, a font or a shape', () => {
    const src = stripComments(repoFile('src/lib/landing-structures.ts'));
    for (const look of ['accent', 'palette', 'swatch', 'corners', 'mood', '#']) {
      expect(src.includes(look), look).toBe(false);
    }
  });

  it('so every structure runs with every skin — a hundred pages from twenty', () => {
    // The architecture rule is only worth anything if the multiplication
    // is real: nothing in a structure can refuse a skin, because nothing
    // in a structure knows one exists.
    expect(LANDING_STRUCTURES.length * STORE_TEMPLATES.length).toBe(100);
    const src = stripComments(repoFile('src/lib/landing-structures.ts'));
    expect(src).not.toContain('STORE_TEMPLATES');
    expect(src).not.toContain('skin');
  });
});

describe('the writing guide a seller actually reads', () => {
  it('every slot says what it is for, what to avoid, and shows an example', () => {
    for (const s of LANDING_STRUCTURES) {
      for (const slot of s.slots) {
        expect(slot.purpose.length, `${s.id}/${slot.key}`).toBeGreaterThan(9);
        expect(slot.avoid.length, `${s.id}/${slot.key}`).toBeGreaterThan(9);
        expect(slot.example.length, `${s.id}/${slot.key}`).toBeGreaterThan(2);
      }
    }
  });

  it('and the example fits the limit it is an example of', () => {
    // A guide showing a sixty-character headline for a forty-character
    // field teaches the seller to write something the field will cut.
    for (const s of LANDING_STRUCTURES) {
      for (const slot of s.slots) {
        expect([...slot.example].length, `${s.id}/${slot.key}`).toBeLessThanOrEqual(slot.max);
      }
    }
  });

  it('no example smuggles in a number the page cannot stand behind', () => {
    for (const s of LANDING_STRUCTURES) {
      for (const slot of s.slots) {
        if (slot.mayContainDigits) continue;
        expect(/[0-9٠-٩]/.test(slot.example), `${s.id}/${slot.key}`).toBe(false);
      }
    }
  });

  it('every structure carries a hero headline tied to the ad', () => {
    // «الزائر الي شاف إعلان بإطار معيّن بينزل على صفحة بتكمّل نفس القصة
    // بنفس الوعد ونفس الكلمات الأولى». The slot that does that is the
    // one slot none of them may be missing.
    for (const s of LANDING_STRUCTURES) {
      const hero = s.slots.find((x) => x.key === 'heroTitle');
      expect(hero, s.id).toBeTruthy();
      expect(hero!.max, s.id).toBeLessThanOrEqual(40);
    }
  });

  it('and the «avoid» of each is specific, not a house rule repeated', () => {
    // A guide that says «كن صادقاً» on every slot is a guide nobody reads
    // twice. Every avoid line in a structure must differ from the others.
    for (const s of LANDING_STRUCTURES) {
      const avoids = s.slots.map((x) => x.avoid);
      expect(new Set(avoids).size, s.id).toBe(avoids.length);
    }
  });
});

describe('the locked core and the facts engine', () => {
  it('all four elements on the first screen of every one', () => {
    for (const s of LANDING_STRUCTURES) {
      expect(s.firstScreen.priceWithOffer, s.id).toBe(true);
      expect(s.firstScreen.orderButton, s.id).toBe(true);
      expect(s.firstScreen.codLine, s.id).toBe(true);
      expect(PROOF_ENGINE[s.firstScreen.trust], s.id).toBeTruthy();
    }
  });

  it('and the sticky order button in every one', () => {
    for (const s of LANDING_STRUCTURES) {
      expect(s.ctaRhythm.stickyOnMobile, s.id).toBe(true);
      expect(s.sequence, s.id).toContain('sticky');
    }
  });

  it('every proof they use is one something computes', () => {
    for (const s of LANDING_STRUCTURES) {
      for (const kind of s.proofKinds) {
        expect(PROOF_ENGINE[kind], `${s.id}: ${kind}`).toBeTruthy();
      }
    }
  });

  it('and none of them claims a rating — nothing in this system makes one', () => {
    for (const s of LANDING_STRUCTURES) {
      expect(s.proofKinds, s.id).not.toContain('verifiedRating');
      expect(s.proofKinds, s.id).not.toContain('repeatRate');
    }
  });
});

describe('why these three and not three others', () => {
  it('each is built from blocks the library already draws', () => {
    for (const s of LANDING_STRUCTURES) {
      for (const type of s.sequence) {
        expect(Object.keys(SECTION_LABEL), `${s.id}: ${type}`).toContain(type);
      }
    }
  });

  it('and the five blocks written for them are actually used', () => {
    // They were built because five of the ten could not be told without
    // them. A block nobody orders is a block that was not needed.
    const ordered = new Set(LANDING_STRUCTURES.flatMap((s) => s.sequence));
    for (const type of Object.keys(SECTIONS_THE_TEN_NEED)) {
      expect([...ordered], type).toContain(type);
    }
  });

  it('the page always ends at the order', () => {
    for (const s of LANDING_STRUCTURES) {
      const form = s.sequence.indexOf('form');
      const content = s.sequence.filter((t) => t !== 'sticky' && t !== 'footer');
      expect(form, s.id).toBeGreaterThan(0);
      // Nothing to read after the form except the furniture.
      expect(content[content.length - 1], s.id).toBe('form');
    }
  });
});

/**
 * A STRUCTURE, TURNED INTO A PAGE.
 *
 * `structureToSections` is the third bridge of its shape — `buildTemplate`
 * and `skinToSections` are the other two — and all three end at
 * `LandingSection[]`, which `PageBlocks` already draws. A page built from
 * a structure is an ordinary page afterwards.
 *
 * `newSection` is passed in rather than imported so this test can see
 * exactly what was written where, without the random ids the real one
 * mints.
 */
describe('a structure becomes a page', () => {
  const make = (type: string) => ({ id: type, type, enabled: true }) as never;

  const copy = {
    heroTitle: { levantine: 'تعبان من وجع ضهرك؟', msa: 'هل تعاني من ألم الظهر؟' },
    heroSub: { msa: 'له حل أبسط مما جربت' },
    whyItHurts: { levantine: 'بتقوم تعبان وبتقعد مش مركّز.' },
  };

  const build = (dialect: 'levantine' | 'msa' | 'egyptian' = 'levantine') =>
    structureToSections(STRUCTURE_PROBLEM_SOLUTION, copy, dialect, make) as unknown as Record<string, string>[];

  it('one section per step of the sequence, in order', () => {
    const page = build();
    expect(page.map((s) => s.type)).toEqual([...STRUCTURE_PROBLEM_SOLUTION.sequence]);
  });

  it('and every slot lands in the section it named', () => {
    const page = build();
    expect(page[0].headline).toBe('تعبان من وجع ضهرك؟');
    expect(page[0].subheadline).toBe('له حل أبسط مما جربت');
    expect(page[1].body).toBe('بتقوم تعبان وبتقعد مش مركّز.');
  });

  it('answers in the dialect asked for, and falls back rather than blanking', () => {
    expect(build('msa')[0].headline).toBe('هل تعاني من ألم الظهر؟');
    // No Egyptian copy was written; the page still has a headline.
    expect(build('egyptian')[0].headline).toBe('هل تعاني من ألم الظهر؟');
  });

  it('a slot nobody wrote leaves the section as the library made it', () => {
    const page = build();
    // `whatFailed` has no copy — the block is there, empty, for the seller
    // to fill. Not missing: a page with a hole in the middle of a story is
    // worse than one with an empty paragraph.
    expect(page[2].type).toBe('text');
    expect(page[2].body ?? '').toBe('');
  });

  it('cuts copy to the limit it was written under, never drops it', () => {
    const long = 'ا'.repeat(120);
    const page = structureToSections(
      STRUCTURE_PROBLEM_SOLUTION,
      { heroTitle: { levantine: long } },
      'levantine',
      make
    ) as unknown as Record<string, string>[];
    const slot = STRUCTURE_PROBLEM_SOLUTION.slots.find((s) => s.key === 'heroTitle')!;
    // Half a sentence is a bug somebody notices; an empty hero is one they
    // do not.
    expect([...page[0].headline].length).toBe(slot.max);
  });

  it('and writes no colour, because a structure has none to write', () => {
    const page = build();
    const flat = JSON.stringify(page);
    expect(flat).not.toMatch(/#[0-9a-f]{6}/i);
    expect(flat).not.toContain('accent');
  });

  it('every one of the three turns into a page', () => {
    for (const s of LANDING_STRUCTURES) {
      const page = structureToSections(s, {}, 'msa', make);
      expect(page, s.id).toHaveLength(s.sequence.length);
    }
  });
});
