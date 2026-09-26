'use client';

import React from 'react';

/**
 * THE TOP OF EVERY SCREEN, SET ONCE.
 *
 * Fifty-five titles across fifty-one screens, each sized by whoever wrote
 * that screen: `text-2xl` here, `text-xl` there, some with a line under
 * them, some without, the actions above the title on one and below it on
 * the next. Nothing about that was decided; it accumulated.
 *
 * Three parts and a fixed order:
 *
 *   The NAME of the screen, as the menu says it. If the two disagree,
 *   somebody who clicked «المرتجعات» and landed on «إدارة الإرجاعات»
 *   spends a moment wondering whether they arrived.
 *
 *   One line of what the screen is FOR — the sentence that stops a person
 *   opening it, reading it, and leaving to ask somebody.
 *
 *   The actions, at the end of the row on a desk and under the title on a
 *   phone, where they do not push the name off the screen.
 *
 * Separated by space, not by a rule. A border under every page title is a
 * line the eye has to cross fifty times a day for no information.
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  /** One sentence. What this screen answers. */
  description?: string;
  /** Buttons. On a phone they wrap under the title rather than squeeze it. */
  actions?: React.ReactNode;
  /** A chip or a count that belongs beside the name, not in the sentence. */
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-[var(--sys-heading)]">{title}</h1>
          {children}
        </div>
        {description && (
          <p className="mt-1 max-w-2xl text-note text-[var(--sys-muted-foreground)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
