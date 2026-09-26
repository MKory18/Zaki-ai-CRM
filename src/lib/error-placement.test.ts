import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A FAILED ACTION AND A FAILED LOAD ARE NOT THE SAME MESSAGE.
 *
 * Two hundred and eighty `setError` calls across sixty-six files, all
 * rendering the same red strip in the same place: the top of the screen.
 *
 *   AN ACTION FAILED — a save, a send, a print, a payout. Somebody
 *   PRESSED something, and on a long form or a scrolled list the button is
 *   nowhere near the top. The press appears to do nothing, so it is
 *   pressed again — and on this system a second press is a second shipment.
 *   That message belongs where the press was.
 *
 *   A LOAD FAILED. Nothing else is on screen, the message IS the content,
 *   and a toast that fades would leave a blank panel behind.
 *
 * The first kind moved. The second stayed exactly where it was.
 *
 * AND ONE EXCEPTION, BECAUSE IT WAS ALREADY RIGHT.
 *
 * A modal whose footer carries the message beside its own submit button
 * has already solved this — the message IS where the press is. Moving it
 * to a toast would be motion for its own sake.
 */

const SELLERS = [
  '/components/landing/', '/components/public/', '/components/store/',
  '/app/(public)/', '/app/lp/', '/app/s/',
];

function dashboard(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.tsx') && !p.includes('.test.')) {
        const rel = `/${relative(process.cwd(), p).split('\\').join('/')}`;
        if (!SELLERS.some((s) => rel.includes(s))) out.push({ rel, src: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(join(process.cwd(), 'src', 'components'));
  return out;
}

describe('an error banner', () => {
  /**
   * The cost of moving a message is the strip left behind: markup, state
   * and a clear-on-open that can now only ever render nothing. Dead code
   * that LOOKS like error handling is worse than none — the next person
   * reads it and believes the screen reports failures.
   */
  it('is never something the screen can no longer set', () => {
    const dead: string[] = [];
    for (const { rel, src } of dashboard()) {
      const at = src.indexOf('const [error, setError]');
      if (at === -1) continue;
      const body = src.slice(at + 'const [error, setError]'.length);
      const sets = (body.match(/setError\(/g) ?? []).length;
      const clears = (body.match(/setError\(null\)/g) ?? []).length;
      const shown = /\{\s*error\s*(?:&&|\?)|\{error\}/.test(body);
      if (shown && sets === clears) dead.push(rel);
    }
    expect(dead, `شريطُ خطأٍ لا يمكن أن يظهر:\n${dead.join('\n')}`).toEqual([]);
  });

  it('and a save that fails says so where the button is', () => {
    // Not every screen — only that the ones converted stayed converted.
    for (const rel of [
      'src/components/screens/GeoSettingsScreen.tsx',
      'src/components/screens/finance/WalletsScreen.tsx',
      'src/components/screens/finance/ClosingScreen.tsx',
      'src/components/screens/ShippingBatchesScreen.tsx',
      'src/components/orders/OrderNotes.tsx',
    ]) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src, `${rel}: فشلُ الحفظ ما زال في أعلى الشاشة`).toContain('toast.failed(');
    }
  });

  it('and a load that fails still says so where the content would be', () => {
    // The orders list keeps its own strip: when the list cannot load there
    // is nothing else on the screen, and a message that fades leaves a
    // blank page behind.
    const src = readFileSync(join(process.cwd(), 'src/components/screens/OrdersScreen.tsx'), 'utf8');
    expect(src).toContain("setError(e?.message || 'فشل تحميل الطلبات')");
    expect(src, 'شريط فشل التحميل أُزيل').toMatch(/\{error && \(/);
  });

  it('and the screens outside the shell keep their own, because there is no toast there', () => {
    // Sign-in, register, reset, and the entry picker run before a store is
    // chosen — there is no ToastProvider above them, and their forms are
    // short enough that the banner is already beside the button.
    for (const rel of [
      'src/app/(system)/login/page.tsx',
      'src/components/shell/EntryPicker.tsx',
    ]) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src, `${rel}: رسالةٌ إلى منطقةٍ غير موجودة`).not.toContain('useToast');
    }
  });
});
