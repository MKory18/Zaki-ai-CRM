'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * A PAGE THAT IS NOT THERE, IN THE SHOP'S OWN CLOTHES.
 *
 * Measured: a shopper who mistyped a product address got the DASHBOARD's
 * 404 — `SystemFrame`, the system's `--sys-*` colours, «الرابط الذي فتحته
 * ليس ضمن شاشات النظام», and a link to «شاشتك الأولى». A customer of a
 * seller's shop was shown the seller's back office and told about screens
 * they have never seen. That is the exact leak `theme-isolation.test.ts`
 * exists to stop, and it went unseen because `src/app/not-found.tsx` was on
 * neither of its two lists.
 *
 * WHY THE PATH AND NOT A PARAM. Next renders `not-found.tsx` without route
 * params, so the shop cannot be read the ordinary way. It CAN be read from
 * the address the visitor is standing on — `/s/<slug>/…` — which is enough
 * for the one thing this page owes them: a way back in.
 *
 * AND THERE IS NO SEARCH BOX. A search field here would post to a results
 * page that does not exist yet (the engine's search answers on
 * `/api/public/stores/[store]/search`, and the page for it comes with the
 * grid). A box that goes nowhere is a second dead end offered to somebody
 * who has already hit one.
 */
export function ShopNotFound() {
  const path = usePathname() ?? '';
  // `/s/<slug>/…` — the slug is the segment after `s`, when there is one.
  const parts = path.split('/').filter(Boolean);
  const slug = parts[0] === 's' && /^[a-z0-9-]{2,60}$/.test(parts[1] ?? '') ? parts[1] : null;

  return (
    <main
      // NO DIRECTION OF ITS OWN. `/s/[store]/layout.tsx` carries the shop's
      // own `dir`, and this page is drawn inside it — a `dir="rtl"` written
      // here was the one thing that could override a shop that reads the
      // other way, on the very page that already means something went
      // wrong.
      className="flex min-h-[60vh] items-center justify-center px-4 py-16"
      /*
       * EVERY STORE VARIABLE CARRIES A FALLBACK, because on this page none of
       * them is set.
       *
       * `StorefrontShell` writes the shop's palette INSIDE the page it wraps.
       * A 404 never reaches that page — `lp/[slug]/not-found.tsx` renders this
       * component with no shell above it — so `--store-page` and the rest
       * resolve to nothing. Measured in the browser on 2026-10-02:
       * `--store-page` undefined, background `rgba(0,0,0,0)`.
       *
       * Today it still READS: the text inherits black and the browser paints
       * white behind it. But the shop's own colours never appear on the one
       * page that is already saying something went wrong, and the day a
       * parent sets a dark background the black text goes with it.
       */
      style={{ background: 'var(--store-page, #fafafa)', color: 'var(--store-text, #1f2937)' }}
    >
      <div
        className="w-full max-w-sm space-y-5 p-8 text-center"
        // The corner is the SHOP's, from its own `corners` setting — not a
        // step on the dashboard's shape scale, which is why it is written
        // here beside the other store variables rather than as a class.
        style={{
          background: 'var(--store-card, #ffffff)',
          border: '1px solid var(--store-border, #e5e7eb)',
          borderRadius: 'var(--store-radius, 12px)',
        }}
      >
        <h1 className="text-lg font-bold">الصفحة غير موجودة</h1>
        <p className="text-sm" style={{ color: 'var(--store-muted, #6b7280)' }}>
          الرابط الذي فتحته لم يعد موجوداً، أو أن المنتج لم يعد معروضاً.
        </p>
        {slug ? (
          <Link
            href={`/s/${slug}`}
            className="inline-block px-5 py-2.5 text-sm font-bold"
            style={{
              background: 'var(--store-accent, #36B5CC)',
              color: 'var(--store-accent-text, #ffffff)',
              borderRadius: 'var(--store-radius, 12px)',
            }}
          >
            العودة إلى المتجر
          </Link>
        ) : (
          // No slug in the path means this was not reached from inside a
          // shop. Offering «العودة إلى المتجر» would be a link to nowhere,
          // so the page says the true thing and stops.
          <p className="text-sm" style={{ color: 'var(--store-muted, #6b7280)' }}>
            تأكّد من الرابط، أو ارجع إلى الصفحة السابقة.
          </p>
        )}
      </div>
    </main>
  );
}
