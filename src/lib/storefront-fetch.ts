/**
 * THE SHOPPER'S FETCH.
 *
 * `apiFetch` is the dashboard's, and it redirects to `/login` on a 401 —
 * which would take a customer of a seller's shop to the seller's back
 * office sign-in page. A shopper has no session, no account and nothing to
 * sign in to; that redirect is the one behaviour a public page must not
 * have.
 *
 * What it keeps is the half that matters out here: a timeout. This shop
 * sells over slow connections on mid-range Android phones, and a request
 * with no deadline is a button that spins until the customer gives up and
 * decides the shop is broken.
 *
 * It sends no credentials either. There are none to send, and omitting
 * them keeps a public page from ever carrying a staff session into a
 * request a stranger triggered.
 */

/** Long enough for a slow connection, short enough to admit failure. */
export const SHOP_TIMEOUT_MS = 20_000;

export const SHOP_TIMEOUT_AR = 'انتهت المهلة. تحقّق من اتصالك وحاول ثانية.';

export async function shopFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, {
      credentials: 'omit',
      ...init,
      signal: AbortSignal.timeout(SHOP_TIMEOUT_MS),
    });
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === 'AbortError' || name === 'TimeoutError') throw new Error(SHOP_TIMEOUT_AR);
    throw e;
  }
}
