import { describe, expect, it } from 'vitest';
import { SHEET_THEMES, SYSTEM_THEMES } from './system-themes';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * NINE THEMES OUT OF ELEVEN NEVER ARRIVED.
 *
 * The owner, 21/10: «الثيم بيعلق».
 *
 * It was not a hang. You pressed a swatch, the swatches went disabled for
 * the length of a save, came back — and the colours were the old ones.
 * Nothing said why, so it reads as the screen being stuck.
 *
 * ── THE PALETTE SPLIT IS THE REASON, AND IT IS THE RIGHT DESIGN ──
 *
 * `system.css` carries the DEFAULT and «تلقائي» and nothing else, because
 * eleven palettes in the first-load stylesheet is ten kilobytes of
 * colours nine people in ten never see. Every other palette is written
 * into the document by `SystemFrame`, as ONE rule for the ONE theme the
 * server rendered.
 *
 * The picker switched `data-sys-theme` on the frame and called it
 * applied. For a theme the page carries no rule for, that finds nothing:
 * the frame goes on inheriting `:root`, which still holds the theme it
 * was rendered with. Only the two in the sheet ever changed live — and
 * even they left the body, the card shapes, the decoration and the
 * `theme-color` meta behind.
 *
 * So the fix is not to ship every palette again. It is to ask the SERVER
 * to render the page it has just been told to render.
 * ═══════════════════════════════════════════════════════════════════════
 */

const picker = () => stripComments(repoFile('src/components/settings/ThemePicker.tsx'));

describe('choosing a theme asks the server for it', () => {
  it('— the save is followed by a refresh, or the colours never come', () => {
    const src = picker();
    expect(src, 'الحفظ بيصير وما حدا بيطلب الألوان الجديدة').toContain('router.refresh()');
  });

  it('and it is a refresh, not a full reload of a heavy dashboard', () => {
    /*
     * `router.refresh()` re-renders the server components and keeps the
     * scroll, the open dialogs and everything the person had in hand.
     * `location.reload()` throws all of it away — for a setting somebody
     * changes about twice.
     */
    expect(picker(), 'إعادة تحميل كاملة للوحة').not.toContain('window.location.reload()');
  });

  it('and the save carries a timeout, so a dead request cannot freeze the swatches', () => {
    /*
     * A bare `fetch` has no timeout. A request that never answers leaves
     * every swatch disabled for ever — which IS a hang, and would have
     * been the second half of «بيعلق» on a bad connection.
     */
    const src = picker();
    expect(src).toContain("apiFetch('/api/profile/theme'");
    expect(src, 'نداء عارٍ بلا مهلة').not.toMatch(/\bfetch\('\/api\/profile\/theme'/);
  });
});

describe('and the split that caused it is still the design', () => {
  it('— the sheet carries two palettes, not eleven', () => {
    /*
     * This is why the refresh is the fix rather than shipping every
     * palette: the cap on the first-load stylesheet exists so a shopper
     * and a seller do not download ten kilobytes of colours nobody chose.
     */
    expect(SHEET_THEMES).toHaveLength(2);
    expect(SYSTEM_THEMES.length).toBeGreaterThan(2);
  });

  it('and the other nine are written by the frame, for the one theme rendered', () => {
    const frame = stripComments(repoFile('src/app/(system)/SystemFrame.tsx'));
    expect(frame).toContain('themeStyle(key)');
  });
});
