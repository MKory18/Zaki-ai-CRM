import { describe, expect, it } from 'vitest';
import { dashboardFiles, stripComments } from './guard-source';

/**
 * A FUNCTION THE CALLER WROTE IN PLACE IS A NEW FUNCTION EVERY RENDER.
 *
 * This cost three real defects, and all three were invisible: nothing threw,
 * nothing logged, and every test passed.
 *
 *   • `Modal` listed `onClose`. 63 places render it and 73 pass the closer as
 *     an arrow written in place, so the effect that locks page scroll and
 *     traps focus tore down and set up again on EVERY render of the parent —
 *     releasing the scroll lock and pulling the caret out of the field
 *     somebody was typing in. Reported as «the page is stuck and I cannot
 *     scroll until I click on the screen».
 *
 *   • `ScanSheet`'s `accept` listed `onScan` and `onClose`, and the effect
 *     that opens the CAMERA lists `accept`. All three call sites pass an
 *     arrow in place, so every render of the screen above stopped the video
 *     tracks, closed the reader, and asked the browser for the lens again.
 *
 *   • `Toast`'s line listed `onDone`, so each arriving toast restarted the
 *     dismiss countdown of every toast already on screen.
 *
 * WHAT MAKES IT HARMFUL IS THE CLEANUP, WHICH IS WHY THIS IS NOT A BAN ON
 * DEPENDING ON A FUNCTION.
 *
 * A first version of this guard flagged every `on*` prop in every dependency
 * list, and it found three more — two in `CommandPalette` and one in
 * `Button`. Reading them, all three are harmless: they are callbacks used in
 * click handlers, no effect depends on them, and a fresh identity costs
 * nothing. A guard that fires on sound code is a guard somebody edits around,
 * so it was narrowed to the shape that actually does damage:
 *
 *   an effect WITH A CLEANUP whose dependencies reach a caller's function,
 *   either directly or through one `useCallback` in between.
 *
 * That shape catches all three real defects and none of the three innocents.
 *
 * A sweep of all 36 effects that have a cleanup and a non-empty dependency
 * list found every other one sound: their loaders are `useCallback` over
 * primitives or over `[]`, and `useOrderOwnership`'s heartbeat chain is
 * stable end to end.
 */

/** A function supplied from outside, by this codebase's naming convention. */
const CALLER_FN = /^on[A-Z]\w*$/;

interface Hook {
  line: number;
  kind: 'effect' | 'callback';
  /** For a callback, the name it was assigned to. */
  name: string | null;
  hasCleanup: boolean;
  deps: string[];
}

function hooks(src: string): Hook[] {
  const body = stripComments(src);
  const out: Hook[] = [];
  for (const m of body.matchAll(/\b(?:const\s+(\w+)\s*=\s*)?(?:React\.)?use(Effect|LayoutEffect|Callback|Memo)\(/g)) {
    let i = m.index! + m[0].length - 1;
    let depth = 0;
    let end = -1;
    while (i < body.length) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
      i++;
    }
    if (end < 0) continue;
    const inner = body.slice(m.index! + m[0].length, end);
    // No `s` flag: there is no `.` here to widen, and the flag needs es2018.
    const dep = /,\s*\[([^\]]*)\]\s*$/.exec(inner);
    if (!dep) continue;
    out.push({
      line: body.slice(0, m.index).split('\n').length,
      kind: /Effect$/.test(`use${m[2]}`) ? 'effect' : 'callback',
      name: m[1] ?? null,
      hasCleanup: /return\s*(?:\(\s*\)\s*=>|function\b)/.test(inner) || /return\s+\w+;?\s*$/.test(inner.trim()),
      deps: dep[1]
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean),
    });
  }
  return out;
}

describe('an effect that undoes something', () => {
  it('never depends on a function the caller wrote in place', () => {
    const offenders: string[] = [];

    for (const { rel, src } of dashboardFiles('both')) {
      const all = hooks(src);
      const callbacks = new Map(all.filter((h) => h.kind === 'callback' && h.name).map((h) => [h.name!, h]));

      for (const effect of all) {
        if (effect.kind !== 'effect' || !effect.hasCleanup) continue;
        for (const d of effect.deps) {
          if (CALLER_FN.test(d)) {
            offenders.push(`${rel}:${effect.line}  الأثر يعتمد على ${d} مباشرةً`);
            continue;
          }
          // One hop: the effect depends on a local callback, and that
          // callback depends on the caller's function. This is the shape the
          // camera was released by, and it is invisible at the effect.
          const via = callbacks.get(d);
          const reached = via?.deps.filter((x) => CALLER_FN.test(x)) ?? [];
          if (reached.length) {
            offenders.push(`${rel}:${effect.line}  الأثر ← ${d} ← ${reached.join('، ')}`);
          }
        }
      }
    }

    expect(
      offenders,
      'أثرٌ له تنظيفٌ يعتمد على دالّةٍ من المُستدعي — هويّتُها جديدةٌ في كلِّ ' +
        `رسمة، فالتنظيفُ يُنفَّذ معها. احفظها في ref واقرأها وقتَ الحدث:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  /**
   * And the three that were fixed keep reading their ref at event time.
   *
   * Without this, removing the ref and the dependency together would satisfy
   * the rule above and restore the bug the other way round: the effect would
   * close over a stale closer for ever.
   */
  it('and the three that hold a ref still read it when the event happens', () => {
    const files = dashboardFiles('both');
    for (const [rel, ref, reader] of [
      ['/src/components/ui/Modal.tsx', 'onCloseRef', 'onCloseRef.current()'],
      ['/src/components/ui/Toast.tsx', 'onDoneRef', 'onDoneRef.current(toast.id)'],
      ['/src/components/scan/ScanButton.tsx', 'onScanRef', 'onScanRef.current(code)'],
    ]) {
      const file = files.find((f) => f.rel === rel);
      expect(file, `${rel} غير موجود`).toBeTruthy();
      const src = stripComments(file!.src);
      expect(src, `${rel}: لا ${ref}`).toMatch(
        new RegExp(`const ${ref} = (?:React\\.)?useRef\\(`)
      );
      expect(src, `${rel}: ${ref} لا يُقرأ وقت الحدث`).toContain(reader);
    }
  });
});
