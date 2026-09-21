'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Questions that stop a sale, answered before they are asked. */
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="lp-faq">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={isOpen ? 'lp-faq-item lp-faq-open' : 'lp-faq-item'}>
            <button type="button" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
              <span>{item.q}</span>
              <ChevronDown size={16} />
            </button>
            {isOpen && item.a && <p>{item.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
