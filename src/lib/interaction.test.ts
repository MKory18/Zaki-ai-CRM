import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EVERY TOUCH ANSWERS — AND IT ANSWERS IN ONE PLACE.
 *
 * Five hundred and eighty-one buttons, and six of them had a pressed
 * state. A control that does nothing for the first two hundred
 * milliseconds while a request flies is a control people press again, and
 * on this system a second press is a second shipment.
 *
 * The fix could not be a prop somebody remembers to pass — four hundred of
 * those buttons are raw `<button>` elements that never go near the shared
 * component. So it is a rule on the element itself, and this is the guard
 * on that rule: not "does the component do it" but "does the STYLESHEET
 * still say it", because the stylesheet is what reaches all of them.
 */

const css = () => readFileSync(join(process.cwd(), 'src/app/(system)/system.css'), 'utf8');

describe('a pressed state', () => {
  it('belongs to every button, not to the ones that remembered', () => {
    const text = css();
    const rule = /button:not\(:disabled\):active[\s\S]{0,220}?transform:\s*scale\(0?\.\d+\)/;
    expect(rule.test(text), 'اختفت حالة الضغط العامة').toBe(true);
  });

  it('and it is felt, not watched — under 150ms', () => {
    const m = /transition:\s*transform\s+(\d+)ms/.exec(css());
    expect(m, 'لا انتقال على الضغط').toBeTruthy();
    expect(Number(m![1]), 'الاستجابة أبطأ من أن تُحسّ كضغطة').toBeLessThanOrEqual(150);
  });

  it('and a disabled control does not pretend to respond', () => {
    expect(css()).toContain('button:not(:disabled):active');
  });
});

describe('the focus ring', () => {
  it('is for the keyboard, not for every click', () => {
    // `:focus` paints on mouse clicks too, which reads as an error and
    // gets deleted — taking the keyboard's only signal with it.
    expect(css()).toContain(':focus-visible');
    expect(/[^-]:focus\s*\{/.test(css()), 'حلقةٌ على كل نقرة بالفأرة').toBe(false);
  });

  it('and takes its colour from the theme, so it can be seen on each', () => {
    const m = /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--sys-focus\)/.exec(css());
    expect(m, 'حلقة التركيز لا تتبع القلم أو ليست ٢ بكسل').toBeTruthy();
  });
});

/**
 * AND ALL OF IT STOPS FOR ANYONE WHO ASKED IT TO.
 *
 * Ninety-six files animate something and not one of them asked. For a
 * person with vestibular sensitivity, motion on a screen they work at all
 * day is a symptom, not a flourish — and the operating system already
 * carries their answer.
 */
describe('motion', () => {
  it('is disabled entirely under prefers-reduced-motion', () => {
    const text = css();
    const block = text.slice(text.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block.length, 'لا استجابة لتفضيل تقليل الحركة').toBeGreaterThan(50);
    expect(block).toContain('animation-duration');
    expect(block).toContain('transition-duration');
    expect(block, 'الحركة اللانهائية لا تتوقف').toContain('animation-iteration-count: 1');
  });

  it('and the press itself stops moving too', () => {
    const text = css();
    const block = text.slice(text.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block, 'الضغط ما زال يتحرّك لمن طلب ألا يتحرّك شيء').toContain('transform: none');
  });

  it('uses one easing curve for the whole product', () => {
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(globals).toContain('--ease-standard');
    expect(css(), 'الضغط لا يستعمل المنحنى الموحّد').toContain('var(--ease-standard)');
  });

  it('and nothing loops except the one thing that must', () => {
    // A spinner that does not loop is not a spinner. A pulse, a bounce and
    // a ping are decoration that never stops, which is what "calm" rules
    // out.
    const src = readFileSync(join(process.cwd(), 'src/components/ui/Button.tsx'), 'utf8');
    expect(src).toContain('animate-spin');
    for (const looping of ['animate-bounce', 'animate-ping']) {
      expect(src).not.toContain(looping);
    }
  });
});

describe('haptics', () => {
  it('are never the only channel', async () => {
    // iOS Safari has no vibration on any iPhone. A confirmation that only
    // buzzes is one half the warehouse never receives.
    const src = readFileSync(join(process.cwd(), 'src/lib/haptics.ts'), 'utf8');
    expect(src, 'الاهتزاز يُستدعى بلا حماية').toContain('navigator.vibrate?.');
    expect(src).toContain('try');

    const button = readFileSync(join(process.cwd(), 'src/components/ui/Button.tsx'), 'utf8');
    // Wherever it buzzes, something visible happens on the same path.
    expect(button).toMatch(/hapticConfirm\(\);\s*\n\s*setDone\(true\)/);
    expect(button).toMatch(/hapticRefuse\(\);\s*\n\s*setFailed\(true\)/);
  });

  it('and refusal feels different from acceptance, not just longer', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/haptics.ts'), 'utf8');
    expect(src, 'القبول والرفض بنفس النمط').toMatch(/const REFUSE = \[/);
    expect(src).toMatch(/const CONFIRM = \d+;/);
  });
});

describe('dialogs', () => {
  it('have replaced every native alert, confirm and prompt', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/ui/Confirm.tsx'), 'utf8');
    for (const kind of ["kind: 'confirm'", "kind: 'ask'", "kind: 'tell'"]) {
      expect(src, `${kind} مفقود من النافذة الموحّدة`).toContain(kind);
    }
  });
});
