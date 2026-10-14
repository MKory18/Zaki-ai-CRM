'use client';

import type { StoreSkin } from '@/lib/store-skin';
import { StoreHero } from '@/components/storefront/StoreHero';
import { HERO_CSS } from '@/components/storefront/styles';

/**
 * THE HERO'S OWN RULES, AND ONLY THOSE.
 *
 * The miniature cannot load the shop's whole stylesheet — it is a panel
 * inside the dashboard, and `SHOP_SHEET` is the shop's entire face. So
 * the hero's slice is exported on its own and injected here. Same rules,
 * same `[data-hero-slot]` selectors, so the arrangement the seller sees
 * is the arrangement the renderer applies.
 */
function HeroStyles() {
  return <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />;
}

/** Stand-ins for `categoryTiles`, which needs ways in rather than goods. */
const SAMPLE_CATEGORIES = [
  { id: 'a', name: 'فئة' },
  { id: 'b', name: 'فئة' },
  { id: 'c', name: 'فئة' },
];

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
        /*
          THE SHOP'S OWN VARIABLE NAMES, FROM THIS TEMPLATE'S PALETTE.

          `StoreHero`'s rules are the shop's rules, and they read
          `--store-*`. Inside the dashboard nothing defines those, so the
          miniature declares them here from the very palette the gallery
          is showing. Not one colour is written literally — the same rule
          the rest of this file has always obeyed.
        */
        ['--store-accent' as string]: palette.accent,
        ['--store-accent-text' as string]: palette.accentContrast,
        ['--store-surface' as string]: palette.surface1,
        ['--store-card' as string]: palette.surface0,
        ['--store-border' as string]: palette.border,
        ['--store-text' as string]: palette.textPrimary,
        ['--store-muted' as string]: palette.textSecondary,
        ['--store-radius' as string]: `${radius}px`,
        ['--store-heading-weight' as string]: '800',
      } as React.CSSProperties}
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

      {/*
        ── THE HERO — THE SHOP'S OWN COMPONENT, AT PREVIEW SCALE ──

        This used to be five inline-styled approximations written here:
        a coloured strip for `offerStrip`, three grey boxes for
        `categoryTiles`, two bars for `editorial`, one box for `slider`,
        and nothing for `productFirst`. They were the ONLY place any hero
        variant was drawn — the shop itself read `layout.hero` nowhere and
        drew a fixed tagline box instead. So this panel was showing the
        seller five first screens they could choose between and never get.

        One component now. `StoreHero` with `mini` renders the same markup
        and takes the same variant branch the shop will take, so a hero
        that does not exist cannot be promised here.
      */}
      <HeroStyles />
      <StoreHero
        variant={layout.hero}
        mini
        slug=""
        currency={null}
        minorUnit={0}
        tagline={storeName}
        about={null}
        products={products.slice(0, 4).map((p, i) => ({
          id: String(i),
          name: p.name,
          handle: '',
          image: p.image,
          fromPrice: p.price,
        }))}
        categories={SAMPLE_CATEGORIES}
      />

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
