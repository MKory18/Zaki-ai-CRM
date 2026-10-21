import './system.css';
import { arabic, arabicLatin, publicSans, systemFontVars } from './fonts';
import { sanitizeTheme, themeByKey, themeStyle } from '@/lib/system-themes';
import { decorCss, sanitizeDecor } from '@/lib/theme-decoration';
import { shapeCss } from '@/lib/theme-shape';
import { headingFontCss } from '@/lib/theme-heading-font';
import { DecorVisibility } from '@/components/shell/ThemeDecor';

/**
 * The system's look around a subtree: its stylesheet, its fonts on the
 * document root (a dialog portalled into <body> reads them too), and the
 * person's chosen THEME.
 *
 * The theme is an attribute rendered on the server, not a class set by a
 * script after load. A theme applied by script flashes the default first,
 * and a dashboard that flashes white at somebody who chose the dark one
 * does it every single time they open a page.
 *
 * Unknown or missing falls back to the default rather than to nothing: a
 * stored typo must not render a screen with no colours at all.
 */
export function SystemFrame({
  children,
  theme,
  railed,
  decor,
}: {
  children: React.ReactNode;
  theme?: string | null;
  /** Folded sidebar, from this browser's cookie. Rendered, never scripted. */
  railed?: boolean;
  /** off · light · full, from this browser's cookie. See theme-decoration.ts. */
  decor?: string | null;
}) {
  /**
   * ── THE PALETTE OF THE ONE THEME THIS PERSON CHOSE ──
   *
   * `system.css` carries the default and «تلقائي» and nothing else, so
   * eleven palettes do not ship to everybody for the sake of the one they
   * picked. See `SHEET_THEMES`. This is in the same HTML response as the
   * markup it paints, so the first paint is already right: no script, no
   * flash, and no second request.
   *
   * Empty string for the default and for «تلقائي» — the sheet has them —
   * and empty for an unknown key, so a stored typo adds nothing.
   */
  const key = sanitizeTheme(theme);
  const palette = themeStyle(key);
  /*
   * ── AND THE AMBIENT TOUCH, FOR THE PEOPLE WHO WANT ONE ──
   *
   * Written here for the same reason the palette is: somebody who turned
   * decoration off downloads none of it, and the stylesheet that reaches
   * everybody does not grow. Three places are allowed and they are the
   * three where nothing is being measured — never behind a table, a
   * figure of money or a stock count. See `theme-decoration.ts`.
   */
  const level = sanitizeDecor(decor);
  const chosen = themeByKey(key);
  const ambient = decorCss(chosen, level, key);
  /*
   * ── AND ITS SHAPE ──
   *
   * The card's corner, its edge, the arch two themes wear and the faint
   * corner glyph. Written here for the same reason as the palette: a
   * shape nobody chose is weight on everybody. It is the FRAME only —
   * never a drawing behind a figure, which is the owner's own line.
   * See src/lib/theme-shape.ts.
   */
  const shape = shapeCss(chosen);
  /*
   * ── AND ITS TITLES' FACE, FOR THE TWO THEMES THAT HAVE ONE ──
   *
   * Reem Kufi on `h1`–`h3` under the two Islamic themes, and nothing for
   * the other nine: written here, for the one theme rendered, for the same
   * reason as the three above — a fourth `next/font` family would be weight
   * in the first-load sheet for everybody. See src/lib/theme-heading-font.ts.
   */
  const headings = headingFontCss(chosen);

  return (
    <div
      data-sys-theme={key}
      data-rail={railed ? '1' : undefined}
      className={`${systemFontVars} flex min-h-screen flex-col bg-[var(--sys-background)] text-[var(--sys-foreground)]`}
    >
      <style>{`:root{--font-arabic:${arabic.style.fontFamily};--font-arabic-latin:${arabicLatin.style.fontFamily};--font-public-sans:${publicSans.style.fontFamily}}${palette}${shape}${headings}${ambient}`}</style>
      {/* Only the «full» level animates, so only it needs pausing. */}
      {level === 'full' && <DecorVisibility />}
      {children}
    </div>
  );
}
