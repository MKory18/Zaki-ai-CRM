import React from 'react';
import clsx from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, className, id, ...props }: InputProps) {
  const inputId = id || props.name;

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
          'h-10 w-full min-w-0 px-3 text-sm bg-[var(--sys-card)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/25 focus:border-[var(--sys-primary)] transition-colors placeholder:text-[var(--sys-muted)]',
          error ? 'border-[var(--sys-destructive)] focus:border-[var(--sys-destructive)] focus:ring-[var(--sys-destructive)]/20' : 'border-[var(--sys-border)]',
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
  const selectId = id || props.name;

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
          'h-10 w-full min-w-0 px-3 text-sm bg-[var(--sys-card)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/25 focus:border-[var(--sys-primary)] transition-colors',
          error ? 'border-[var(--sys-destructive)]' : 'border-[var(--sys-border)]',
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
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const textareaId = id || props.name;

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
          error ? 'border-[var(--sys-destructive)]' : 'border-[var(--sys-border)]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-[var(--sys-destructive)] mt-1">{error}</p>}
    </div>
  );
}
