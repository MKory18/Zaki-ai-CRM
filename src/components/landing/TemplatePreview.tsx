'use client';

import React, { useMemo } from 'react';
import { PageBlocks } from '@/components/landing/blocks/PageBlocks';
import { FormPlaceholder } from '@/components/landing/blocks/FormPlaceholder';
import { BLOCK_CSS_WITH_DEV_FONTS, fontHref } from '@/components/landing/blocks/styles';
import { paletteFor, paletteVars, type LandingTheme } from '@/lib/landing-theme';
import type { LandingSection } from '@/lib/landing-sections';

/**
 * A TEMPLATE, DRAWN BY THE CODE THAT DRAWS THE REAL PAGE.
 *
 * The galleries offered a coloured square and a sentence. Fifteen shapes
 * described in fifteen sentences is a choice nobody can make, so people
 * took the first one — and a feature everybody skips is a feature that is
 * not there.
 *
 * WHY THIS IS NOT A SCREENSHOT. A picture of a template is right on the day
 * it is taken and slowly becomes a lie: a block changes, a colour token
 * moves, and the gallery keeps promising last year's page. This renders the
 * template through `PageBlocks` — the same component the published page and
 * the builder use — so a preview cannot disagree with what you get.
 *
 * AND IT SHOWS YOUR PRODUCT. Given one, its name and price are what the
 * blocks display, because «هل يناسب منتجي؟» is the actual question, and it
 * cannot be answered by a page selling «منتج تجريبي».
 *
 * It takes no orders and no clicks: the form is a stand-in, the whole thing
 * is inert, and screen readers are told to skip it — the words inside are a
 * drawing of a page, not content of this one.
 */

export interface PreviewProduct {
  name: string;
  price: number;
  currency: string;
}

export function TemplatePreview({
  sections,
  theme,
  product,
  /** Page width to draw at, then scaled to fit — a phone, as most visitors are. */
  width = 390,
  /** Height of the window onto the page; the rest is simply not shown. */
  height = 220,
  /** 1 = full size (a real preview); below that, a thumbnail. */
  zoom = 0.42,
  className,
}: {
  sections: LandingSection[];
  theme: LandingTheme;
  product?: PreviewProduct | null;
  width?: number;
  height?: number;
  zoom?: number;
  className?: string;
}) {
  const palette = useMemo(() => paletteFor(theme), [theme]);
  const fontLink = useMemo(() => fontHref(theme.font), [theme.font]);

  return (
    <div
      className={`relative overflow-hidden bg-[#eef2f6] ${className ?? ''}`}
      style={{ height }}
      aria-hidden
    >
      <div
        className="lp-root pointer-events-none absolute inset-x-0 top-0 mx-auto"
        dir="rtl"
        style={{
          ...(paletteVars(palette) as React.CSSProperties),
          width,
          // `zoom` and not `transform: scale`: scale leaves the element
          // claiming its old size, so the box keeps the space a shrunk page
          // no longer uses.
          zoom,
        }}
      >
        {fontLink && <link rel="stylesheet" href={fontLink} />}
        <style dangerouslySetInnerHTML={{ __html: BLOCK_CSS_WITH_DEV_FONTS }} />
        <PageBlocks
          sections={sections}
          ctx={{
            palette,
            productName: product?.name || 'منتجك',
            price: product?.price ?? 0,
            currency: product?.currency || '',
            // A plausible figure, so an urgency block can be judged.
            stock: 7,
            offers: [],
            form: <FormPlaceholder />,
            // The thank-you block is not part of a published page; without
            // this it would be invisible in a template that includes it.
            building: true,
            store: null,
            // A template carries no photographs; this draws where they go.
            placeholders: true,
          }}
        />
      </div>
      {/* The page continues past the window. A hard edge reads as "this is
          the whole template"; a fade reads as "there is more", which is
          true and is what the full preview is for. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
        style={{ background: 'linear-gradient(to bottom, transparent, #eef2f6)' }}
      />
    </div>
  );
}
