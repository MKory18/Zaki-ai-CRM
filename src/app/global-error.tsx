'use client';

import { NeutralError } from '@/components/public/NeutralError';

/**
 * THE LAST BOUNDARY — THE ROOT LAYOUT ITSELF FAILED.
 *
 * `src/app/error.tsx` covers a segment layout. Nothing covers the root
 * layout except this file, because a boundary cannot catch the layout it is
 * rendered inside. When `src/app/layout.tsx` throws there is no document
 * left to patch, so this one replaces it whole — which is why the `<html>`
 * and `<body>` tags are written here by hand rather than inherited.
 *
 * IT LOADS NOTHING. Next's reference states that `global-error` does not
 * receive the app's global styles, and the root layout it is standing in
 * for is the only place `globals.css` was imported. Importing a stylesheet
 * here would also mean this page depends on the build output being intact —
 * on the very screen whose purpose is to render when something
 * fundamental has broken. `NeutralError` writes every rule inline for that
 * reason.
 *
 * `lang` and `dir` are repeated rather than assumed: they live on the root
 * layout's `<html>`, and that element is exactly what is missing here. An
 * Arabic sentence in a left-to-right document puts its full stop on the
 * wrong side, which is a small thing that reads as a broken page on top of
 * a broken page.
 *
 * NO `retry` IS PASSED, AND THAT IS THE HONEST ANSWER. `retry()` re-renders
 * this boundary's children — the root layout — in the same client that just
 * failed to render it. Offering a button that re-runs the exact code that
 * threw, with nothing changed, is offering a button that does nothing. The
 * way back `NeutralError` draws is a plain anchor: a fresh request the
 * server answers from the start.
 *
 * `metadata` cannot be exported from a Client Component, so the title is
 * React's own `<title>` element — the alternative Next's docs name for this
 * file.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  // Not an effect: there is no layout above this to defer to, and a
  // `global-error` that renders at all is already the report-worthy event.
  console.error('[global-boundary]', error.digest ?? '(no digest)', error);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0 }}>
        <title>تعذّر فتح الصفحة — Zaki AI OMS</title>
        <NeutralError />
      </body>
    </html>
  );
}
