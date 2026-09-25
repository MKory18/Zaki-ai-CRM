/**
 * THE SERVICE WORKER — AND THE ONE THING IT MUST NEVER DO.
 *
 * A service worker's usual trick is to hold on to a failed request and
 * replay it when the network comes back. In this system that trick writes
 * money. An agent taps "confirm" in a lift with no signal, the request is
 * queued, and forty minutes later — after somebody else cancelled the
 * order, after the stock was given to another customer, after the shift
 * ended — it fires. A wallet movement, a shipment, a commission accrual,
 * all from a tap nobody remembers making against a world that has moved.
 *
 * So: this worker NEVER touches a request that changes anything. No POST,
 * no PATCH, no PUT, no DELETE is intercepted, cached, retried or queued.
 * Offline, they fail — loudly, immediately, in front of the person who made
 * them, who is the only one who can decide what to do instead.
 *
 * What it does do is keep the shell readable: the app opens, the screens
 * draw, and a clear line says the connection is gone. Reading something
 * slightly stale while disconnected is useful. Writing something silently
 * later is not.
 */

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const OFFLINE_URL = '/offline.html';

/** Only what is safe to serve from yesterday. */
const PRECACHE = [OFFLINE_URL, '/logo.svg', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Anything that is not a plain read. */
function changesSomething(request) {
  return request.method !== 'GET' && request.method !== 'HEAD';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // THE RULE. Not intercepted at all: no cache, no retry, no queue. The
  // browser's own failure reaches the code that made the call, which is the
  // only place that knows what the person was trying to do.
  if (changesSomething(request)) return;

  // An API read is never served stale — a stale order list is a list
  // somebody acts on. It either comes from the network or it fails, and the
  // screen says which.
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first, and the offline page when there is none.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      })
    );
    return;
  }

  // Static assets: cache first, because a font that arrives late is a page
  // that reflows under somebody's finger.
  if (url.origin === self.location.origin && /\.(?:css|js|woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((cache) => cache.put(request, copy));
            }
            return res;
          })
      )
    );
  }
});
