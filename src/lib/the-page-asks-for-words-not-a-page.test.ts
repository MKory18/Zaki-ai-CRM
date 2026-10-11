import { describe, expect, it } from 'vitest';
import { landingCopyBrief, parseProposal, proposalNoteAr, readProposal } from './landing-copy-brief';
import { LANDING_STRUCTURES } from './landing-structures';
import { AI_JOBS, jobInfo } from './ai-prompts';
import { ASSISTANTS, assistantByKey } from './ai-assistants';
import { DIALECT_LABEL } from './landing-structure';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE GENERATOR ASKS FOR WORDS, NOT FOR A PAGE.
 *
 * «مولّد صفحة الهبوط بالذكاء الاصطناعيّ». The hook was declared and never
 * called: `ai-prompts.ts` carried a `landing_html` job whose `default` was
 * an EMPTY STRING and which nothing in the product invoked. The setting
 * existed; the generator did not.
 *
 * What is guarded here is the shape of the thing, because the shape is the
 * decision:
 *
 *   IT FILLS THE TEN STRUCTURES' OWN SLOTS. Every slot already carries its
 *   label, its purpose, what it must avoid, a Levantine example and a
 *   character limit — written by the person who sells the product. Asking
 *   a model for HTML instead would be a second landing system: a page the
 *   structure engine cannot read, the skins cannot paint, the editor cannot
 *   edit slot by slot, and the sanitizer has to defend against.
 *
 *   IT PROPOSES AND WRITES NOTHING. Enforced repo-wide by
 *   `ai-proposal-only.test.ts`; asserted here for this door by name,
 *   because that sweep is a sweep and this is the door most tempted to
 *   write — it produces a whole page's worth of text that somebody will
 *   want saved.
 *
 *   AND NOTHING THAT COMES BACK IS TRUSTED. A model asked for nine keys
 *   sends eight, or ten, or one it invented, or a headline twice the limit.
 *   All four are measured below, and every dropped thing is NAMED — a
 *   generator that quietly keeps six of nine slots looks like a model that
 *   writes badly.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const STRUCTURE = LANDING_STRUCTURES.find((s) => s.id === 'problem-solution')!;

/** A full, well-behaved answer for a structure: every key, within every limit. */
const perfect = (structure = STRUCTURE) =>
  Object.fromEntries(structure.slots.map((s) => [s.key, 'ا'.repeat(Math.min(10, s.max))]));

describe('Ⅰ · the brief is built from the structure, not stored', () => {
  it('names every slot the structure declares, with its four guides', () => {
    const brief = landingCopyBrief({
      structure: STRUCTURE,
      dialect: 'levantine',
      product: { name: 'كريم الظهر', description: 'كريم مرطّب', price: 12, currency: 'JOD' },
    });
    for (const slot of STRUCTURE.slots) {
      expect(brief, `«${slot.key}» غائبٌ عن البريف`).toContain(slot.key);
      expect(brief, `غرضُ «${slot.key}» غائب`).toContain(slot.purpose);
      expect(brief, `ممنوعاتُ «${slot.key}» غائبة — وهي أهمُّ نصفِ الدليل`).toContain(slot.avoid);
      expect(brief, `مثالُ «${slot.key}» غائب`).toContain(slot.example);
      expect(brief, `حدُّ «${slot.key}» غائب`).toContain(String(slot.max));
    }
  });

  it('and every one of the ten structures produces a brief that carries all of its slots', () => {
    /*
     * WALKED, not sampled. A brief built by reading `structure.slots` is
     * complete for whichever structure it is handed — which is the reason
     * it is built at call time and not stored — and this is what proves
     * that claim for all ten rather than for the one somebody tested.
     */
    const thin: string[] = [];
    for (const structure of LANDING_STRUCTURES) {
      const brief = landingCopyBrief({
        structure,
        dialect: 'msa',
        product: { name: 'منتج', price: 10, currency: 'JOD' },
      });
      for (const slot of structure.slots) {
        if (!brief.includes(slot.key)) thin.push(`${structure.id} / ${slot.key}`);
      }
    }
    expect(thin, `خاناتٌ لم تَصِلِ البريف:\n${thin.join('\n')}`).toEqual([]);
  });

  it('and it asks for the dialect by its name, not its code', () => {
    const brief = landingCopyBrief({
      structure: STRUCTURE,
      dialect: 'egyptian',
      product: { name: 'منتج', price: 10, currency: 'JOD' },
    });
    expect(brief).toContain(DIALECT_LABEL.egyptian);
    expect(brief, 'طلبَ اللهجةَ برمزِها البرمجيّ').not.toContain('egyptian');
  });

  it('and a product with no description says so instead of leaving a blank', () => {
    /*
     * A missing field in a brief is an invitation to invent one. Said out
     * loud, with the instruction attached.
     */
    const brief = landingCopyBrief({
      structure: STRUCTURE,
      dialect: 'levantine',
      product: { name: 'منتج', description: '   ', price: 10, currency: 'JOD' },
    });
    expect(brief).toContain('لا وصف مكتوب له');
    expect(brief).toContain('لا تخترع');
  });

  it('and it forbids the four things this product forbids everywhere else', () => {
    const brief = landingCopyBrief({
      structure: STRUCTURE,
      dialect: 'levantine',
      product: { name: 'منتج', price: 10, currency: 'JOD' },
    });
    for (const forbidden of ['لا تخترع رقماً', 'طبّي', 'منافسة', 'HTML']) {
      expect(brief, `البريفُ لا يَمنعُ «${forbidden}»`).toContain(forbidden);
    }
  });

  it('and it never asks for HTML — that is the other path, deliberately', () => {
    const brief = landingCopyBrief({
      structure: STRUCTURE,
      dialect: 'levantine',
      product: { name: 'منتج', price: 10, currency: 'JOD' },
    });
    expect(brief, 'طلبَ وسوماً — وهذا نظامُ صفحاتٍ ثانٍ').not.toMatch(/<div|<section|<button|<style/);
  });
});

