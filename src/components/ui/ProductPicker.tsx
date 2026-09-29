'use client';

import React, { useMemo, useRef, useState } from 'react';
import { RiApps2Line, RiCloseLine, RiSearchLine } from '@remixicon/react';
import { normalizeArabic } from '@/lib/order-parser';
import { ProductThumb } from '@/components/ui/ProductThumb';

/**
 * CHOOSING ONE PRODUCT OUT OF A HUNDRED.
 *
 * It was a plain `<select>` holding every product in the company —
 * measured at the time: 114 of them, in no order anybody chose. Finding
 * «كريم الفطريات» meant scrolling a native dropdown on a phone, and the
 * seller reported it twice, from two screens: «لما أضيف منتج بخانة طلب
 * جديد ما بطلع بحث» and «لما أضيف منتج في طلب مرتجع ما بطلع بحث».
 *
 * THE SEARCH IS THE ONE THE REST OF THE SYSTEM USES. `normalizeArabic`
 * already strips diacritics and unifies أ/إ/آ → ا, ة → ه, ى → ي — so
 * «اذن» finds «الأُذُن», and a second spelling rule written here would be
 * a second answer to the same question.
 *
 * The SKU matches too: a warehouse reads the code, not the name.
 */

export interface PickableProduct {
  id: string;
  name: string;
  sku?: string | null;
  image?: string | null;
  /**
   * For `groupByCategory`. `/api/products` already selects it
   * (`category: { select: { id: true, name: true } }`), so a caller that
   * fetches through `useProducts` has it without asking for anything more.
   */
  category?: { id: string; name: string } | null;
}

/** How many to draw at once; past this a list is a scroll, not a choice. */
export const PICKER_LIMIT = 50;

/**
 * WHICH PRODUCTS A TYPED QUERY MEANS.
 *
 * Pure and exported so it can be tested without a browser and without a
 * role that may read products — the screen it lives on is behind
 * `products.view`, and a component nobody can open is a component nobody
 * can check.
 *
 * An empty query is «everything», capped: opening the box should show the
 * catalogue, not nothing.
 */
export function matchProducts(products: PickableProduct[], query: string): PickableProduct[] {
  const q = normalizeArabic(query.trim());
  if (!q) return products.slice(0, PICKER_LIMIT);
  return products
    .filter((p) => normalizeArabic(p.name).includes(q) || normalizeArabic(p.sku ?? '').includes(q))
    .slice(0, PICKER_LIMIT);
}

/**
 * THE ROW THAT MEANS «NOT ONE PRODUCT».
 *
 * A filter and a line-item chooser are not the same control. A line must end
 * up holding a product; a filter starts at «كل المنتجات», has to be able to
 * return there, and must never force a choice just because the box was
 * opened. The same is true of a form field that is allowed to stay empty —
 * «— اختر منتجًا —».
 *
 * Both are one row at the top of the list and one sentinel value, so this is
 * a prop rather than a second component: two pickers would be two answers to
 * «how is أذن spelled», which is the fault this component was built to end.
 */
export interface AnyOption {
  /** What the caller's state holds when nothing is chosen: 'all', '', … */
  value: string;
  label: string;
}

/**
 * The rows to draw, and whether the «any» row is one of them.
 *
 * Pure and separate from the component for the same reason `matchProducts`
 * is: the screens it serves are behind `products.view`, and a rule that can
 * only be checked by opening one is a rule nobody checks.
 *
 * THE ROW SHOWS ONLY WHILE NOTHING HAS BEEN TYPED. Someone typing «كريم» is
 * looking for a product, and «كل المنتجات» sitting above the matches is a
 * row that can be arrowed onto and chosen by accident — it would clear the
 * very filter they are building.
 */
export interface ProductGroup {
  /** Category id, or the empty string for the uncategorised bucket. */
  key: string;
  label: string;
  products: PickableProduct[];
}

/** What the last bucket is called. Named, never silent. */
export const UNCATEGORISED_LABEL = 'بلا تصنيف';

