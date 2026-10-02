'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A SHOPPER'S FAILURE, INSIDE THE SHOP.
 *
 * WHY IT IS AT `[store]` AND NOT AT `s`. A boundary at `s/` would sit ABOVE
 * `s/[store]/layout.tsx` — and that layout exists for one reason, written
 * out in its own header: it carries `dir={store.dir}` and
 * `lang={store.language}` so that a page drawn in place of the real one
 * still reads the way the seller's shop reads. A shop selling in English
 * mirrors on all of its pages; a boundary placed one segment higher would
 * replace that layout and hand the shopper a right-to-left apology on a
 * left-to-right shop. That is the defect `ltr-direction.test.ts` was
 * written for, and the reason `not-found.tsx` sits at this same depth.
 *
 * Placed here it covers every storefront page and their layouts below it —
 * the shelf, a product, the cart, checkout, thanks, track, and the shop's
 * own static pages. One file: they are one audience with one way back.
 *
 * WHAT CATCHES THE LAYOUT ITSELF. Nothing here can: an `error.tsx` never
 * wraps the `layout.tsx` beside it. A throw in `s/[store]/layout.tsx`
 * reaches `src/app/error.tsx`, which is neutral on purpose and reads the
 * shop out of the address exactly as this file does.
 *
 * AND IT DECLARES NO DIRECTION. The whole point of the paragraph above is
 * that the direction is the SHOP's. A `dir="rtl"` written here would
 * override the one thing this file was placed at this depth to inherit —
 * which is the literal line `ltr-direction` asserts about `ShopNotFound`.
 */
export default function StoreError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const path = usePathname() ?? '';
  // `/s/<slug>/…`. An `error.tsx` is handed no route params, so the shop is
  // read from where the visitor is standing — the same reading, and for the
  // same reason, as `ShopNotFound`.
  const parts = path.split('/').filter(Boolean);
  const slug = parts[0] === 's' && /^[a-z0-9-]{2,60}$/.test(parts[1] ?? '') ? parts[1] : null;

  useEffect(() => {
    console.error('[storefront-boundary]', error.digest ?? '(no digest)', error);
  }, [error]);

  return (
    <main
      className="flex min-h-[60vh] items-center justify-center px-4 py-16"
      /**
       * THE SHOP'S COLOURS, WITH A COLOUR TO FALL BACK ON — AND THE
       * FALLBACK IS THE POINT.
       *
       * `--store-*` is set by `StorefrontShell`, which renders INSIDE each
       * page. This boundary replaces that page, so at the moment it draws,
       * the shop's theme has never been applied and every one of those
       * variables is undefined. A bare `var(--store-page)` then resolves to
       * nothing: transparent on transparent, and the apology is invisible.
       * The second argument is what makes this page legible on the one
       * occasion it is ever shown.
       */
      style={{ background: 'var(--store-page, #fafafa)', color: 'var(--store-text, #1f2937)' }}
    >
      <div
        className="w-full max-w-sm space-y-5 p-8 text-center"
        style={{
          background: 'var(--store-card, #ffffff)',
          border: '1px solid var(--store-border, #e5e7eb)',
          borderRadius: 'var(--store-radius, 10px)',
        }}
      >
        <h1 className="text-lg font-bold">تعذّر عرض هذه الصفحة</h1>
        <p className="text-sm" style={{ color: 'var(--store-muted, #6b7280)' }}>
          حدث خطأ أثناء تحميل الصفحة. المشكلة من المتجر لا من جهازك، وغالباً تكون مؤقتة.
        </p>

        {/*
          A SHOPPER IS TOLD ABOUT THEIR ORDER, NOT ABOUT OUR WRITES.

          The staff screens say «nothing was saved» because a warehouse
          agent who thinks a shipment was kept will not redo it. The
          equivalent worry here is narrower and more frightening to the
          person having it: did I just pay twice. A page that failed to load
          placed no order, and saying so is the difference between a shopper
          who tries again and one who abandons a basket in case they did.
        */}
        <p className="text-sm" style={{ color: 'var(--store-muted, #6b7280)' }}>
          لم يُسجَّل أي طلب من هذه الصفحة. يمكنك إعادة المحاولة بأمان.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {slug ? (
            // A full document request, not a `<Link>`: a soft navigation
            // hands the move to the router inside the tree that just threw.
            // `ShopNotFound` offers nothing when there is no slug in the
            // path, and for the same reason this does not either — a button
            // to a shop whose name we do not know is a second dead end
            // handed to somebody who has already hit one.
            <a
              href={`/s/${slug}`}
              className="inline-block px-5 py-3 text-sm font-bold"
              style={{
                background: 'var(--store-accent, #1f2937)',
                color: 'var(--store-accent-text, #fafafa)',
                borderRadius: 'var(--store-radius, 10px)',
                textDecoration: 'none',
              }}
            >
              العودة إلى المتجر
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            className="px-5 py-3 text-sm font-bold"
            style={{
              background: 'transparent',
              color: 'var(--store-text, #1f2937)',
              border: '1px solid var(--store-border, #e5e7eb)',
              borderRadius: 'var(--store-radius, 10px)',
              // `fontFamily`, not the `font` shorthand: the shorthand resets
              // font-size too and would quietly beat `text-sm` on the class.
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            أعد المحاولة
          </button>
        </div>
      </div>
    </main>
  );
}
