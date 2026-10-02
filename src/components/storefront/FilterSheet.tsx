'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { FieldKind } from '@/lib/product-attributes';

/**
 * NARROWING THE SHELF — A BOTTOM SHEET ON A PHONE, NEVER A SIDE COLUMN.
 *
 * «على الجوال الفلاتر بورقة سفلية، أبداً مش عمود جانبي». A side column at
 * 360px is either a drawer nobody finds or half the grid gone — and the
 * thumb that has to reach it is at the bottom of the phone, which is
 * where this opens.
 *
 * IT IS HANDED ADDRESSES, NOT A FUNCTION THAT MAKES THEM.
 *
 * The first version took a `hrefFor` callback and the page would not
 * render at all: a server component cannot pass a function to a client
 * one. The fix is better than what it replaced — every address is worked
 * out on the server, beside the rest of the query-string logic, and this
 * file now knows nothing about how a narrowing is spelled. Its whole job
 * is opening and closing.
 *
 * EVERY CHOICE IS A LINK. The shelf renders on the server, so a
 * narrowing is a page the shopper can bookmark, send, and back out of.
 * No script has to run for any of it.
 */

export interface SheetOption {
  value: string;
  count: number;
  /** Where this option leads — on if it is off, off if it is on. */
  href: string;
  on: boolean;
}

export interface SheetFacet {
  key: string;
  label: string;
  kind: FieldKind;
  unit: string;
  options: SheetOption[];
  range: { min: number; max: number } | null;
}

export function FilterSheet({
  facets,
  clearHref,
  active,
}: {
  facets: SheetFacet[];
  clearHref: string;
  /** How many narrowings are on, said on the button. */
  active: number;
}) {
  const [open, setOpen] = useState(false);

  if (facets.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="sf-chip"
        aria-expanded={open}
        aria-controls="sf-filters"
        onClick={() => setOpen((o) => !o)}
      >
        تصفية{active > 0 ? ` (${active})` : ''}
      </button>

      {/*
        Always in the document, hidden with `hidden`: a sheet that
        unmounts loses the scroll position a shopper had inside it, and
        on a phone that is the difference between adjusting one filter
        and hunting for it again.
      */}
      <div id="sf-filters" hidden={!open} className="sf-sheet">
        <div className="sf-sheet-body">
          {facets.map((facet) => (
            <fieldset key={facet.key} className="sf-facet">
              <legend>{facet.label}</legend>

              {facet.kind === 'number' && facet.range ? (
                // A range needs two ends and a server that can read them;
                // until the shelf accepts one, saying what it spans is
                // honest and a slider that does nothing is not.
                <p className="sf-facet-note">
                  من {facet.range.min} إلى {facet.range.max}
                  {facet.unit ? ` ${facet.unit}` : ''}
                </p>
              ) : (
                <div className="sf-facet-options">
                  {facet.options.map((o) => (
                    <Link
                      key={o.value}
                      href={o.href}
                      className="sf-chip"
                      aria-current={o.on || undefined}
                    >
                      {o.value} <span className="sf-facet-count">{o.count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </fieldset>
          ))}

          {active > 0 && (
            <p>
              <Link href={clearHref} className="sf-chip">
                امسح التصفية
              </Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