/**
 * THE CATALOGUE UNDER ITS CATEGORIES — FOR BROWSING, NOT FOR SEARCHING.
 *
 * A flat searchable list is a net win on «find the product I can name» and a
 * net LOSS on «show me what we sell», which is the case the grouping existed
 * for: somebody opening this box does not always know the name to type.
 *
 * So both, and the query decides which. GROUPED WHILE NOTHING IS TYPED, flat
 * the moment something is — once a person has typed, the ranked matches are
 * the answer and category headings are furniture between them.
 *
 * THE PRODUCTS WITH NO CATEGORY GO IN A BUCKET THAT SAYS SO, and it is last.
 * Dropping them into the first group, or spreading them silently through the
 * list, hides the gap — and the gap is real: measured on this database, all
 * 114 products have no category, so today this draws one honest heading over
 * the lot rather than pretending to an order it does not have.
 *
 * Returns `null` for «do not group», so the caller draws its flat list
 * unchanged rather than a single group wrapping everything.
 */
export function groupProducts(
  products: PickableProduct[],
  query: string,
  enabled: boolean
): ProductGroup[] | null {
  if (!enabled || query.trim() !== '') return null;

  const byKey = new Map<string, ProductGroup>();
  for (const p of products) {
    const key = p.category?.id ?? '';
    if (!byKey.has(key)) {
      byKey.set(key, { key, label: p.category?.name ?? UNCATEGORISED_LABEL, products: [] });
    }
    byKey.get(key)!.products.push(p);
  }

  // Uncategorised last: it is a leftover, not a category. The rest by name,
  // in Arabic collation — `localeCompare` with 'ar' so «ب» follows «أ»
  // rather than sorting by code point.
  return [...byKey.values()].sort((a, b) => {
    if (a.key === '') return 1;
    if (b.key === '') return -1;
    return a.label.localeCompare(b.label, 'ar');
  });
}

export function pickerRows(
  products: PickableProduct[],
  query: string,
  anyOption?: AnyOption
): { rows: PickableProduct[]; showAny: boolean } {
  return {
    rows: matchProducts(products, query),
    showAny: !!anyOption && query.trim() === '',
  };
}

