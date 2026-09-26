'use client';

import React from 'react';
import { EmptyState } from './EmptyState';

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
  /** Absent while the request is in the air; drawn as empty. */
  rows: T[] | null | undefined;
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
    /**
     * Pick every selectable row at once, or drop them all.
     *
     * Not optional out of politeness: picking thirty orders one at a time
     * is the reason people stop picking and print them one by one. It sits
     * in the table's own heading on a desk, and above the cards on a
     * phone, where there is no heading row to put it in.
     */
    onToggleAll?: (next: boolean) => void;
  };
  /** Marks a row as needing attention — red on the desk, red on the card. */
  alert?: (row: T) => boolean;
}

export function Rows<T>({ columns, rows, keyOf, onRowClick, empty, actions, selection, alert }: RowsProps<T>) {
  /**
   * A LIST THAT HAS NOT ARRIVED IS NOT A CRASH.
   *
   * `rows.length` on an undefined list took the dashboard down with
   * «Cannot read properties of undefined» — the orders come from
   * `analytics?.orders?.slice(…)`, which is undefined until the request
   * lands. Every screen that fetches has that moment, and a shared table
   * that dies in it is a trap set for every future caller.
   *
   * Nothing is invented: an absent list draws exactly what an empty one
   * draws, which is the truth of the situation.
   */
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
        {empty ?? (
          // The default says as little as it honestly can. A list that is
          // empty because a filter is narrow and a list that is empty
          // because nothing was ever created are different situations with
          // different answers, and only the SCREEN knows which it is — so
          // the caller passes an <EmptyState> that names the one it means.
          <EmptyState
            title="لا شيء هنا"
            why="إمّا أنّ الفلاتر أضيق من أن تُطابق شيئاً، أو لم يُسجَّل شيءٌ بعد."
          />
        )}
      </div>
    );
  }

  const selectable = selection ? rows.filter(selection.canSelect) : [];
  const allPicked = selectable.length > 0 && selectable.every(selection!.isSelected);

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
              {selection && (
                <th className="w-10 px-3 py-2">
                  {selection.onToggleAll && selectable.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allPicked}
                      onChange={(e) => selection.onToggleAll!(e.target.checked)}
                      aria-label={allPicked ? 'ألغِ اختيار الكل' : 'اختر الكل'}
                    />
                  )}
                </th>
              )}
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
      {selection?.onToggleAll && selectable.length > 0 && (
        // There is no heading row on a phone, so the select-all sits above
        // the cards. Without it the only way to pick thirty is thirty taps.
        <label className="mb-2 flex items-center gap-2 px-1 text-xs text-[var(--sys-muted-foreground)] md:hidden">
          <input
            type="checkbox"
            checked={allPicked}
            onChange={(e) => selection.onToggleAll!(e.target.checked)}
          />
          {allPicked ? 'ألغِ اختيار الكل' : `اختر الكل (${selectable.length})`}
        </label>
      )}
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
                  <dt className="shrink-0 text-xs text-[var(--sys-muted-foreground)]">{c.label}</dt>
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
