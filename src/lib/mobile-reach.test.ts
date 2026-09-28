import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './guard-source';

/**
 * TWO THINGS A THUMB COULD NOT REACH.
 *
 *   THE ASSISTANT SAT ON «المزيد». Its button is `fixed … end-4` with a
 *   48px body; at `bottom-4` it spanned 16–64px while the phone's bar
 *   occupies 0 to its own height, at a LOWER z-index. So the floater
 *   covered the bar's last item — on the same side it is anchored to.
 *
 *   THE STORE CHIP DID NOTHING. The switch beside it was `hidden md:block`,
 *   so on a phone the chip was a bordered box with a store icon and a name
 *   that answered no tap: «خانة تبديل المتاجر لا يمكن أن تضغط عليها».
 *
 * Both fixes are about one number and one target, not about adding
 * controls: the bar's height is declared once and read by whatever floats
 * above it, and the chip that was already there became the control it
 * looked like.
 */

const ROOT = process.cwd();
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

describe('the assistant clears the phone’s bar', () => {
  it('by reading the bar’s own height, not a guess', () => {
    const dock = read('src/components/ai/AiDock.tsx');
    // Both the button and the open panel.
    const uses = dock.match(/var\(--sys-mobile-nav-h\)/g) ?? [];
    expect(uses.length, 'المساعد يحمل تخميناً خاصاً به').toBeGreaterThanOrEqual(2);
    expect(dock, 'عاد إلى ١٦ بكسل من الأسفل').not.toMatch(/fixed bottom-4/);
    // The inset is added on top: the bar pads itself with it separately.
    expect(dock).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it('and the bar publishes that height', () => {
    const css = readFileSync(join(ROOT, 'src/app/(system)/system.css'), 'utf8');
    expect(css).toMatch(/--sys-mobile-nav-h:\s*calc\(/);
    const nav = read('src/components/shell/MobileNav.tsx');
    expect(nav, 'الشريط لا يلتزم بالارتفاع الذي يُنشر عنه').toMatch(
      /min-h-\[var\(--sys-mobile-nav-h\)\]/
    );
  });

  it('and a desk, which has no bar, is left alone', () => {
    expect(read('src/components/ai/AiDock.tsx')).toMatch(/md:!bottom-4/);
  });
});

describe('the store chip', () => {
  const header = () => read('src/components/shell/Header.tsx');

  it('is the switch, on a phone as much as on a desk', () => {
    const src = header();
    expect(src).toMatch(/href="\/entry\?change=1"/);
    /**
     * The old shape was a control that existed only above 768px. Asserted
     * on THIS element, not on the file: the logout button is `hidden
     * md:block` on purpose — it lives in the palette on a phone, and a
     * blanket ban would have caught a decision that is not this one.
     */
    const at = src.indexOf('href="/entry?change=1"');
    const element = src.slice(Math.max(0, at - 400), at + 400);
    expect(element, 'التبديل ما زال مخفياً على الهاتف').not.toMatch(/hidden md:/);
  });

  it('and is a real tap target, named for a screen reader', () => {
    const src = header();
    expect(src).toMatch(/min-h-11 md:min-h-0/);
    expect(src).toMatch(/aria-label=\{`المتجر الحالي/);
  });

  it('and adds no second control for the same command', () => {
    const src = header();
    // One link to the entry picker, not a chip plus an icon beside it.
    expect((src.match(/href="\/entry\?change=1"/g) ?? []).length).toBe(1);
  });

  it('and still shows plainly when there is nothing to switch to', () => {
    // A single store is not a dead link: it renders as a plain box.
    expect(header()).toMatch(/context\.canSwitch \? \(/);
  });
});