describe('Ⅱ · what comes back is checked against the structure', () => {
  it('a complete answer is kept whole', () => {
    const r = readProposal(STRUCTURE, perfect());
    expect(Object.keys(r.copy)).toHaveLength(STRUCTURE.slots.length);
    expect(r.missing).toEqual([]);
    expect(r.unknown).toEqual([]);
    expect(r.cut).toEqual([]);
  });

  it('and a key the structure does not declare is DROPPED and named', () => {
    /*
     * `structureToSections` looks up the keys the slots name, so an
     * invented key would be stored for ever and rendered never — which is
     * worse than being refused, because nobody would know.
     */
    const r = readProposal(STRUCTURE, { ...perfect(), heroTitleV2: 'عنوان من عندي' });
    expect(r.copy).not.toHaveProperty('heroTitleV2');
    expect(r.unknown).toEqual(['heroTitleV2']);
  });

  it('and a missing key is named so the seller knows to write it', () => {
    const answer = perfect();
    delete answer[STRUCTURE.slots[0].key];
    const r = readProposal(STRUCTURE, answer);
    expect(r.missing).toEqual([STRUCTURE.slots[0].key]);
    expect(r.copy).not.toHaveProperty(STRUCTURE.slots[0].key);
  });

  it('and a value that is not a string is not copy', () => {
    const slot = STRUCTURE.slots[0].key;
    for (const value of [42, null, { ar: 'نص' }, ['نص'], true]) {
      const r = readProposal(STRUCTURE, { ...perfect(), [slot]: value });
      expect(r.copy[slot], String(value)).toBeUndefined();
      expect(r.missing).toContain(slot);
    }
  });

  it('and an empty answer is «blank», which is not the same as «missing»', () => {
    // Two different things to tell the seller: the model skipped it, or the
    // model answered nothing. Both mean «write this one», and lumping them
    // together loses the only clue about why.
    const slot = STRUCTURE.slots[0].key;
    const r = readProposal(STRUCTURE, { ...perfect(), [slot]: '   ' });
    expect(r.blank).toEqual([slot]);
    expect(r.missing).not.toContain(slot);
  });

  it('and an answer over the limit is CUT, not dropped, and said so', () => {
    const slot = STRUCTURE.slots[0];
    const long = 'ا'.repeat(slot.max + 25);
    const r = readProposal(STRUCTURE, { ...perfect(), [slot.key]: long });
    expect(r.copy[slot.key], 'طُرحت الجملةُ كلُّها بدلَ قصِّها').toHaveLength(slot.max);
    expect(r.cut).toEqual([{ key: slot.key, was: slot.max + 25, max: slot.max }]);
  });

  it('and an answer of exactly the limit is not cut', () => {
    // The boundary, because this is where an off-by-one lives and a
    // headline short by one character is a defect nobody reports.
    const slot = STRUCTURE.slots[0];
    const r = readProposal(STRUCTURE, { ...perfect(), [slot.key]: 'ا'.repeat(slot.max) });
    expect(r.cut).toEqual([]);
    expect(r.copy[slot.key]).toHaveLength(slot.max);
  });

  it('and nothing at all is a reading with nothing in it, not a crash', () => {
    for (const raw of [null, undefined, 'نص', 42, [], [{ a: 1 }]]) {
      const r = readProposal(STRUCTURE, raw);
      expect(r.copy, String(raw)).toEqual({});
      expect(r.missing).toHaveLength(STRUCTURE.slots.length);
    }
  });

  it('and the note says what the seller has to do, by label', () => {
    const answer = perfect();
    delete answer[STRUCTURE.slots[1].key];
    const r = readProposal(STRUCTURE, { ...answer, invented: 'x' });
    const note = proposalNoteAr(r, STRUCTURE);
    expect(note).toContain(STRUCTURE.slots[1].label);
    expect(note).toContain('invented');
    expect(note, 'لم يَقُلْ كم كُتبت من كم').toMatch(/\d+ من \d+/);
  });
});

