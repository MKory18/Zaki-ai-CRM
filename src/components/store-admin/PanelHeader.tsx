'use client';

import React, { useId, useState } from 'react';
import { RiInformationLine } from '@remixicon/react';

/**
 * A TITLE, ONE LINE, AND ONE PRIMARY ACTION — HELD BY THE TYPE SYSTEM.
 *
 * `docs/storefront/AUDIT.md` §6 counted 72 buttons across the ten
 * storefront screens and found **not one of them marking its primary
 * action**. Three screens had no action in the header at all: the thing a
 * seller opened the screen to do — save the language, bind the domain, save
 * the menu — was a thousand pixels down, under the explanation of why it
 * mattered.
 *
 * `PageHeader` cannot hold that rule: its `actions` is a ReactNode, so «one
 * primary» is a thing a reviewer counts by eye and gets wrong. Here
 * `primary` is ONE node and `secondary` is the rest, so a screen with two
 * primary buttons does not type-check, and a screen with none is a hole a
 * reader can see in the call.
 *
 * WHY IT IS NOT `PageHeader` ITSELF. Fifty-one screens render that
 * component, and narrowing its contract would be fifty-one screens to
 * rewrite in a task whose constraint is «No API, data or behaviour
 * change». This is the storefront panels' header, it wraps nothing, and
 * the two can be merged the day the rest of the screens are ready for it.
 *
 * THE HELP IS CLOSED. Every long paragraph these screens opened with —
 * what a 301 costs, why a second language is a project, what the shop's
 * synonyms do — is true and is read once. Behind ⓘ it stays available and
 * stops standing between the seller and the one button.
 *
 * DECORATION, WHERE THE OWNER ALLOWS IT. A section header is one of the
 * four places he named (a door · an empty state · a section header · a
 * welcome card), and this is a section header: the ⓘ and the muted line
 * live here. Nothing on this row is ever drawn behind a figure, a price or
 * an amount.
 */
export function PanelHeader({
  title,
  line,
  help,
  primary,
  secondary,
  note,
}: {
  /** The panel's name, as its chip in the tab says it. */
  title: string;
  /** ONE sentence — what this panel answers. Never two. */
  line: string;
  /**
   * Everything that used to be a paragraph on arrival. Closed by default,
   * and absent entirely when a panel has nothing to explain.
   */
  help?: React.ReactNode;
  /**
   * THE one action. A panel that genuinely has none — a list you only read
   * — passes nothing and says so by the absence.
   */
  primary?: React.ReactNode;
  /** Everything else: undo, export, open the shop, go back a version. */
  secondary?: React.ReactNode;
  /** A short live state — «حُفظت المسوّدة», «تعذّر الحفظ». Not help. */
  note?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const helpId = useId();

  return (
    <header className="mb-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-lg font-bold text-[var(--sys-heading)]">{title}</h1>
            {help && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls={helpId}
                // 44px of target around a 16px glyph: the tap-target rule
                // this task is held to, on the smallest control it adds.
                // One size at every width — a `md:` override here would be
                // a rule nothing else in the product uses, and the CSS
                // ratchet charges it to every page.
                className="tap-safe -m-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)]"
              >
                <RiInformationLine className="h-4 w-4" />
                <span className="sr-only">{open ? 'أخفِ الشرح' : 'اشرح لي هذه الشاشة'}</span>
              </button>
            )}
          </div>
          <p className="mt-0.5 max-w-2xl text-note text-[var(--sys-muted-foreground)]">{line}</p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {note}
          {secondary}
          {primary}
        </div>
      </div>

      {open && help && (
        <div
          id={helpId}
          className="mt-3 space-y-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3 text-xs leading-relaxed text-[var(--sys-muted-foreground)]"
        >
          {help}
        </div>
      )}
    </header>
  );
}
