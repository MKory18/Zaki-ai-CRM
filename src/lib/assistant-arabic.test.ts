import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './guard-source';
import { AI_JOBS } from './ai-prompts';

/**
 * THE ASSISTANT ANSWERS IN ARABIC.
 *
 * Reported twice. The prompts were Arabic all along — what was English was
 * everything AROUND them:
 *
 *   `askAiAssistant` wrapped the question in «Business Metrics Context:»
 *   and «User Question:», so the model read English headings, an English
 *   JSON blob and one Arabic sentence. The rule said «أجب بنفس لغة
 *   السؤال», which in that prompt is a genuinely open question.
 *
 *   The daily summary demanded a JSON schema written in English WITH
 *   ENGLISH EXAMPLE VALUES — «Concise executive overview paragraph». A
 *   model shown an English schema fills it in English.
 *
 * So the rule now names the language outright, and nothing a human will
 * read is framed in English. The extraction engine in ai-intake is the one
 * exception and is deliberate: its output is parsed, never read, and it is
 * already told to keep the Arabic text it was given.
 */

const ROOT = process.cwd();
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

describe('every default prompt', () => {
  it('is written in Arabic', () => {
    // Two carry no default on purpose: the house prompt is whatever the
    // seller writes above every assistant, and the landing-page job is
    // driven by its slots. An empty default is not an English one.
    for (const job of AI_JOBS.filter((j) => j.default.trim())) {
      expect(/[؀-ۿ]/.test(job.default), `تعليمات «${job.label}» ليست بالعربية`).toBe(true);
    }
    expect(AI_JOBS.filter((j) => j.default.trim()).length, 'لا تعليماتِ افتراضيةً أصلاً').toBeGreaterThan(3);
  });

  it('and the two that answer a person in prose pin the language outright', () => {
    for (const key of ['assistant', 'advisor']) {
      const job = AI_JOBS.find((j) => j.key === key)!;
      expect(job.default, `«${job.label}» لا يُلزم العربية`).toContain('بالعربية');
      // «the same language as the question» is not a rule when the prompt
      // around it is in two languages.
      expect(job.default).not.toContain('بنفس لغة السؤال');
    }
  });
});

describe('what is wrapped around the question', () => {
  it('is Arabic in the assistant', () => {
    const src = read('src/lib/ai.ts');
    expect(src).toContain('سؤال المستخدم:');
    expect(src, 'ما زال الإطار إنجليزياً').not.toContain('User Question:');
    expect(src).not.toContain('Business Metrics Context');
  });

  it('and Arabic in the daily summary, values and all', () => {
    const src = read('src/lib/ai.ts');
    expect(src).toContain('هذه أرقام أداء المتجر');
    expect(src, 'أمثلةُ المخطّط إنجليزية فيكتب النموذج بالإنجليزية').not.toContain(
      'Concise executive overview'
    );
    // The KEYS stay English because the parser reads them — and the model
    // is told so, rather than left to guess and translate them.
    expect(src).toContain('"summary"');
    expect(src).toContain('لا تترجمها');
  });

  it('and Arabic in the intelligence panel — both halves of the frame', () => {
    const src = read('src/app/api/growth/intelligence/ask/route.ts');
    // Anchored to the message itself: «السؤال:» alone still passed while
    // the heading above it had been turned back into «Data:».
    expect(src).toMatch(/user: `البيانات:[\s\S]{0,120}السؤال: /);
  });
});

/**
 * A sweep, so the next English frame is caught where it is written rather
 * than after somebody reads an English answer on a screen.
 */
describe('no English frame reaches a model', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) files.push(rel);
    }
  };
  walk('src/lib');
  walk('src/app/api');

  it('in any prompt a person will read the answer to', () => {
    const offenders = files.filter((f) => {
      // The order-intake engine is exempt and says why: its output is
      // parsed, not read, and it is told to keep the Arabic it was given.
      if (f.endsWith('src/app/api/orders/ai-intake/route.ts')) return false;
      const src = read(f);
      return /(content|user|system): `(Here is|You are|Always|Return|Extract|Business|Analyze)/.test(src);
    });
    expect(offenders, `إطارٌ إنجليزيّ يصل النموذج:\n${offenders.join('\n')}`).toEqual([]);
  });
});