export function ProductPicker({
  products,
  value,
  onChange,
  disabled,
  anyOption,
  groupByCategory = false,
  placeholder = 'ابحث بالاسم أو الرمز…',
  className = '',
}: {
  /** See `AnyOption`: makes the picker a filter, or an optional field. */
  anyOption?: AnyOption;
  /**
   * Draw the catalogue under its category headings while nothing is typed.
   * Off by default: every caller that had a flat list keeps one.
   */
  groupByCategory?: boolean;
  products: PickableProduct[];
  value: string;
  onChange: (productId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const chosen = products.find((p) => p.id === value) ?? null;
  /** Settled on «not one product», rather than simply not started. */
  const restingOnAny = !chosen && !!anyOption && value === anyOption.value;

  const { rows: matches, showAny } = useMemo(
    () => pickerRows(products, query, anyOption),
    [products, query, anyOption]
  );

  const groups = useMemo(
    () => groupProducts(matches, query, groupByCategory),
    [matches, query, groupByCategory]
  );

  /**
   * The rows AS DRAWN — «any» first, then the products in the order they
   * appear on screen, each carrying the heading that precedes it (if any).
   *
   * ONE ARRAY OF SELECTABLE ROWS, so the list, the hover highlight, the
   * arrow keys and Enter all walk the same thing. A heading is not a row in
   * it: it is drawn from `heading` on the product that follows it, so a
   * category title can never be arrowed onto or chosen. Keeping the extra
   * rows outside this array is how a highlight comes to sit one place above
   * what Enter actually selects.
   */
  const drawn: { p: PickableProduct & { isAny?: boolean }; heading?: string }[] = [
    ...(showAny ? [{ p: { id: anyOption!.value, name: anyOption!.label, isAny: true } }] : []),
    ...(groups
      ? groups.flatMap((g) => g.products.map((p, i) => ({ p, heading: i === 0 ? g.label : undefined })))
      : matches.map((p) => ({ p }))),
  ];
  const choices = drawn.map((d) => d.p);

  const choose = (id: string) => {
    onChange(id);
    setQuery('');
    setOpen(false);
    setActive(0);
  };

  /**
   * A CHOSEN PRODUCT IS A STATEMENT, NOT A HALF-TYPED QUERY.
   *
   * While one is chosen the box shows its name and a clear button; typing
   * is how you change it. That way the line never reads as empty when it
   * is not, which is the failure a bare search box has.
   *
   * «كل المنتجات» is a statement too, and the same box says it. A filter
   * that showed an empty search box while filtering nothing would read as
   * «you have not chosen yet» when in fact it is switched off on purpose.
   */
  if ((chosen || restingOnAny) && !open) {
    /**
     * WHAT THE ✕ DOES, AND WHY IT DIFFERS.
     *
     * With an «any» row there is somewhere to go back TO, so clearing means
     * clearing: the filter switches off in one press. Without one, clearing
     * would empty a line that must hold a product, so the button opens the
     * search to CHANGE it instead — which is what it has always done, and
     * `ProductLinesEditor` keeps that behaviour untouched.
     */
    const clears = !!anyOption && !!chosen;
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-2 ${className}`}>
        {chosen ? (
          <ProductThumb src={chosen.image ?? undefined} alt={chosen.name} size="sm" />
        ) : (
          <RiSearchLine className="h-4 w-4 shrink-0 text-[var(--sys-muted)]" aria-hidden />
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            setQuery('');
          }}
          className={`min-w-0 flex-1 truncate py-2 text-start text-sm ${
            chosen ? 'text-[var(--sys-heading)]' : 'text-[var(--sys-muted-foreground)]'
          }`}
        >
          {chosen ? chosen.name : anyOption!.label}
        </button>
        {!disabled && chosen && (
          <button
            type="button"
            onClick={() => {
              if (clears) {
                choose(anyOption!.value);
                return;
              }
              setOpen(true);
              setQuery('');
            }}
            aria-label={clears ? 'امسح الاختيار' : 'غيّر المنتج'}
            title={clears ? 'امسح الاختيار' : 'غيّر المنتج'}
            className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 shrink-0 rounded-lg p-1.5 text-[var(--sys-muted)] hover:text-[var(--sys-foreground)]"
          >
            <RiCloseLine className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 start-2 flex items-center text-[var(--sys-muted)]">
        <RiSearchLine className="h-4 w-4" aria-hidden />
      </span>
      <input
        value={query}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        // A blur that closes immediately would fire before a click on the
        // list lands, so the choice would never register.
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          // The keyboard walks the rows AS DRAWN, «any» included. Indexing
          // into `matches` while the list showed an extra row on top would
          // put the highlight one place above the thing Enter then chose.
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, choices.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && choices[active]) {
            e.preventDefault();
            choose(choices[active].id);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="h-11 w-full rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] ps-8 pe-2 text-sm text-[var(--sys-heading)] focus:border-[var(--sys-primary)] focus:outline-none md:h-10"
      />

      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] py-1 shadow-overlay">
          {choices.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)]">لا منتجَ يطابق «{query}»</li>
          ) : (
            drawn.map(({ p, heading }, i) => (
              <React.Fragment key={p.id}>
                {/* A heading, not an option: `role="presentation"` and no
                    button, so neither a click nor the arrow keys can land
                    on it. It is drawn from the product below it rather than
                    being a row of its own, which is what keeps the
                    selectable list and the highlight in step. */}
                {heading && (
                  <li
                    role="presentation"
                    data-picker-group
                    className="px-2 pb-1 pt-2 text-xs font-semibold text-[var(--sys-muted-foreground)]"
                  >
                    {heading}
                  </li>
                )}
                <li>
                <button
                  type="button"
                  // onMouseDown, not onClick: the input's blur runs first
                  // otherwise and the list is gone before the click lands.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(p.id);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2 px-2 py-2 text-start text-sm ${
                    i === active ? 'bg-[var(--sys-primary-soft)] text-[var(--sys-primary)]' : 'text-[var(--sys-foreground)]'
                  }`}
                >
                  {/* The «any» row has no product to show a picture of, and
                      an empty thumbnail frame beside a real one reads as a
                      product whose image failed to load. */}
                  {p.isAny ? (
                    <RiApps2Line className="h-5 w-5 shrink-0 text-[var(--sys-muted)]" aria-hidden />
                  ) : (
                    <ProductThumb src={p.image ?? undefined} alt={p.name} size="sm" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.sku && <span className="shrink-0 font-mono text-xs text-[var(--sys-muted)]">{p.sku}</span>}
                </button>
                </li>
              </React.Fragment>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
