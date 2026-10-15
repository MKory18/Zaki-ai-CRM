'use client';

import { useMemo, useState } from 'react';
import { RiCheckLine, RiComputerLine, RiLoader4Line, RiSmartphoneLine } from '@remixicon/react';
import { Button } from '@/components/ui/Button';
import { SkinPreview, type SampleProduct, type SkinPalette } from './SkinPreview';
import type { StoreSkin } from '@/lib/store-skin';
import { STORE_FAMILIES, familyNoteAr, familyOfSkin, isGalleryVoice } from '@/lib/store-families';

/**
 * THE TEN SHOP TEMPLATES.
 *
 * They were written, validated at module load and shipped — and until this
 * screen existed no seller could reach one. A gallery of fifteen PAGE
 * shapes stood where a seller would look for them, which is a different
 * unit: that one orders the blocks of a home page, this one dresses the
 * whole engine — the palette, the type, which arrangement each part draws,
 * and the single feature the template puts forward.
 *
 * SHOWN AT BOTH WIDTHS. «معاينة حاسوب وجوال». A template is a promise
 * about a phone before it is a promise about a laptop, and the toggle is
 * here rather than in a settings panel because the comparison is the
 * point: the two previews are the same drawing at two widths, so a
 * template that falls apart at 360 falls apart in front of the seller.
 *
 * THE FILTER IS FOR BROWSING AND NOTHING ELSE. «فلتر حسب الفئة المقترحة —
 * للتصفح فقط»: it narrows what is listed. No template is refused to a shop
 * because of what that shop sells, and nothing here records the choice.
 */

export interface SkinCard {
  key: string;
  label: string;
  suggestedFor: string;
  feature: string;
  mood: StoreSkin['mood'];
  /** The skin's own corner radius — `shape.corners`, not a guess. */
  corners: 'soft' | 'sharp';
  palette: SkinPalette;
  layout: StoreSkin['layout'];
  home: string[];
}

/** What the engine actually serves, in the words a seller reads. */
const FEATURE_LABEL: Record<string, string> = {
  shopByNeed: 'تسوّق حسب الحاجة',
  ingredientLens: 'عدسة المكوّنات',
  quickAdd: 'إضافة سريعة',
  deliveryEstimate: 'موعد الوصول',
  whatsappAsk: 'اسأل على واتساب',
  sizeHelper: 'مساعد المقاس',
  bestSellersRank: 'الأكثر مبيعاً',
  stockNote: 'ما تبقّى من المخزون',
};

