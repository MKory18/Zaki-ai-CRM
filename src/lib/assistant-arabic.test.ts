import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { AI_JOBS } from './ai-prompts';

/**
 * THE ASSISTANT SPEAKS THE LANGUAGE OF THE PEOPLE WHO USE IT.
 *
 * The prompt was already Arabic and already says «أجب بنفس لغة السؤال», and
 * the grounded fallback — the answer built from our own numbers when no model
 * replies — was Arabic too. The English was the screen's own: its two
 * subtitles, its «Try asking:», and the six figures along the top, which are
 * the first thing anybody reads.
 *
 * And a second fault beside it, because a colour is a sentence too. «المؤكَّدة»,
 * «المُسلَّمة» and the confirmation rate were all painted in the danger colour —
 * the three pieces of good news on the row, in red, saying the opposite of the
 * numbers they stood over.
 */

const screen = () => stripComments(repoFile('src/components/screens/AssistantScreen.tsx'));

/**
 * Prose a person reads: the text of a label, a title or a subtitle, and the
 * words between two tags. Not class names, not props, not code.
 */
function latinProse(src: string): string[] {
  const out: string[] = [];
  const attr = /(?:title|subtitle|placeholder|aria-label)="([^"]{4,})"/g;
  const between = />\s*([A-Za-z][A-Za-z ,.'?!:%-]{5,})\s*</g;
  for (const re of [attr, between]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.push((m[1] ?? '').trim());
  }
  // Latin LETTERS and no Arabic. A first version of this helper reported the
  // Arabic replacements as findings, which would have made it pass by
  // accident on any screen and fail on this one for the wrong reason.
  return out.filter((t) => /[A-Za-z]/.test(t) && !/[؀-ۿ]/.test(t));
}

describe('nothing on the assistant screen is in English', () => {
  it('not a subtitle, not a label, not a word between two tags', () => {
    expect(latinProse(screen()), 'نصٌّ إنجليزيٌّ يقرؤه المستخدم').toEqual([]);
  });

  /** The six figures along the top are the first thing anybody reads. */
  it('and the figures along the top are named in Arabic', () => {
    const src = screen();
    for (const word of ['الطلبات', 'المؤكَّدة', 'المُسلَّمة', 'إيراد المُسلَّم', 'صافي الربح', 'نسبة التأكيد']) {
      expect(src, `«${word}» غير موجودة`).toContain(word);
    }
    for (const en of ['Orders', 'Confirmed', 'Delivered Revenue', 'Real Net Profit', 'Confirm Rate']) {
      expect(src, `«${en}» ما زالت`).not.toContain(`block">${en}<`);
    }
  });

  it('including the two subtitles and the prompt above the suggestions', () => {
    const src = screen();
    expect(src).toContain('ملخّصٌ محسوبٌ من الطلبات الحقيقيّة');
    expect(src).toContain('اسأل عن أداء متجرك');
    expect(src).toContain('جرّب أن تسأل:');
  });
});

describe('and the colours agree with the numbers', () => {
  it('good news is not painted as danger', () => {
    const src = screen();
    for (const [word, colour] of [
      ['المؤكَّدة', 'primary'],
      ['المُسلَّمة', 'success'],
      ['نسبة التأكيد', 'primary'],
    ] as const) {
      const at = src.indexOf(`block">${word}</span>`);
      expect(at, `«${word}» غير موجودة`).toBeGreaterThan(-1);
      const pill = src.slice(at, at + 220);
      expect(pill, `«${word}» ما زالت بلون الخطر`).not.toContain('--sys-destructive');
      expect(pill).toContain(`--sys-${colour}`);
    }
  });

  /** The one figure that can genuinely be bad news is told by its sign. */
  it('and the profit is red only when it is actually a loss', () => {
    const src = screen();
    expect(src).toMatch(/tone=\{Number\(metrics\.net_profit\) < 0 \? 'lost' : 'collected'\}/);
    expect(src, 'الربح مرسومٌ بالأحمر دائماً').not.toContain(
      'value={metrics.net_profit} className="text-[var(--sys-destructive)]'
    );
  });
});

describe('and the model is told to answer in the asker’s language', () => {
  it('which is the rule that keeps an Arabic question from an English reply', () => {
    const advisor = AI_JOBS.find((j) => j.key === 'advisor');
    expect(advisor, 'وظيفة المستشار غير معرَّفة').toBeTruthy();
    expect(advisor?.default, 'المطالبة لا تُلزم بلغة السؤال').toContain('أجب بنفس لغة السؤال');
  });

  /** And the answer built from our own numbers, when no model replies. */
  it('and the grounded fallback is written in Arabic', () => {
    const ai = stripComments(repoFile('src/lib/ai.ts'));
    const at = ai.indexOf('function groundedAnswer');
    const body = ai.slice(at, at + 2600);
    expect(body).toContain('صافي الربح');
    expect(body).toContain('نسبة التأكيد');
    expect(body, 'ردٌّ إنجليزيٌّ في الجواب الاحتياطي').not.toMatch(/add\('[A-Za-z]/);
  });
});