describe('Ⅲ · a model’s answer is text until it parses', () => {
  it('plain JSON reads', () => {
    expect(parseProposal('{"a":"ب"}')).toEqual({ a: 'ب' });
  });

  it('and JSON in a fenced block reads — models do this constantly', () => {
    expect(parseProposal('```json\n{"a":"ب"}\n```')).toEqual({ a: 'ب' });
  });

  it('and JSON with a sentence before and after it reads', () => {
    expect(parseProposal('تفضّل:\n{"a":"ب"}\nبالتوفيق!')).toEqual({ a: 'ب' });
  });

  it('and a nested object does not stop the scan early', () => {
    /*
     * A lazy regex stops at the first `}`, which is the END of the nested
     * object — so the whole answer fails to parse and the seller is told
     * the generation failed for an answer that was fine. Braces are
     * counted instead.
     */
    expect(parseProposal('{"a":{"b":"ج"},"d":"ه"}')).toEqual({ a: { b: 'ج' }, d: 'ه' });
  });

  it('and a brace inside a STRING does not end the object', () => {
    expect(parseProposal('{"a":"قوس } هنا","b":"ج"}')).toEqual({ a: 'قوس } هنا', b: 'ج' });
  });

  it('and an escaped quote inside a string does not end it', () => {
    expect(parseProposal('{"a":"قال \\"مرحبا\\" } ثم","b":"ج"}')).toEqual({ a: 'قال "مرحبا" } ثم', b: 'ج' });
  });

  it('and text with no JSON in it is null, not a throw', () => {
    for (const text of ['', 'لا أستطيع المساعدة', '{ ليس JSON', 'null', '[1,2]']) {
      expect(() => parseProposal(text)).not.toThrow();
    }
    expect(parseProposal('لا أستطيع المساعدة')).toBeNull();
    expect(parseProposal('{ ليس JSON')).toBeNull();
  });
});

describe('Ⅳ · the job and the assistant are registered, and say what they are', () => {
  it('the `landing_copy` job exists and carries a real default', () => {
    const job = jobInfo('landing_copy');
    expect(job, 'الوظيفةُ غيرُ مُسجَّلة — فالبابُ يُنادي مفتاحاً لا وجودَ له').toBeTruthy();
    expect(job!.default.length, 'برومبتٌ فارغٌ — وهذا ما كان عليه landing_html').toBeGreaterThan(100);
  });

  it('and it is NOT the html job — two different paths, on purpose', () => {
    const html = jobInfo('landing_html');
    expect(html, 'المسارُ اليدويُّ حُذف').toBeTruthy();
    expect(html!.key).not.toBe('landing_copy');
  });

  it('and the assistant is given no scopes and no PII', () => {
    const a = assistantByKey('landing_copy');
    expect(a, 'المساعدُ غيرُ مُسجَّل').toBeTruthy();
    expect(a!.scopes, 'كاتبُ نصوصٍ أُعطيَ بياناتَ تشغيل').toEqual([]);
    expect(a!.pii, 'كاتبُ نصوصٍ أُعطيَ بياناتَ عميل').toBe(false);
    expect(a!.promptJob).toBe('landing_copy');
  });

  it('and its permission is one this product actually has', () => {
    const a = assistantByKey('landing_copy')!;
    // The landing content route is the one that saves what this proposes,
    // so the person who may ask is the person who may save.
    expect(a.needs).toBe('landing_pages.edit');
  });

  it('and no two assistants share a key, and no two jobs do either', () => {
    expect(new Set(ASSISTANTS.map((a) => a.key)).size).toBe(ASSISTANTS.length);
    expect(new Set(AI_JOBS.map((j) => j.key)).size, 'مفتاحُ وظيفةٍ مكرَّر — resolvePrompt يَأخذُ الأوّل').toBe(
      AI_JOBS.length
    );
  });
});