export function SkinGallery({
  skins,
  installed,
  products,
  storeName,
  installing,
  onInstall,
}: {
  skins: SkinCard[];
  /** The template this shop is wearing, as the server recorded it. */
  installed: string | null;
  products: SampleProduct[];
  storeName: string;
  installing: string | null;
  onInstall: (key: string) => void;
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('mobile');
  const [category, setCategory] = useState<string | null>(null);

  /**
   * ═══════════════════════════════════════════════════════════════════
   * THE GALLERY IS THE FAMILY PICKER, AND THE FAMILIES ARE VISIBLE.
   *
   * `AUDIT.md` §7.3 mapped the ten skins onto three families and the
   * owner added a fourth on 15/10. Six are kept as their family's
   * voices, three are MERGED into a kept one and one is RETIRED — and
   * the rule for those four is the same as for a retired layout
   * variant: hidden, never deleted, never silent.
   *
   *   HIDDEN — a seller cannot newly choose one, so `isGalleryVoice`
   *   filters the list. Offering «نقاء» beside «مختبر» when they are the
   *   same header, the same mood and the same card is how a seller
   *   learns that the choice is decoration.
   *
   *   NEVER DELETED — the skin still ships, still parses, and a shop
   *   wearing one keeps exactly the look it has. `templateById` still
   *   finds it, which is what stops that shop's theme failing to parse.
   *
   *   NEVER SILENT — if the shop is wearing one, it is pinned to the top
   *   like any installed template AND carries `familyNoteAr`, which says
   *   in Arabic what happened and that nothing about their shop changed.
   *
   * Grouped by family rather than filtered by it: «المالك لازم يشوف
   * الخيار المركزي بلا كبسة» — the four families are the choice, so all
   * four are on the screen with their names and their one line, and the
   * filter narrows within them.
   * ═══════════════════════════════════════════════════════════════════
   */
  const categories = useMemo(
    () => [...new Set(skins.map((s) => s.suggestedFor))],
    [skins]
  );

  const shown = useMemo(() => {
    const offered = skins.filter((s) => isGalleryVoice(s.key) || s.key === installed);
    return category ? offered.filter((s) => s.suggestedFor === category) : offered;
  }, [skins, category, installed]);

  /**
   * The installed one FIRST, wherever it sits in the list and whatever the
   * filter says. «القالب المثبّت معلّم بأعلى الشاشة» — a seller who opens
   * this screen is most often asking "which one am I wearing", and an
   * answer they have to scroll for is an answer they will mistrust.
   */
  const ordered = useMemo(() => {
    if (!installed) return shown;
    const mine = skins.find((s) => s.key === installed);
    if (!mine) return shown;
    return [mine, ...shown.filter((s) => s.key !== installed)];
  }, [shown, skins, installed]);

  /**
   * The four families, each with the voices that are left to it.
   *
   * A family with nothing in it is not drawn — which cannot happen while
   * `store-families.test.ts` holds, and is handled anyway so a filter
   * that empties one does not leave a heading over nothing.
   */
  const byFamily = useMemo(
    () =>
      STORE_FAMILIES.map((family) => ({
        family,
        cards: ordered.filter((s) => familyOfSkin(s.key) === family.id && s.key !== installed),
      })).filter((row) => row.cards.length > 0),
    [ordered, installed]
  );

  /**
   * WHAT THIS SHOP IS WEARING, ABOVE THE FOUR FAMILIES.
   *
   * «القالب المثبّت معلّم بأعلى الشاشة» — and grouping by family would
   * have buried it: the installed card is first within ITS family, which
   * on a screen of four families is not first at all. A seller opening
   * this screen is most often asking «which one am I wearing», and an
   * answer they have to scroll for is an answer they will mistrust. So it
   * is lifted out, named, and not drawn twice.
   */
  const mine = useMemo(
    () => (installed ? skins.find((s) => s.key === installed) ?? null : null),
    [skins, installed]
  );

  /** The ones whose family was retired with them — shown last, if at all. */
  const orphans = useMemo(() => ordered.filter((s) => familyOfSkin(s.key) === null), [ordered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategory(null)}
            aria-pressed={category === null}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              category === null
                ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]'
                : 'border border-[var(--sys-border)] text-[var(--sys-muted-foreground)]'
            }`}
          >
            الكل
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c === category ? null : c)}
              aria-pressed={category === c}
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                category === c
                  ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]'
                  : 'border border-[var(--sys-border)] text-[var(--sys-muted-foreground)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div
          role="group"
          aria-label="عرض المعاينة"
          className="inline-flex overflow-hidden rounded-lg border border-[var(--sys-border)]"
        >
          {([['mobile', 'جوال', RiSmartphoneLine], ['desktop', 'حاسوب', RiComputerLine]] as const).map(
            ([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDevice(key)}
                aria-pressed={device === key}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold ${
                  device === key
                    ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]'
                    : 'text-[var(--sys-muted-foreground)]'
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            )
          )}
        </div>
      </div>

      {products.length === 0 && (
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
          لا منتجات في هذا المتجر بعد، فالمعاينات مرسومة بصناديق فارغة. أضف منتجاً واحداً وستراها
          بمنتجك واسمه وصورته.
        </p>
      )}

      {/*
        ── FOUR HEADINGS, AND THE VOICES UNDER EACH ──
        The family is the choice the owner cares about and it is on the
        screen without a press: its name, its one line, and the templates
        that belong to it. A chip filter alone would have hidden the
        central choice behind an interaction.
      */}
      {mine && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-[var(--sys-heading)]">قالبك الحالي</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{renderCard(mine)}</div>
        </section>
      )}

      {byFamily.map(({ family, cards }) => (
        <section key={family.id} className="space-y-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--sys-heading)]">عائلة «{family.name}»</h3>
            <p className="text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{family.line}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((skin) => renderCard(skin))}
          </div>
        </section>
      ))}

      {/*
        A template whose family was retired with it — only ever on screen
        because THIS shop is wearing it, and then with the note that says
        so. Never offered to anybody else.
      */}
      {orphans.filter((o) => o.key !== installed).length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orphans.filter((o) => o.key !== installed).map((skin) => renderCard(skin))}
        </div>
      )}
    </div>
  );

  function renderCard(skin: SkinCard) {
          const mine = skin.key === installed;
          const note = familyNoteAr(skin.key);
          return (
            <div
              key={skin.key}
              className={`rounded-lg border p-3 ${
                mine
                  ? 'border-[var(--sys-primary)] bg-[var(--sys-primary)]/5'
                  : 'border-[var(--sys-border)] bg-[var(--sys-card)]'
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--sys-heading)]">
                    {skin.label}
                    {mine && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--sys-primary)] px-1.5 py-0.5 text-xs font-bold text-[var(--sys-primary-foreground)]">
                        <RiCheckLine className="h-4 w-4" /> مثبّت
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--sys-muted-foreground)]">
                    {skin.suggestedFor}
                  </p>
                  {/* Hidden from the list, never silent on the shop that
                      wears it — and it says their look did not change. */}
                  {note && (
                    <p className="mt-1 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{note}</p>
                  )}
                </div>
              </div>

              {/*
                The preview is capped at a phone's width when the phone is
                selected, so the two are not the same drawing stretched —
                the comparison has to be a comparison.
              */}
              <div className={device === 'mobile' ? 'mx-auto max-w-[220px]' : ''}>
                <SkinPreview
                  palette={skin.palette}
                  layout={skin.layout}
                  corners={skin.corners}
                  products={products}
                  device={device}
                  storeName={storeName}
                />
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-[var(--sys-muted-foreground)]">
                  يبرز: {FEATURE_LABEL[skin.feature] ?? skin.feature}
                </span>
                <Button
                  size="sm"
                  variant={mine ? 'secondary' : 'primary'}
                  disabled={!!installing}
                  onClick={() => onInstall(skin.key)}
                >
                  {installing === skin.key && <RiLoader4Line className="h-4 w-4 animate-spin" />}
                  {mine ? 'أعد تثبيته' : 'ثبّته كمسوّدة'}
                </Button>
              </div>
            </div>
          );
  }
}
