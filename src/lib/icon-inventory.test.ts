import { describe, expect, it } from 'vitest';
import { dashboardFiles, shopperFiles, stripComments } from './guard-source';

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

/**
 * BOTH FAMILIES, AND PER FILE — which is what an import actually is.
 *
 * This read `^Ri\w+$` only, so **lucide-react was entirely unguarded** —
 * and lucide is what the landing-page tree draws with, which is the public
 * page the performance budget is about. It also pooled «drawn» across the
 * whole product, so an icon imported in one file and drawn in a different
 * one counted as used. An ES import is per MODULE: a name imported into a
 * file and never mentioned again in that file is a reference the bundler
 * keeps in THAT file's chunk, whatever any other file does.
 *
 * MEASURED when both holes were closed: **17 dead imports**, 14 Remix and
 * 3 lucide — six of them in `OrderDetailModal.tsx` alone, and one
 * (`CheckCircle2`) in the public order form every customer loads.
 *
 * A mention is a mention: drawn as a tag, handed to a prop, sitting in a
 * map. This asks whether the name appears at all once the import lines are
 * taken out, rather than listing the shapes a use can have — the shape
 * list is what let `icon: Something` slip past before.
 */
const ICON_IMPORTS = /import\s*\{([^}]*)\}\s*from\s*'(?:@remixicon\/react|lucide-react)'/g;

/**
 * THE WHOLE PRODUCT, because this is a rule about BYTES and not about look.
 *
 * `dashboardFiles` leaves the seller's surfaces out on purpose — they are
 * left-to-right, they carry their own fonts, and a styling rule written for
 * the dashboard would be a rule about a page nobody sees that way. None of
 * that applies to «imported and never drawn»: the shopper's landing page is
 * the one with a performance budget on it, so it is the page where an icon
 * paid for and never seen matters MOST. `shopperFiles` is its half.
 */
const everyFile = () => [...dashboardFiles('both'), ...shopperFiles('both')];

/** Every icon a file imports and then never mentions, as `name (file)`. */
function deadImports(): string[] {
  const dead: string[] = [];
  for (const { rel, src } of everyFile()) {
    const body = stripComments(src);
    const rest = body.replace(ICON_IMPORTS, '');
    for (const m of body.matchAll(ICON_IMPORTS)) {
      for (const part of m[1].split(',')) {
        const raw = part.trim();
        // `type Foo` is erased at compile time and costs nothing.
        if (!raw || raw.startsWith('type ')) continue;
        const name = raw.split(' as ')[0].trim();
        if (!/^[A-Z]\w*$/.test(name)) continue;
        if (!new RegExp(`\\b${name}\\b`).test(rest)) dead.push(`${name} (${rel})`);
      }
    }
  }
  return dead;
}

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
  it('imports nothing it does not draw, in either family, file by file', () => {
    const dead = deadImports();
    expect(dead, `أيقونة مستورَدة ولا تُرسم — تُحمَّل ولا تُرى:\n${dead.join('\n')}`).toEqual([]);
  });

  it('and the sweep reaches both families, not only the dashboard’s', () => {
    /*
     * The guard that reads only `Ri…` passes a file full of unused lucide
     * imports and says the icon set is clean. So the reach is asserted:
     * lucide is imported somewhere under the scan, and the pattern that
     * finds imports matches it.
     */
    const seen = everyFile().filter((f) => f.src.includes("from 'lucide-react'"));
    expect(seen.length, 'لا ملفَّ lucide داخل المسح — الحارس يرى عائلةً واحدة').toBeGreaterThan(0);
    expect("import { Check } from 'lucide-react';").toMatch(ICON_IMPORTS);
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

  /**
   * AN ICON'S NAME INSIDE A STRING IS NOT AN ICON.
   *
   * Two were found, both left by a global rename that walked out of the JSX
   * and into text a person reads:
   *
   *   • a button labelled «Retry RiShipLine», which is the name of its own
   *     icon where the word «Shipping» used to be;
   *   • and worse, a WhatsApp setup message listing «RiPhoneLine Number ID»
   *     among the environment variables to set — telling somebody to
   *     configure a variable that does not exist. That one was a copy of a
   *     list the settings screen already holds correctly, so the copy went
   *     rather than the word.
   *
   * A rename cannot see the difference between a component and a sentence.
   * This can.
   */
  it('never leaves an icon name inside a string a person reads', () => {
    const LIT = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
    const offenders: string[] = [];
    for (const { rel, src } of dashboardFiles('both')) {
      for (const [i, line] of stripComments(src).split('\n').entries()) {
        if (!line.includes('Ri')) continue;
        for (const m of line.matchAll(LIT)) {
          const body = m[1] ?? m[2] ?? '';
          const hit = /Ri[A-Z]\w*(?:Line|Fill)\b/.exec(body);
          if (hit) offenders.push(`${rel}:${i + 1}  ${hit[0]}  «${body.trim().slice(0, 60)}»`);
        }
      }
    }
    expect(
      offenders,
      `اسم أيقونة داخل نصٍّ يقرأه إنسان:\n${offenders.join('\n')}`
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
