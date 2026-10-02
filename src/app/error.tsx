'use client';

import { useEffect } from 'react';
import { NeutralError } from '@/components/public/NeutralError';

/**
 * THE BOUNDARY FOR A SEGMENT LAYOUT THAT THREW.
 *
 * WHY THIS FILE EXISTS AT ALL, GIVEN THE THREE BELOW IT. Next's own
 * reference is explicit: an `error.tsx` wraps its segment's `page`,
 * `loading`, `not-found` and every NESTED layout — but not the `layout.tsx`
 * sitting beside it in the same segment. So `(system)/error.tsx` cannot
 * catch `(system)/layout.tsx`, and that layout awaits `getCurrentUser()`
 * and `cookies()`: a database that is refusing connections throws there, on
 * the single most-visited path in the product, and the throw lands above
 * every boundary in the tree. The same is true of `s/layout.tsx` and
 * `lp/layout.tsx`.
 *
 * Without this file that failure goes to `global-error.tsx`, which throws
 * the whole document away — no `lang`, no `dir`, no stylesheet — to report
 * a fault in one segment while the document itself was perfectly healthy.
 * This boundary renders INSIDE the root layout, so the page stays an Arabic
 * right-to-left document and only the broken segment is replaced.
 *
 * It is also the boundary for every page under `/lp`. A landing page needs
 * no file of its own: `lp/layout.tsx` is a tracking provider and sets no
 * direction and no theme, so a boundary placed at `lp/` would render exactly
 * what this one renders. The audience is told apart by the address instead —
 * see `NeutralError`, which refuses to offer `/` to a shopper.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    /**
     * The digest is the only thing that ties this screen to the server log.
     * A Server Component's message is replaced by a generic one in
     * production on purpose, so without the digest printed here a report of
     * «الصفحة لا تفتح» cannot be matched to the stack that caused it.
     */
    console.error('[root-boundary]', error.digest ?? '(no digest)', error);
  }, [error]);

  return <NeutralError retry={retry} />;
}
