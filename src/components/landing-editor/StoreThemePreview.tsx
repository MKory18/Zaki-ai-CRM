'use client';

import { useMemo, useState } from 'react';
import { RiComputerLine, RiSmartphoneLine } from '@remixicon/react';
import { SkinPreview, type SampleProduct } from '@/components/store/SkinPreview';
import { DEFAULT_LAYOUT, layoutOf, themeRoleColors, type StoreTheme } from '@/lib/store-theme';

/**
 * THE SHOP, DRAWN FROM THE THEME BEING EDITED — NOT FROM THE SAVED ONE.
 *
 * The templates screen had a preview for exactly one of its eight tabs: the
 * gallery, where each card draws the template it offers. Every tab after
 * that — the colours, the type, the arrangement, the header, the product
 * page, the checkout — was a form. A seller changed «لون السعر», pressed
 * save, pressed publish, opened the shop in another tab, and found out.
 * Which makes publishing the preview, on a live shop, in front of customers.
 *
 * So the same miniature the gallery draws is drawn here from `theme` — the
 * UNSAVED value in the editor's hands. SkinPreview is the gallery's own
 * component, so a colour cannot look one way on a card and another way on
 * the screen that sets it: there is one drawing, used twice.
 *
 * WHAT IT IS AND IS NOT. It is a miniature and says so by being one: the
 * header arrangement, the hero arrangement, the card shape, the corner
 * radius and every colour the engine resolved, with the shop's own products
 * in it. It is not the page — no fonts are loaded for it and no blocks are
 * built — so the type controls change the preview's proportions and not its
 * letterforms, and the panel says that out loud rather than letting a
 * seller believe they have seen their font.
 *
 * AND IT RESOLVES THE COLOURS THE WAY THE SHOP WILL. `themeRoleColors`
 * reads what `storeThemeVars` derived, with the seller's named colours
 * written over the derived ones — the same resolver the shop paints from and
 * the same one `ContrastNotes` judges with. Reading `theme.colors` directly
 * would show white wherever a colour is unset, which is most of them and
 * none of what a customer sees.
 */
export function StoreThemePreview({
  theme,
  products,
  storeName,
  /** True while the draft differs from what a customer is being served. */
  unpublished = false,
}: {
  theme: StoreTheme;
  products: SampleProduct[];
  storeName: string;
  unpublished?: boolean;
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('mobile');

  const palette = useMemo(() => themeRoleColors(theme), [theme]);

  /**
   * Every slot resolved, retirement and all.
   *
   * `layoutOf` and not `theme.layout`: a shop holding a retired variant is
   * drawn with what the engine will actually fall back to, so the preview
   * agrees with the shop rather than with the row in the database. The
   * seller's own screen says a variant is retired — that is the layout
   * tab's job, and it already does it.
   */
  const layout = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(DEFAULT_LAYOUT) as (keyof typeof DEFAULT_LAYOUT)[]).map((slot) => [
          slot,
          layoutOf(theme, slot),
        ])
      ) as Parameters<typeof SkinPreview>[0]['layout'],
    [theme]
  );

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sys-border)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--sys-heading)]">معاينة مباشرة</p>
          <p className="text-xs text-[var(--sys-muted)]">
            {unpublished
              ? 'هذه مسوّدتك — الزبون ما زال يرى الشكل المنشور'
              : 'هذا شكل متجرك كما تضبطه الآن'}
          </p>
        </div>
        <div
          role="group"
          aria-label="عرض المعاينة"
          className="flex gap-0.5 rounded-lg border border-[var(--sys-border)] p-0.5"
        >
          {(
            [
              ['mobile', 'جوال', RiSmartphoneLine],
              ['desktop', 'حاسوب', RiComputerLine],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              aria-pressed={device === key}
              onClick={() => setDevice(key)}
              className={`min-h-11 md:min-h-0 flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                device === key
                  ? 'bg-[var(--sys-primary-soft)] text-[var(--sys-primary)]'
                  : 'text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)]'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--sys-surface)] p-3">
        {/* The phone is drawn at a phone's proportions, which is the whole
            reason the toggle exists: a template that works at 1440 and not
            at 360 is a template this system does not ship. */}
        <div className={device === 'mobile' ? 'mx-auto max-w-xs' : ''}>
          <SkinPreview
            palette={palette}
            layout={layout}
            corners={theme.corners}
            products={products}
            device={device}
            storeName={storeName}
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--sys-muted)]">
          مصغّرة: بترسم الألوان والترتيب وشكل البطاقة بمنتجاتك. الخطوط ما بتتحمّل هنا — نموذج كل خط
          مكتوب بجانب اختياره.
        </p>
      </div>
    </div>
  );
}
