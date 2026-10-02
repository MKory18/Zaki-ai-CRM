'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A FAILURE ABOVE EVERY LAYOUT, SHOWN TO SOMEBODY WE CANNOT NAME.
 *
 * This is the page behind `src/app/error.tsx` and `src/app/global-error.tsx`
 * — the two boundaries that catch a throw in a SEGMENT LAYOUT or in the
 * root layout itself. Next does not let a segment's own `error.tsx` catch
 * its sibling `layout.tsx`, so when `(system)/layout.tsx` cannot resolve a
 * session, or `s/layout.tsx` cannot start the tracking engine, the failure
 * arrives here and nowhere closer.
 *
 * WHICH IS WHY IT IS IN NO ONE'S BRAND. At this height the visitor could be
 * a warehouse agent or a shopper who tapped an advert, and the two must not
 * be shown each other's product. `PublicNotFound` beside this file answers
 * the same question for a dead address and answers it the same way: plain
 * page, neutral colours, no stylesheet and no font of anyone's.
 *
 * AND NO STYLESHEET IS NOT A PREFERENCE, IT IS THE CONSTRAINT. A
 * `global-error` replaces the root layout, so it renders its own document
 * and Next's docs are explicit that it does NOT receive the app's global
 * styles. A Tailwind class or a `--sys-*` token written here would resolve
 * to nothing on the one page whose whole job is to still work when the rest
 * does not — unreadable text on an unpainted background, at the exact
 * moment the product is already failing. Every rule is inline.
 *
 * NO ICON, DELIBERATELY. An error boundary is a Client Component, so
 * whatever it imports is bundled into the routes it covers — and this one
 * covers every route in the product, a shopper's shelf included. A
 * `@remixicon` import here would pull the dashboard's icon chunk (32.7 KB
 * gzipped of path data, measured in `quality-gates`) onto a storefront page
 * that draws none of it. That is the same regression the root
 * `not-found.tsx` was moved to undo, and `ShopNotFound` and
 * `PublicNotFound` both draw their dead ends with no icon for this reason.
 */
export function NeutralError({ retry }: { retry?: () => void }) {
  const routed = usePathname();

  /**
   * THE ADDRESS IS WHAT THE WAY BACK IS BUILT FROM, SO IT IS READ TWICE.
   *
   * `usePathname()` is the router's answer and the right one under
   * `error.tsx`. Under `global-error.tsx` the root layout has been replaced,
   * and whether the router's context survives that is not a thing to
   * assume — a hook that quietly returns null would cost this page the only
   * link on it. So the document is asked when the hook has nothing.
   */
  const [here, setHere] = useState(routed ?? '');
  useEffect(() => {
    if (!here && typeof window !== 'undefined') setHere(window.location.pathname);
  }, [here]);

  const parts = here.split('/').filter(Boolean);
  // `/s/<slug>/…` — the same reading as `ShopNotFound`, which cannot have
  // the shop as a param either and takes it from where the visitor stands.
  const shop = parts[0] === 's' && /^[a-z0-9-]{2,60}$/.test(parts[1] ?? '') ? parts[1] : null;
  const advert = parts[0] === 'lp';

  /**
   * THE WAY BACK IS AN ANCHOR, NOT A SOFT NAVIGATION.
   *
   * `retry()` re-renders this boundary's children, and a `<Link>` hands the
   * move to the router that is already inside the broken tree. Both re-run
   * the layout that just threw, so both can fail in exactly the same way
   * and leave the person pressing a button that visibly does nothing. A
   * plain `<a>` is a fresh document request: the server runs the layout
   * again from the start, which is the one thing that recovers a dropped
   * connection or an expired session.
   *
   * The retry button stays, because a transient render failure below a
   * healthy layout is real and recovers without a round trip. It is the
   * second offer, not the only one.
   */
  const back = shop
    ? { href: `/s/${shop}`, label: 'العودة إلى المتجر' }
    : advert
      ? // An advert's visitor has nowhere else in this product to be sent:
        // `/` is the seller's back office, and offering it to a shopper is
        // the leak `theme-isolation` exists to stop. Their page, afresh.
        { href: here, label: 'إعادة فتح الصفحة' }
      : here
        ? { href: '/', label: 'العودة إلى شاشتك الأولى' }
        : null;

  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: '#fafafa', color: '#1f2937',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>تعذّر فتح هذه الصفحة</h1>
        <p style={{ fontSize: 15, lineHeight: 1.8, margin: '0 0 20px', color: '#6b7280' }}>
          حدث خطأ أثناء تحميل الصفحة، ولم يكتمل فتحها. المشكلة من عندنا لا من عندك، وغالباً
          تكون مؤقتة.
        </p>

        {/*
          WHAT WAS NOT WRITTEN, SAID OUT LOUD.

          The same sentence `OfflineWatch` and `offline.html` carry, for the
          same reason: somebody who believes their confirmation, shipment or
          cash movement was «saved» will not do it again, and it simply never
          happened. A page that failed to load wrote nothing — but only a
          person who is TOLD that knows it.
        */}
        <p style={{ fontSize: 13, lineHeight: 1.8, margin: '0 0 20px', color: '#6b7280' }}>
          لم يُحفَظ شيء. إن كنت في منتصف إجراء، أعِده من جديد بعد فتح الصفحة.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {back ? (
            <a
              href={back.href}
              style={{
                display: 'inline-block', minHeight: 44, padding: '12px 20px', borderRadius: 8,
                background: '#1f2937', color: '#fafafa', fontSize: 14, fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {back.label}
            </a>
          ) : null}
          {retry ? (
            <button
              type="button"
              onClick={() => retry()}
              style={{
                minHeight: 44, padding: '12px 20px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', color: '#1f2937', fontSize: 14, fontWeight: 600,
                border: '1px solid #d1d5db', fontFamily: 'inherit',
              }}
            >
              أعد المحاولة
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
