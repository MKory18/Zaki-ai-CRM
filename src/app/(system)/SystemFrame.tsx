import './system.css';
import { tajawal, publicSans, systemFontVars } from './fonts';

/**
 * The system's look around a subtree: its stylesheet, and its fonts set on
 * the document root (a dialog portalled into <body> reads them too).
 *
 * Used by the system layout, and by the root's 403 and 404 screens, which
 * render above every layout.
 */
export function SystemFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${systemFontVars} flex min-h-screen flex-col`}>
      <style>{`:root{--font-arabic:${tajawal.style.fontFamily};--font-public-sans:${publicSans.style.fontFamily}}`}</style>
      {children}
    </div>
  );
}
