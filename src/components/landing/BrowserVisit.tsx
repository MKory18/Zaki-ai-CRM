/**
 * «الصفحة انفتحت» — THE BROWSER'S COUNT OF A VISIT.
 *
 * A few bytes of inline script, in the page's own HTML, so it runs as the page is read — before the rest of the
 * JavaScript arrives, and so a visitor who leaves after a second is still counted, the way the server counted them.
 * It reports to `/api/public/lp-view`, which writes the browser's count beside the server's for the week of comparison
 * the owner asked for before the page is cached.
 *
 *   · The campaign is the `?c=` the visit arrived with — read here, because a cached page will not know it.
 *   · A page the browser prepared ahead of time (a prerender) is counted when it is actually SHOWN, not when it was
 *     prepared: `document.prerendering` and its `prerenderingchange` event.
 *   · `sendBeacon` where it exists — it outlives the page being closed — and a `keepalive` fetch where it does not.
 *
 * Rendered only for a visit: the seller's preview leaves it out, and the endpoint refuses an unpublished page anyway.
 *
 * `official` is set by the CACHED page only: that render has no server count, so its beacon is the visit itself
 * (`o:1`). A page built per request was already counted by the server, and its beacon stays a comparison — so turning
 * the cache on can never count one visit twice.
 */
export function BrowserVisit({ pageId, official = false }: { pageId: string; official?: boolean }) {
  const id = JSON.stringify(pageId);
  const js =
    `(function(){try{var u='/api/public/lp-view';var send=function(){` +
    `var b=JSON.stringify({p:${id},c:new URLSearchParams(location.search).get('c')${official ? ',o:1' : ''}});` +
    `if(navigator.sendBeacon&&navigator.sendBeacon(u,b))return;` +
    `fetch(u,{method:'POST',body:b,keepalive:true}).catch(function(){})};` +
    `if(document.prerendering){document.addEventListener('prerenderingchange',send,{once:true})}else{send()}` +
    `}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
