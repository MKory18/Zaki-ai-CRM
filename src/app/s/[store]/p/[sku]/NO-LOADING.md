# Why this route has no `loading.tsx`

A `loading.tsx` opens a Suspense boundary, and a streamed response has
already sent its status line by the time the page inside it resolves. So
`notFound()` thrown in a page under a loading file cannot set the status:
the browser — and Googlebot — are told **200**, with the not-found page in
the body.

Measured on this route, in development and in a production build:

| route | with `loading.tsx` | without |
|---|---|---|
| `/s/main/p/NOPE` | `200` | `404` |

A product page is the page a shop is found by. Telling a search engine that
every mistyped or retired product URL is a live page is a worse thing to do
to a seller than making them look at a blank screen for 200 ms.

The shelf (`../../shop/loading.tsx`) keeps its skeleton, because the only
`notFound()` reachable under it is "no such shop", and that decision was
moved up into `src/app/s/[store]/layout.tsx`, which runs before the
boundary. A `sku` is not a segment that layout can read, so the same move
is not available here.

If this route is ever given a skeleton, the product's existence has to be
settled outside the boundary first — a parallel route, a `generateMetadata`
that already resolves it, or a segment config that opts this route out of
streaming. Until one of those exists, the file stays absent on purpose.
