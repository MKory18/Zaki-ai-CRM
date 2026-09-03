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
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(
          'w-full px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors placeholder:text-slate-400',
          error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-300',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
      {helperText && !error && <p className="text-xs text-slate-500 mt-1">{helperText}</p>}
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
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={clsx(
          'w-full px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors',
          error ? 'border-rose-400' : 'border-slate-300',
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
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
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
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={clsx(
          'w-full px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors placeholder:text-slate-400',
          error ? 'border-rose-400' : 'border-slate-300',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  );
}
