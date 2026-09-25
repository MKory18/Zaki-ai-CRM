import './system.css';
import { tajawal, publicSans, systemFontVars } from './fonts';
import { sanitizeTheme } from '@/lib/system-themes';

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
export function SystemFrame({ children, theme }: { children: React.ReactNode; theme?: string | null }) {
  return (
    <div
      data-sys-theme={sanitizeTheme(theme)}
      className={`${systemFontVars} flex min-h-screen flex-col bg-[var(--sys-background)] text-[var(--sys-foreground)]`}
    >
      <style>{`:root{--font-arabic:${tajawal.style.fontFamily};--font-public-sans:${publicSans.style.fontFamily}}`}</style>
      {children}
    </div>
  );
}
