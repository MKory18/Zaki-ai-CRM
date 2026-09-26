/**
 * THE SIDEBAR'S WIDTH IS A CSS VARIABLE, NOT A PIECE OF REACT STATE.
 *
 * Folded, the sidebar is a 76px rail of icons and the page beside it gains
 * 204px — on a 1366px laptop that is the difference between a table showing
 * six columns and showing nine. So people fold it and leave it folded, which
 * means the choice has to be applied on the FIRST frame.
 *
 * React cannot do that on its own: the server has no way to know what this
 * browser remembered, so a `useEffect` would render the wide sidebar, paint
 * it, then snap 204px narrower — every navigation, every reload. The same
 * objection the theme carries in SystemFrame, and the same standard: a look
 * that flashes the wrong thing first is not applied, it is corrected.
 *
 * AND THE ANSWER IS THE ONE THE THEME ALREADY USES: A COOKIE.
 *
 * It was an inline script reading `localStorage` before paint. That works,
 * and React objects to it on every single page load — «Scripts inside React
 * components are never executed when rendering on the client» — printing an
 * error into the console that then hides real ones. Moving the tag from the
 * client component to the server layout did not silence it.
 *
 * A cookie is sent with the request, so the SERVER can render the attribute
 * in the HTML, exactly as it renders the theme. No script, no flash, no
 * error. What it costs is one cookie, carrying one character.
 *
 * Nothing here decides access, and nothing is sent anywhere a request was
 * not already going: it is this browser's own preference about a width.
 */

export const RAIL_COOKIE = 'osm_rail';

/** A year. A preference about a sidebar does not expire with a session. */
const KEEP = 60 * 60 * 24 * 365;

/**
 * Announced, because two controls fold the same menu.
 *
 * The button in the sidebar's own header, and the command in the palette.
 * The width is CSS and follows either one, but the sidebar also keeps a
 * React copy — for the tooltips and the names it puts on the icons — and a
 * copy that only one of the two controls updates is a rail of unnamed
 * glyphs half the time.
 */
export const RAIL_EVENT = 'osm:rail';

/** Did this browser leave the sidebar folded? */
export function railed(): boolean {
  try {
    return document.documentElement.getAttribute('data-rail') === '1'
      || document.cookie.includes(`${RAIL_COOKIE}=1`);
  } catch {
    // A browser that refuses cookies gets the wide sidebar, which is the
    // one that needs no explanation.
    return false;
  }
}

/** Remember it, apply it to the document, and say so — in one breath. */
export function setRailed(on: boolean): void {
  try {
    document.cookie = `${RAIL_COOKIE}=${on ? '1' : '0'}; path=/; max-age=${KEEP}; SameSite=Lax`;
  } catch {
    // Remembering is a convenience. Folding still works for this visit.
  }
  try {
    const root = document.querySelector('[data-sys-theme]') ?? document.documentElement;
    if (on) root.setAttribute('data-rail', '1');
    else root.removeAttribute('data-rail');
    window.dispatchEvent(new CustomEvent(RAIL_EVENT, { detail: on }));
  } catch {
    /* no document: nothing to fold */
  }
}
