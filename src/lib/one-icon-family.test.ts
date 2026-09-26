import { describe, expect, it } from 'vitest';
import { dashboardFiles, repoFile, stripComments, stripTemplates } from './guard-source';

/**
 * ONE ICON FAMILY — AND THE EMOJI THAT WERE A SECOND ONE.
 *
 * Eighty-nine of them, across sixteen screens. An emoji is not an icon: it
 * is drawn by the operating system, so «🚚» is a flat outline on this desk,
 * a coloured sticker on the phone in the warehouse, and a third drawing
 * again on a Mac. It cannot take the theme's colour — it arrives with its
 * own — it cannot mirror for Arabic, and it never matches the stroke of the
 * icon sitting next to it.
 *
 * Most of them were not even a second icon. They were the SAME icon twice:
 *
 *   <RiCheckLine /> {'✅ تأكيد الطلب'}
 *
 * — a check from the icon set, and a check from the font, in one button.
 *
 * The three exceptions below are marks a company owns, and this codebase
 * does not get to redraw somebody else's logo.
 */

/**
 * A BRAND'S OWN MARK, WHICH IS NOT OURS TO REDRAW.
 *
 * Meta's «f» and Google's «G» are letters set in the brand's colour, beside
 * the pixel ID each one belongs to — the same reason `one-palette` lets
 * seven third-party hexes through. They are identity, not iconography, and
 * a person pasting a TikTok pixel ID needs to recognise TikTok.
 *
 * TikTok's ♪ and Snapchat's 👻 were emoji, and those two ARE in the icon
 * set — `RiTiktokFill`, `RiSnapchatFill` — so they became real icons.
 */
const BRAND_MARKS = '/src/components/settings/TrackingPixelsSection.tsx';

/**
 * Emoji, dingbats, the geometric shapes people reach for as bullets, and
 * the two tick/cross characters that look like an icon and are not:
 * ✓ U+2713, ✔ U+2714, ✕ U+2715, ✖ U+2716, ✅, ❌, ⚠, ↩.
 */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{21A9}\u{21AA}\u{25A0}-\u{25FF}]/u;

describe('an icon', () => {
  it('comes from the icon set, never from the operating system', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboardFiles('both')) {
      if (rel === BRAND_MARKS) continue;
      for (const [i, line] of stripComments(src).split('\n').entries()) {
        const m = EMOJI.exec(line);
        if (m) offenders.push(`${rel}:${i + 1}  ${m[0]}  ${line.trim().slice(0, 70)}`);
      }
    }
    expect(
      offenders,
      `رمزٌ تعبيريّ مكان أيقونة (${offenders.length}):\n${offenders.slice(0, 20).join('\n')}`
    ).toEqual([]);
  });

  it('and the two brand marks that stay are letters, not emoji', () => {
    const src = stripComments(repoFile(BRAND_MARKS));
    // Meta's f and Google's G remain, set in the brand's own colour.
    expect(src).toContain('#1877f2');
    // TikTok and Snapchat came from the icon set in the end.
    expect(src).toContain('RiTiktokFill');
    expect(src).toContain('RiSnapchatFill');
    // And nothing there is an emoji any more.
    expect(EMOJI.test(src), 'علامةٌ تجاريّةٌ رُسمت برمزٍ تعبيريّ').toBe(false);
  });
});

/**
 * AND THE ✕ THAT CLOSES A MESSAGE IS ONE COMPONENT.
 *
 * Six screens had written it by hand, each with no accessible name and a
 * target about 12px wide. `DismissButton` is the one of them.
 */
describe('dismissing a message', () => {
  it('is the shared button, not a glyph in a <button>', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboardFiles('both')) {
      if (rel === '/src/components/ui/DismissButton.tsx') continue;
      // Templates go too: the landing-page editor documents Zaki Actions
      // with `<button data-zaki-action="…">…</button>` inside a <pre>, and
      // a code sample a seller READS is not a control this app renders.
      const body = stripTemplates(stripComments(src));
      // A <button> whose entire content is one character is an icon-only
      // control that named nothing and could not be hit with a thumb.
      for (const m of body.matchAll(/<button\b[^>]*>\s*([^\s<>{}])\s*<\/button>/g)) {
        offenders.push(`${rel}: <button>${m[1]}</button>`);
      }
    }
    expect(offenders, `زرُّ إغلاقٍ مكتوبٌ باليد:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and it is a 44px target with a name', () => {
    const src = repoFile('src/components/ui/DismissButton.tsx');
    expect(src, 'لا اسمَ يُقرأ').toContain('aria-label');
    // 44px — h-11 w-11 — grown outwards with -m-2 so the mark does not move.
    expect(src).toMatch(/h-11 w-11/);
    expect(src).toContain('RiCloseLine');
  });
});
