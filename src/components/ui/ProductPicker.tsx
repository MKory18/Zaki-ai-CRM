'use client';

import React, { useMemo, useRef, useState } from 'react';
import { RiCloseLine, RiSearchLine } from '@remixicon/react';
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

export function ProductPicker({
  products,
  value,
  onChange,
  disabled,
  placeholder = 'ابحث بالاسم أو الرمز…',
  className = '',
}: {
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

  const matches = useMemo(() => matchProducts(products, query), [products, query]);

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
   */
  if (chosen && !open) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-2 ${className}`}>
        <ProductThumb src={chosen.image ?? undefined} alt={chosen.name} size="sm" />
        <span className="min-w-0 flex-1 truncate py-2 text-sm text-[var(--sys-heading)]">{chosen.name}</span>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setQuery('');
            }}
            aria-label="غيّر المنتج"
            title="غيّر المنتج"
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
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && matches[active]) {
            e.preventDefault();
            choose(matches[active].id);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="h-11 w-full rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] ps-8 pe-2 text-sm text-[var(--sys-heading)] focus:border-[var(--sys-primary)] focus:outline-none md:h-10"
      />

      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] py-1 shadow-overlay">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)]">لا منتجَ يطابق «{query}»</li>
          ) : (
            matches.map((p, i) => (
              <li key={p.id}>
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
                  <ProductThumb src={p.image ?? undefined} alt={p.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.sku && <span className="shrink-0 font-mono text-xs text-[var(--sys-muted)]">{p.sku}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
