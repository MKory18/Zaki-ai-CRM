import { SHOP_SHEET } from './styles';

/**
 * WHAT THE SHOP LOOKS LIKE WHILE IT IS STILL BEING FETCHED.
 *
 * «هيكل تحميل مطابق للتخطيط بدل الدوّارات». A spinner says "something is
 * happening" and nothing else; it moves, so the eye goes to it, and when
 * the page arrives everything jumps. A skeleton that matches the layout
 * says what is coming and WHERE, and the arrival is a fill rather than a
 * replacement — which is the difference between a page that feels fast and
 * a page that merely is.
 *
 * IT CARRIES THE STYLESHEET ITSELF. A `loading.tsx` renders before any
 * page component has run, so `StorefrontShell` has not drawn and the
 * shop's CSS is not on the document yet. A skeleton without it is a column
 * of unstyled boxes — louder than the blank screen it replaced. The sheet
 * is the same constant the shell inlines, so when the page arrives the
 * browser has already parsed it.
 *
 * NOTHING HERE ANIMATES ON A LOOP. The brief's motion rule for the shop is
 * one quiet entrance and `repeat: false`; a skeleton that pulses forever is
 * the spinner again, drawn as a rectangle.
 *
 * AND IT RESERVES THE SAME BOXES. The grid uses `.sf-grid` and the tiles
 * use `.sf-card`, so the skeleton's columns are the page's columns at every
 * width — a skeleton with a layout of its own is a layout shift that was
 * written on purpose.
 */

function Tile() {
  return (
    <div className="sf-card" aria-hidden>
      <div className="sf-card-none" />
      <div className="sf-card-body">
        <div className="sf-skel-line" />
        <div className="sf-skel-line sf-skel-short" />
      </div>
    </div>
  );
}

/** The shelf: a heading, the chips, and a grid of tiles. */
export function ShopSkeleton({ tiles = 8 }: { tiles?: number }) {
  return (
    <div className="lp-root sf-root sf-skel" aria-busy="true" aria-live="polite">
      <style dangerouslySetInnerHTML={{ __html: SHOP_SHEET }} />
      {/* The only thing a screen reader needs from a skeleton. */}
      <span className="sf-skel-sr">جارٍ تحميل المتجر…</span>
      <div className="sf-page">
        <div className="sf-skel-title" />
        <div className="sf-skel-chips">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="sf-skel-chip" />
          ))}
        </div>
        <div className="sf-grid">
          {Array.from({ length: tiles }, (_, i) => (
            <Tile key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A product page: the picture, the title, the offers, the form. */
export function ProductSkeleton() {
  return (
    <div className="lp-root sf-root sf-skel" aria-busy="true" aria-live="polite">
      <style dangerouslySetInnerHTML={{ __html: SHOP_SHEET }} />
      <span className="sf-skel-sr">جارٍ تحميل المنتج…</span>
      <div className="sf-product">
        <div className="sf-product-top">
          <div className="sf-gallery">
            <div className="sf-card-none" />
          </div>
          <div>
            <div className="sf-skel-title" />
            <div className="sf-skel-line" />
            <div className="sf-skel-line sf-skel-short" />
            <div className="sf-skel-offers">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="sf-skel-offer" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
