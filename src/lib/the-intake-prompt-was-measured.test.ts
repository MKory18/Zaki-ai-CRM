import { describe, expect, it } from 'vitest';
import { AI_JOBS, resolvePrompt } from './ai-prompts';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE THREE THINGS EVERY LOCAL MODEL GOT WRONG, AND WHY THAT WAS OUR FAULT.
 *
 * The order-intake door asks for a model on the owner's own machine —
 * `localOnly: true`, because the pasted text carries a customer's name,
 * phone and address. No such model had ever been configured, so the door
 * had refused every time since it was written and the deterministic
 * parser did all the work.
 *
 * On 21/10 one was finally pointed at it, and the job was run against
 * three of them on five invented messages. Scores barely moved between
 * models. What moved was the PROMPT: the same three mistakes appeared on
 * all three, and all three were sentences we had not written.
 *
 *   ① «المفرق الحي الشرقي» on a line labelled «العنوان:» left
 *     `governorate` empty. Rule 4 said «the city as HE named it, not as
 *     you think it is», and every model read that as «only when he
 *     labels it».
 *   ② «تلات علب» — three, in Levantine — came back as 4. Nothing said
 *     a quantity could be spelled.
 *   ③ `source` was invented: «الطلب», «رسالة الزبون». The schema says
 *     «source is the page name» and never says what to do when there is
 *     no page. It is a field that lands in the order record.
 *
 * Measured after: the fast model went from 14/16 fields to 18/19, and
 * from 5.5s average to 1.7s, on the same five messages with the same
 * weights. Not a better model — a prompt that answered the questions the
 * old one left open.
 *
 * This file pins those three, because they are invisible: a prompt that
 * loses them still looks like a reasonable prompt, and the only thing
 * that would notice is a seller re-typing a governorate every day.
 * ═══════════════════════════════════════════════════════════════════════
 */

const intake = () => resolvePrompt('order_intake', {});

describe('the intake prompt answers what the measurement found', () => {
  it('— the governorate may be sitting inside the address line', () => {
    expect(intake(), 'القاعدة الخامسة راحت').toMatch(/سطر العنوان/);
    expect(intake()).toContain('governorate');
  });

  it('and a quantity may be spelled, in the Levantine the sellers use', () => {
    const p = intake();
    for (const word of ['تلات', 'تنين', 'خمس']) {
      expect(p, `«${word}» مش مذكورة فالموديل بيخمّن`).toContain(word);
    }
  });

  it('and `source` is left empty rather than invented', () => {
    /*
     * The one that actually writes a wrong value into an order. The
     * others leave a field empty for somebody to fill; this one fills it
     * with a sentence the model made up.
     */
    expect(intake(), 'ما في شي بيمنع اختراع المصدر').toMatch(/source[\s\S]*فارغاً/);
    expect(intake()).toMatch(/لا تسمِّ الرسالةَ نفسها/);
  });

  it('and the product text does not carry the quantity twice', () => {
    expect(intake()).toMatch(/productQuery[\s\S]*بلا كمية/);
  });
});

describe('and the job is still the job it was', () => {
  it('— the four original rules are all still there', () => {
    /*
     * The additions are ADDITIONS. «Do not guess what is not written» is
     * the rule the whole door rests on, and a rewrite that drops it to
     * make room for the new ones would trade a silent gap for a
     * confident wrong answer.
     */
    const p = intake();
    expect(p).toContain('لا تخمّن ما ليس مكتوباً');
    expect(p).toContain('كما كُتب، بلا تنسيق');
    expect(p).toContain('وإلا فواحدة');
    expect(p).toContain('لا كما تظنها');
  });

  it('and it still says JSON only, which is the whole contract', () => {
    expect(intake()).toMatch(/JSON فقط/);
  });

  it('and the job still declares the slot the editor offers', () => {
    const job = AI_JOBS.find((j) => j.key === 'order_intake')!;
    expect(job.slots).toContain('{text}');
  });
});
