'use client';

import React from 'react';
import { RiArrowGoBackLine, RiSearchLine } from '@remixicon/react';
import { Button } from './Button';
import { Select } from './Input';

/**
 * THE SEARCH BOX AND THE DROPDOWNS UNDER IT — ONE COPY, FOR EVERY LIST.
 *
 * «العملاء بدي الهم فلاتر», then the same for the postponed, the cancelled-
 * and-recoverable, the returns and the shipments under follow-up. The shape the
 * customers screen found is the one all of them want, so it is written once:
 *
 *   · a search box, with the placeholder saying WHAT it searches — a box that
 *     does not say is a box people type the wrong thing into;
 *   · the dropdowns, ALWAYS DRAWN, each with its label above it and its numbers
 *     beside the words — a filter behind a button is one nobody finds, and a
 *     number that cannot be pressed is a question the screen asks and will not
 *     let you follow («القرار المركزي يُرى ولا يُطلب فتحه»);
 *   · «إعادة تعيين (N)» only while something is chosen, with the count — and
 *     nothing at all when nothing is, so the row does not hold a dead button.
 *
 * It owns no state. The screen holds what was chosen (so it can send it, and
 * start again at page one when it changes — see `usePagedList`) and hands it
 * back here to draw; this is a face, not a store.
 *
 * Every class below is one the customers screen already carried, so the
 * stylesheet does not grow by a byte for the fifth list.
 */

export interface ToolbarFilter {
  /** Stable, for the key and for tests. */
  key: string;
  /** Above the box: what this question is. */
  label: string;
  /** The chosen value; `all` is no filter. */
  value: string;
  /** In the order they read. The first should be «كل …» with the value `all`. */
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export function ListToolbar({
  search,
  onSearch,
  placeholder,
  filters,
  activeCount,
  onReset,
}: {
  search: string;
  onSearch: (value: string) => void;
  /** What the box searches: «بحث برقم الطلب أو اسم العميل أو هاتفه…». */
  placeholder: string;
  filters: ToolbarFilter[];
  /** How many of the filters (and the search) are not at their default. */
  activeCount: number;
  onReset: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="relative max-w-md">
        <RiSearchLine className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sys-muted)]" />
        <input
          type="text"
          aria-label={placeholder}
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="h-11 md:h-auto w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 md:py-2 text-xs bg-[var(--sys-card)] border border-[var(--sys-border-input)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/30 focus:border-[var(--sys-primary)] shadow-raised"
        />
      </div>

      {(filters.length > 0 || activeCount > 0) && (
        <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-4">
          {filters.map((f) => (
            <Select key={f.key} label={f.label} value={f.value} onChange={(e) => f.onChange(e.target.value)} className="text-xs py-2">
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ))}

          {activeCount > 0 && (
            <Button variant="outline" onClick={onReset} className="w-full gap-1.5 text-[var(--sys-destructive)]">
              <RiArrowGoBackLine className="icon-mirror w-4 h-4" />
              إعادة تعيين ({activeCount})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
