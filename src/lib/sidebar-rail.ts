/**
 * THE SIDEBAR'S WIDTH IS A CSS VARIABLE, NOT A PIECE OF REACT STATE.
 *
 * Folded, the sidebar is a 76px rail of icons and the page beside it gains
 * 204px — on a 1366px laptop that is the difference between a table showing
 * six columns and showing nine. So people fold it and leave it folded, which
 * means the choice has to be applied on the FIRST frame.
 *
 * React cannot do that. The server has no way to know what this browser
 * remembered, so a `useEffect` would render the wide sidebar, paint it, then
 * snap 204px narrower — every navigation, every reload. The same objection
 * the theme carries in SystemFrame, and the same standard: a look that
 * flashes the wrong thing first is not applied, it is corrected.
 *
 * So the LAYOUT is CSS driven by an attribute that an inline script sets
 * before the first paint, and React only supplies the things a frame of
 * delay cannot be seen in — a tooltip, an aria-label, which way the chevron
 * points. Nothing here decides access, and nothing here is sent anywhere:
 * it is one character in this browser's own storage.
 */

export const RAIL_KEY = 'osm.sidebar.rail';

/** Did this browser leave the sidebar folded? */
export function railed(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    // A browser that refuses storage gets the wide sidebar, which is the
    // one that needs no explanation.
    return false;
  }
}

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

/** Remember it, apply it to the document, and say so — in one breath. */
export function setRailed(on: boolean): void {
  try {
    localStorage.setItem(RAIL_KEY, on ? '1' : '0');
  } catch {
    // Remembering is a convenience. Folding still works for this visit.
  }
  try {
    if (on) document.documentElement.setAttribute('data-rail', '1');
    else document.documentElement.removeAttribute('data-rail');
    window.dispatchEvent(new CustomEvent(RAIL_EVENT, { detail: on }));
  } catch {
    /* no document: nothing to fold */
  }
}

/**
 * Runs before the first paint, from the markup. Deliberately tiny and
 * deliberately wrapped: a storage error here must not stop the page, and a
 * page whose sidebar is the wrong width is still a working page.
 */
export const RAIL_SCRIPT = `try{if(localStorage.getItem('${RAIL_KEY}')==='1')document.documentElement.setAttribute('data-rail','1')}catch(e){}`;
