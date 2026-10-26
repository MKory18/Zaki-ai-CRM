/**
 * Leave the page for another address — one named place, so a test can see it happen (jsdom will not let
 * `location.assign` be replaced) and so «the page sends the customer away» has one spelling to search for.
 */
export function leaveFor(url: string): void {
  window.location.assign(url);
}
