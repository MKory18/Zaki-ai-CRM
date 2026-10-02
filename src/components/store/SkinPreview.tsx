'use client';

import type { StoreSkin } from '@/lib/store-skin';

/**
 * A SHOP TEMPLATE, DRAWN — not described, and not photographed.
 *
 * «معاينة حاسوب وجوال مرسومة بمنتجات التاجر الحقيقية».
 *
 * A screenshot would be a picture of somebody else's shop, taken once and
 * wrong from the next change onward. A list of adjectives («هادئ، فاخر»)
 * is a template described rather than shown, and the brief's own complaint
 * about five lists of the same blocks applies to ten lists of the same
 * words. So this draws: the palette the engine resolved, the corner radius
 * the shop will use, the header arrangement, the hero arrangement, and the
 * card shape — with the seller's OWN product names and photographs.
 *
 * IT IS A MINIATURE, AND IT SAYS SO BY BEING ONE. It does not pretend to
 * be the page: no fonts are loaded for it, no blocks are built, nothing is
 * fetched. What it is for is the one question a gallery has to answer —
 * «does MY shop look right in this?» — and the answer is in the colours,
 * the proportions and the arrangement, which are exactly what it draws.
 *
 * EVERY COLOUR COMES FROM THE PALETTE PASSED IN. Not one hex is written
 * here. A card that hard-coded even a border would show every template
 * wearing the same edge.
 */

/**
 * The roles exactly as `resolveSkinPalette` names them. Not a second set
 * of names for the same colours: a preview that invented `page` for
 * `surface0` would be one rename away from drawing the wrong shop.
 */
export type SkinPalette = Record<string, string>;

export interface SampleProduct {
  name: string;
  image: string | null;
  price: number;
}

const RADIUS: Record<string, number> = { soft: 14, sharp: 2 };

/** A letter stands in for a product with no photograph, as the shop does. */
function Tile({
  product,
  palette,
  radius,
  tall,
}: {
  product: SampleProduct | undefined;
  palette: SkinPalette;
  radius: number;
  tall: boolean;
}) {
  return (
    <div
      style={{
        background: palette.surface1,
        border: `1px solid ${palette.border}`,
        borderRadius: radius,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ aspectRatio: tall ? '4 / 5' : '1 / 1', background: palette.surface0, position: 'relative' }}>
        {product?.image ? (
          // The seller's own photograph, at the smallest render the media
          // route offers — this is a thumbnail of a thumbnail.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${product.image}?w=320`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              color: palette.textSecondary,
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {(product?.name ?? '؟').trim().charAt(0)}
          </span>
        )}
      </div>
      <div style={{ padding: '6px 7px 7px', display: 'grid', gap: 4 }}>
        <span
          style={{
            color: palette.textPrimary,
            fontSize: 8,
            lineHeight: 1.3,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {product?.name ?? '—'}
        </span>
        <span
          style={{
            color: palette.price,
            fontSize: 8,
            fontWeight: 700,
            background: `color-mix(in srgb, ${palette.price} 12%, transparent)`,
            borderRadius: 999,
            padding: '1px 6px',
            justifySelf: 'start',
          }}
        >
          {product ? product.price.toFixed(2) : '—'}
        </span>
      </div>
    </div>
  );
}

export function SkinPreview({
  palette,
  layout,
  corners,
  products,
  device,
  storeName,
}: {
  palette: SkinPalette;
  layout: StoreSkin['layout'];
  corners: 'soft' | 'sharp';
  products: SampleProduct[];
  device: 'desktop' | 'mobile';
  storeName: string;
}) {
  const radius = RADIUS[corners] ?? 12;
  const phone = device === 'mobile';
  const columns = phone ? 2 : 4;
  const tall = layout.productCard === 'portrait';

  return (
    <div
      dir="rtl"
      style={{
        background: palette.surface0,
        color: palette.textPrimary,
        borderRadius: radius,
        border: `1px solid ${palette.border}`,
        overflow: 'hidden',
        // The two devices differ in WIDTH, which is the whole point: a
        // template that works at 1440 and not at 360 is a template this
        // system does not ship.
        width: '100%',
        fontFamily: 'inherit',
      }}
    >
      {/* ── the header, in the arrangement this template chose ── */}
      <div
        style={{
          background: palette.surface1,
          borderBottom: `1px solid ${palette.border}`,
          padding: phone ? '7px 8px' : '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          // `searchFirst` puts the field first and the name after it;
          // `split` pushes them apart; `stacked` puts them on two rows.
          flexDirection: layout.header === 'stacked' ? 'column' : 'row',
          justifyContent: layout.header === 'split' ? 'space-between' : 'flex-start',
          ...(layout.header === 'transparent' ? { background: 'transparent', borderBottom: 'none' } : {}),
        }}
      >
        {layout.header !== 'searchFirst' && (
          <span style={{ fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>{storeName}</span>
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            height: phone ? 12 : 14,
            borderRadius: 999,
            background: palette.surface0,
            border: `1px solid ${palette.border}`,
          }}
        />
        {layout.header === 'searchFirst' && (
          <span style={{ fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>{storeName}</span>
        )}
        <span style={{ width: phone ? 12 : 14, height: phone ? 12 : 14, borderRadius: 5, background: palette.accent }} />
      </div>

      {/* ── the hero, in the arrangement this template chose ── */}
      {layout.hero === 'offerStrip' ? (
        <div style={{ background: palette.accent, color: palette.accentContrast, padding: '6px 10px', fontSize: 8, fontWeight: 700 }}>
          عروض اليوم
        </div>
      ) : layout.hero === 'categoryTiles' ? (
        <div style={{ display: 'flex', gap: 5, padding: '7px 8px' }}>
          {['', '', ''].map((_, i) => (
            <span key={i} style={{ flex: 1, height: phone ? 22 : 28, borderRadius: radius, background: palette.surface1, border: `1px solid ${palette.border}` }} />
          ))}
        </div>
      ) : layout.hero === 'editorial' ? (
        <div style={{ padding: phone ? '12px 10px' : '16px 14px', display: 'grid', gap: 4 }}>
          <span style={{ height: 7, width: '55%', borderRadius: 3, background: palette.textPrimary, opacity: 0.85 }} />
          <span style={{ height: 5, width: '78%', borderRadius: 3, background: palette.textSecondary }} />
        </div>
      ) : layout.hero === 'slider' ? (
        <div style={{ padding: '7px 8px' }}>
          <span style={{ display: 'block', height: phone ? 46 : 62, borderRadius: radius, background: `color-mix(in srgb, ${palette.accent} 18%, ${palette.surface1})` }} />
        </div>
      ) : null}

      {/* ── the shelf, with the seller's own products ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: phone ? 6 : 8,
          padding: phone ? '7px 8px 9px' : '9px 12px 12px',
        }}
      >
        {Array.from({ length: columns }, (_, i) => (
          <Tile key={i} product={products[i % Math.max(products.length, 1)]} palette={palette} radius={radius} tall={tall} />
        ))}
      </div>
    </div>
  );
}
