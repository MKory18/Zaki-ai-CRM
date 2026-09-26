'use client';

import React from 'react';

/**
 * A TABLE ON A DESK, CARDS IN A HAND.
 *
 * A thirteen-column table on a 360px screen does one of two things: it
 * scrolls sideways, so the row's name is off-screen by the time you reach
 * the number you wanted; or it squeezes, so every cell wraps to four lines
 * and one row fills the phone. Both are the same mistake — a layout built
 * for a shape the device does not have.
 *
 * So the same data renders twice from ONE description of it: a table above
 * `md`, and a card per row below it, each field carrying its own label. Not
 * a second component, not a second query, not a second set of columns that
 * drifts from the first — one `columns` array, read two ways.
 *
 * `primary` marks the one or two fields that title the card. On a phone
 * somebody scans for the order number, not for the tenth column, and a card
 * whose heading is "٣" is a card nobody can scan.
 *
 * `hideOnPhone` drops a column from the cards only. A table can afford a
 * field that is occasionally useful; a card cannot, and thirteen labelled
 * lines is the sideways scroll again, turned vertical.
 */

export interface Column<T> {
  key: string;
  /** The column heading, and the label on the card. */
  label: string;
  render: (row: T) => React.ReactNode;
  /** Titles the card. Keep it to one or two. */
  primary?: boolean;
  /** In the table, not on the card. */
  hideOnPhone?: boolean;
  /** Numbers read right-aligned in a table and inline on a card. */
  align?: 'start' | 'end';
  className?: string;
}

export interface RowsProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Said when there is nothing — never an empty frame with no explanation. */
  empty?: React.ReactNode;
  /** Rendered under every card and after every table row's cells. */
  actions?: (row: T) => React.ReactNode;
  /**
   * Picking rows, for the screens that act on a batch of them.
   *
   * `canSelect` decides which rows may be picked at all — a shipment that
   * is not collectable has no checkbox rather than a checkbox that refuses.
   * On a phone the checkbox sits in the card's heading, where a thumb is,
   * instead of in a first column somebody has to aim at.
   */
  selection?: {
    canSelect: (row: T) => boolean;
    isSelected: (row: T) => boolean;
    onToggle: (row: T, next: boolean) => void;
  };
  /** Marks a row as needing attention — red on the desk, red on the card. */
  alert?: (row: T) => boolean;
}

export function Rows<T>({ columns, rows, keyOf, onRowClick, empty, actions, selection, alert }: RowsProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-6 text-center text-sm text-[var(--sys-muted-foreground)]">
        {empty ?? 'لا شيء هنا.'}
      </p>
    );
  }

  const onCard = columns.filter((c) => !c.hideOnPhone);
  const titles = onCard.filter((c) => c.primary);
  const details = onCard.filter((c) => !c.primary);

  return (
    <>
      {/* The desk. */}
      <div className="hidden overflow-hidden rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] md:block">
        <table className="w-full text-sm">
          <thead className="bg-[var(--sys-surface)] text-xs text-[var(--sys-muted-foreground)]">
            <tr>
              {selection && <th className="w-10 px-3 py-2" />}
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2 font-medium ${c.align === 'end' ? 'text-left' : 'text-right'}`}
                >
                  {c.label}
                </th>
              ))}
              {actions && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--sys-border)]">
            {rows.map((row) => (
              <tr
                key={keyOf(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`${onRowClick ? 'cursor-pointer hover:bg-[var(--sys-surface)]' : ''} ${
                  alert?.(row) ? 'bg-[var(--sys-destructive-soft)]/40' : ''
                }`}
              >
                {selection && (
                  <td className="px-3 py-2">
                    {selection.canSelect(row) && (
                      <input
                        type="checkbox"
                        checked={selection.isSelected(row)}
                        onChange={(e) => selection.onToggle(row, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 ${c.align === 'end' ? 'text-left' : 'text-right'} ${c.className ?? ''}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
                {actions && <td className="px-3 py-2">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The hand. */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li
            key={keyOf(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`rounded-lg border bg-[var(--sys-card)] p-3 ${
              alert?.(row)
                ? 'border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)]/40'
                : 'border-[var(--sys-border)]'
            }`}
          >
            {(titles.length > 0 || selection) && (
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sys-border)] pb-1.5">
                <span className="flex items-center gap-2">
                  {selection && selection.canSelect(row) && (
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={selection.isSelected(row)}
                      onChange={(e) => selection.onToggle(row, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {titles.map((c) => (
                    <span key={c.key} className="text-sm font-semibold text-[var(--sys-heading)]">
                      {c.render(row)}
                    </span>
                  ))}
                </span>
              </div>
            )}

            <dl className="space-y-1">
              {details.map((c) => (
                <div key={c.key} className="flex items-baseline justify-between gap-3">
                  {/* Every field says what it is. A bare number on a card is
                      a number somebody has to count columns to identify. */}
                  <dt className="shrink-0 text-caption text-[var(--sys-muted-foreground)]">{c.label}</dt>
                  <dd className={`min-w-0 text-xs text-[var(--sys-foreground)] ${c.className ?? ''}`}>
                    {c.render(row)}
                  </dd>
                </div>
              ))}
            </dl>

            {actions && (
              <div className="mt-2 flex flex-wrap gap-2 border-t border-[var(--sys-border)] pt-2">{actions(row)}</div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * THE ONE THING THIS SCREEN IS FOR, WHERE A THUMB ALREADY IS.
 *
 * A primary action at the top of a long screen on a phone is an action
 * somebody scrolls back up to reach, every time. Pinned to the bottom it is
 * always one tap away — above the nav bar, and above the home indicator.
 *
 * Phones only. On a desk the button belongs beside the thing it acts on.
 */
export function ThumbBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 z-20 border-t border-[var(--sys-border)] bg-[var(--sys-card)] p-3 md:hidden"
      style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  );
}
