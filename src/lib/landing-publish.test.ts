import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { publishQuestion } from './landing-publish';
import { stripComments } from './guard-source';

/**
 * «النشر بتأكيد» — AND THE PRESS THAT NEEDS IT MORE IS THE OTHER ONE.
 *
 * Publishing was a toggle in two places and neither asked. The sentences
 * live in one module because two sets of words is how one button comes to
 * promise something the other does not, and these tests are mostly about
 * WHAT the sentence has to say rather than that a dialog appears.
 */

const ADDRESS = 'https://shop.example/lp/belt';

describe('going live', () => {
  it('names the address, because «نشر» means «at this address»', () => {
    expect(publishQuestion(true, ADDRESS).body).toContain(ADDRESS);
  });

  it('says the editor will be saved first, when the editor holds anything', () => {
    // Publishing writes the page before it flips the flag, so this press can
    // publish edits the seller had not decided to publish.
    const q = publishQuestion(true, ADDRESS, true);
    expect(q.body).toMatch(/سيُحفظ ما في المحرّر أوّلاً/);
    expect(q.body).toMatch(/وما لم تقرّر نشره بعد سيُنشر معها/);
  });

  it('and does not claim a save that is not going to happen', () => {
    expect(publishQuestion(true, ADDRESS, false).body).not.toMatch(/سيُحفظ/);
  });

  it('is not dressed as destructive — it is the ordinary act', () => {
    expect(publishQuestion(true, ADDRESS).tone).toBe('normal');
  });
});

describe('coming down', () => {
  it('leads with the paid clicks, which is the consequence nobody thinks of', () => {
    const q = publishQuestion(false, ADDRESS);
    expect(q.body).toMatch(/إعلان/);
    expect(q.body).toMatch(/مدفوعة/);
    // A page an advert points at is the normal case for a published page,
    // so the warning is in the first sentence rather than a footnote.
    expect(q.body.indexOf('مدفوعة')).toBeLessThan(q.body.indexOf('الطلباتُ السابقة'));
  });

  it('says the orders and the numbers survive, because losing them is the fear', () => {
    expect(publishQuestion(false, ADDRESS).body).toMatch(/الطلباتُ السابقة وأرقامُ الصفحة تبقى/);
  });

  it('is marked destructive, which is what colours the button', () => {
    expect(publishQuestion(false, ADDRESS).tone).toBe('danger');
  });

  it('and its button does not say the same word as publishing’s', () => {
    // Two dialogs whose confirm buttons read alike are one dialog people
    // stop reading.
    expect(publishQuestion(false, ADDRESS).confirmLabel).not.toBe(
      publishQuestion(true, ADDRESS).confirmLabel
    );
  });
});

describe('both buttons ask', () => {
  const screens = [
    'src/components/screens/LandingPageEditorScreen.tsx',
    'src/components/screens/LandingPagesScreen.tsx',
  ];

  it.each(screens)('%s asks before it flips the flag', (file) => {
    const src = stripComments(readFileSync(file, 'utf8'));

    // The guard is about ORDER, not about the import existing: a screen that
    // called the API and then asked would be a screen that published and
    // then enquired. So the confirm must come before the PATCH in the same
    // function body.
    const toggle = src.slice(src.indexOf('togglePublish'));
    const asked = toggle.indexOf('publishQuestion(');
    const flipped = toggle.indexOf('isPublished:');
    expect(asked, 'لا سؤال قبل النشر').toBeGreaterThan(-1);
    expect(flipped).toBeGreaterThan(-1);
    expect(asked).toBeLessThan(flipped);
  });

  it.each(screens)('%s stops when the answer is no', (file) => {
    const src = stripComments(readFileSync(file, 'utf8'));
    const toggle = src.slice(src.indexOf('togglePublish'));

    // THE BUG THIS CATCHES: `await confirm(…)` whose answer is never read —
    // the dialog appears, the seller presses «إلغاء», and the page publishes
    // anyway. Two screens write it two ways (`const ok = …; if (!ok) return;`
    // and `if (!(await confirm(…))) return;`), so what is asserted is that
    // the answer is NEGATED and RETURNED ON within a few lines of being
    // asked for. It does not prove the early return is reachable; the two
    // order guards above and the dialog's own tests carry that.
    const at = toggle.indexOf('await confirm(publishQuestion(');
    expect(at).toBeGreaterThan(-1);
    const near = toggle.slice(at, at + 160);
    expect(near, 'الجواب لا يُقرأ').toMatch(/!/);
    expect(near, 'لا خروج عند الرفض').toMatch(/return;/);
  });
});
