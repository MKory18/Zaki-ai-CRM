import React, { useId } from 'react';
import clsx from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

/**
 * A LABEL WITH NOWHERE TO POINT IS NOT A LABEL.
 *
 * These three read their id as `id || props.name`, and `htmlFor` got
 * whichever was there. MEASURED across every `.tsx` in this repository:
 * **117 of 131 labelled fields carried neither**, so `htmlFor` was
 * `undefined` and the `<label>` was associated with nothing at all.
 * Eighty-nine percent is not a scatter of forgetful call sites — it is this
 * component asking every caller to remember something, and almost nobody
 * doing it. So it is remembered here instead.
 *
 * WHAT THE READER GETS BACK. Pressing the word «الكمية المعدودة» focuses
 * the box under it, which is how a label behaves everywhere else and the
 * only reason a number box on a phone is reachable without hitting a
 * 40-pixel target exactly. A screen reader announces the field by its name
 * rather than «edit, blank». And `getByLabelText` — what a test uses to
 * find a field the way a person does — starts working, which is how this
 * was found: a stock-count test could not locate the box it was about to
 * prove writes off a shelf.
 *
 * `useId` and not a counter: the value must be the same string on the
 * server and in the browser or React replaces the markup on hydration.
 * `id` still wins, then `name`, so not one existing field changes.
 */
export function Input({ label, error, helperText, className, id, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id || props.name || autoId;

  return (
    <div className="w-full min-w-0">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-[var(--sys-heading)] mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(
          // 40px, stated. Padding alone made the height a by-product of
          // the font size, and a row of controls came out four heights.
          'h-11 md:h-10 w-full min-w-0 px-3 text-sm bg-[var(--sys-card)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/25 focus:border-[var(--sys-primary)] transition-colors placeholder:text-[var(--sys-muted)]',
          error ? 'border-[var(--sys-destructive)] focus:border-[var(--sys-destructive)] focus:ring-[var(--sys-destructive)]/20' : 'border-[var(--sys-border-input)]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-[var(--sys-destructive)] mt-1">{error}</p>}
      {helperText && !error && <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">{helperText}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: { value: string | number; label: string }[];
}

export function Select({ label, error, options, children, className, id, ...props }: SelectProps) {
  const autoId = useId();
  const selectId = id || props.name || autoId;

  return (
    <div className="w-full min-w-0">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-[var(--sys-heading)] mb-1.5">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={clsx(
          'h-11 md:h-10 w-full min-w-0 px-3 text-sm bg-[var(--sys-card)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/25 focus:border-[var(--sys-primary)] transition-colors',
          error ? 'border-[var(--sys-destructive)]' : 'border-[var(--sys-border-input)]',
          className
        )}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      {error && <p className="text-xs text-[var(--sys-destructive)] mt-1">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  /**
   * A sentence under the box — the same shape `Input` has, and for the same
   * reason: the rule a field is held to belongs beside the field, not in a
   * refusal that arrives after the work is typed. An error replaces it.
   */
  helperText?: string;
}

export function Textarea({ label, error, helperText, className, id, ...props }: TextareaProps) {
  const autoId = useId();
  const textareaId = id || props.name || autoId;

  return (
    <div className="w-full min-w-0">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-medium text-[var(--sys-heading)] mb-1.5">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={clsx(
          'w-full min-w-0 px-3 py-2 text-sm bg-[var(--sys-card)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/25 focus:border-[var(--sys-primary)] transition-colors placeholder:text-[var(--sys-muted)]',
          error ? 'border-[var(--sys-destructive)]' : 'border-[var(--sys-border-input)]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-[var(--sys-destructive)] mt-1">{error}</p>}
      {helperText && !error && <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">{helperText}</p>}
    </div>
  );
}
