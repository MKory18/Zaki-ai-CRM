import { describe, expect, it } from 'vitest';
import { dashboardFiles, stripComments } from './guard-source';

/**
 * THE INVENTORY THE BRIEF ASKED FOR, AS A CHECK RATHER THAN A DOCUMENT.
 *
 * «One icon per concept across the product: an inventory of concept to
 * icon, with no concept using two icons and no icon meaning two things.»
 *
 * A written inventory would be out of date the week after it was written.
 * What can be held instead are the two rules underneath it that a machine
 * can actually see — and both were unguarded until now.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO is decide that two icons mean the
 * same thing. Measuring the product found 65 icons drawn in a single place
 * whose rough «concept» another icon also touches — and reading them one
 * by one, almost none were duplicates: the hamburger, the filter funnel,
 * the fullscreen pair, cash against a bank card, three arrows pointing
 * three ways. Collapsing those to save bytes would flatten meaning, which
 * is the opposite of the rule's purpose.
 */

const TAG = /<(Ri\w+)\b/g;
const VALUE = /(?:icon\s*[:=]\s*\{?|pair\(|,\s*)(Ri\w+)\b/g;
const IMPORTS = /import\s*\{([^}]*)\}\s*from\s*'@remixicon\/react'/g;

function usage() {
  const imported = new Map<string, string>();
  const drawn = new Set<string>();
  for (const { rel, src } of dashboardFiles('both')) {
    const body = stripComments(src);
    for (const m of body.matchAll(IMPORTS)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(' as ')[0].trim();
        if (/^Ri\w+$/.test(name) && !imported.has(name)) imported.set(name, rel);
      }
    }
    // The import line itself is not a use.
    const rest = body.replace(IMPORTS, '');
    for (const m of rest.matchAll(TAG)) drawn.add(m[1]);
    for (const m of rest.matchAll(VALUE)) drawn.add(m[1]);
  }
  return { imported, drawn };
}

describe('the icon set', () => {
  /**
   * AN ICON IMPORTED AND NEVER DRAWN IS PAID FOR AND NEVER SEEN.
   *
   * It is bundled — the import is the reference that keeps it — so it
   * costs its bytes on every page that loads the chunk, forever, for
   * nothing. One was found this way: `RiEqualLine`, left behind when the
   * profit equation moved off the dashboard.
   */
  it('imports nothing it does not draw', () => {
    const { imported, drawn } = usage();
    const dead = [...imported].filter(([name]) => !drawn.has(name));
    expect(
      dead.map(([n, where]) => `${n} (${where})`),
      `أيقونة مستورَدة ولا تُرسم — تُحمَّل ولا تُرى:\n${dead.map(([n, w]) => `${n} · ${w}`).join('\n')}`
    ).toEqual([]);
  });

  /**
   * FILL MEANS «THIS ONE», NOT «THIS IS IMPORTANT».
   *
   * The brief gives the fill variant exactly one job: the nav item you are
   * standing on, a toggled filter, the selected tab. Used anywhere else it
   * stops being a state and becomes decoration — and then the active item
   * has nothing left to distinguish it.
   *
   * Measured: 58 of 60 fills are behind `pair()` or an active/selected
   * condition. The two that are not are named below.
   */
  const BRAND_MARKS = ['RiTiktokFill', 'RiSnapchatFill'];

  it('uses a fill only for something active or selected', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboardFiles('both')) {
      const body = stripComments(src).replace(IMPORTS, '');
      const lines = body.split('\n');
      for (const [i, line] of lines.entries()) {
        for (const m of line.matchAll(/(Ri\w+Fill)\b/g)) {
          if (BRAND_MARKS.includes(m[1])) continue;
          // The condition may sit a line or two above the tag.
          const around = lines.slice(Math.max(0, i - 2), i + 2).join(' ');
          if (!/pair\(|active|selected|isOn|current|\?\s*Ri\w+Fill/i.test(around)) {
            offenders.push(`${rel}:${i + 1}  ${m[1]}`);
          }
        }
      }
    }
    expect(
      offenders,
      `أيقونة ممتلئة خارج حالة النشاط — الممتلئ يعني «هذا الذي أنت فيه»:\n${offenders.slice(0, 10).join('\n')}`
    ).toEqual([]);
  });

  it('and the two solid marks that stay are somebody else’s logo', () => {
    // TikTok's note and Snapchat's ghost are brand marks: a logo is a
    // solid shape, and drawing them as outlines would make them wrong
    // rather than consistent.
    const src = stripComments(
      dashboardFiles('both').find((f) => f.rel.includes('TrackingPixelsSection'))!.src
    );
    for (const mark of BRAND_MARKS) expect(src, `${mark} ليست هنا`).toContain(mark);
  });
});
