'use client';

import React, { useMemo, useState } from 'react';
import { PAGE_TEMPLATES, buildTemplate } from '@/lib/page-templates';
import { TemplatePreview, type PreviewProduct } from '@/components/landing/TemplatePreview';
import { Modal } from '@/components/ui/Modal';
import { RiCheckLine, RiEyeLine } from '@remixicon/react';

/**
 * THE FIFTEEN TEMPLATES, SHOWN RATHER THAN DESCRIBED.
 *
 * Both galleries — the one that starts a landing page and the one that
 * dresses a storefront — offered a coloured square, a name and a sentence.
 * Fifteen sentences is not a choice anybody can make, so people took the
 * first, and fourteen shapes existed for nobody.
 *
 * Each card now draws the template itself, through the same renderer the
 * published page uses, with the seller's own product in it. Tapping «عاين»
 * opens the whole page at phone size — the thing the card is a corner of.
 *
 * ONE GALLERY, TWO CALLERS. The store's template list and the landing
 * page's are the same fifteen templates; two grids would be two places for
 * a template to be missing from.
 */

export function TemplateGallery({
  value,
  onChange,
  product,
  /** Rendered under each card — «ثبّته كمسوّدة» for a store, nothing for a new page. */
  action,
  columns = 'sm:grid-cols-2 lg:grid-cols-3',
}: {
  value: string | null;
  onChange: (key: string) => void;
  product?: PreviewProduct | null;
  action?: (key: string) => React.ReactNode;
  columns?: string;
}) {
  const [previewing, setPreviewing] = useState<string | null>(null);
  const built = useMemo(
    () => Object.fromEntries(PAGE_TEMPLATES.map((t) => [t.key, buildTemplate(t.key)])),
    []
  );
  const open = previewing ? PAGE_TEMPLATES.find((t) => t.key === previewing) : null;

  return (
    <>
      <div className={`grid gap-3 ${columns}`}>
        {PAGE_TEMPLATES.map((t) => {
          const chosen = value === t.key;
          return (
            <div
              key={t.key}
              className={`overflow-hidden rounded-lg border transition ${
                chosen
                  ? 'border-[var(--sys-primary)] ring-1 ring-[var(--sys-primary)]'
                  : 'border-[var(--sys-border)] hover:border-[var(--sys-primary)]/40'
              }`}
            >
              {/*
                The whole thumbnail is the choose button. A card whose
                picture is decoration and whose only target is a small
                control below it is a card people tap twice.
              */}
              <button
                type="button"
                onClick={() => onChange(t.key)}
                aria-pressed={chosen}
                className="block w-full text-start"
              >
                <TemplatePreview
                  sections={built[t.key].sections}
                  theme={built[t.key].theme}
                  product={product}
                  height={190}
                  zoom={0.38}
                />
                <span className="flex items-start gap-2 p-2.5">
                  <span
                    className="mt-0.5 h-7 w-1.5 shrink-0 rounded-full"
                    style={{ background: t.swatch }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-xs font-semibold text-[var(--sys-foreground)]">
                      {t.label}
                      {chosen && <RiCheckLine className="h-4 w-4 text-[var(--sys-primary)]" />}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[var(--sys-muted)]">
                      {t.hint}
                    </span>
                  </span>
                </span>
              </button>

              <div className="flex items-center gap-2 border-t border-[var(--sys-border)] px-2.5 py-2">
                <button
                  type="button"
                  onClick={() => setPreviewing(t.key)}
                  className="tap-safe inline-flex items-center gap-1 text-xs font-semibold text-[var(--sys-primary)] hover:underline"
                >
                  <RiEyeLine className="h-4 w-4" /> عاين
                </button>
                {action?.(t.key)}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <Modal
          isOpen
          onClose={() => setPreviewing(null)}
          title={open.label}
          subtitle={open.hint}
          maxWidth="lg"
        >
          <div className="space-y-3">
            {/* Full size and scrollable: the card is a corner of the page,
                and «عاين» exists to show the rest of it. */}
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--sys-border)]">
              <TemplatePreview
                sections={built[open.key].sections}
                theme={built[open.key].theme}
                product={product}
                height={2400}
                zoom={0.75}
              />
            </div>
            <p className="text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
              الصور المؤطَّرة أماكن صورك — القالب لا يحمل صوراً، وكل نص ولون فيه قابل للتغيير بعد
              الإنشاء.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewing(null)}
                className="h-11 rounded-lg border border-[var(--sys-border)] px-4 text-sm md:h-10"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(open.key);
                  setPreviewing(null);
                }}
                className="h-11 rounded-lg bg-[var(--sys-primary)] px-4 text-sm font-medium text-[var(--sys-primary-foreground)] md:h-10"
              >
                اختر هذا القالب
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
