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
        <label htmlFor={inputId} className="block text-xs font-medium text-[#121926] mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(
          'w-full px-3 py-2 text-sm bg-white border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[#b8256e]/25 focus:border-[#b8256e] transition-colors placeholder:text-[#9aa4b2]',
          error ? 'border-[#fb323f] focus:border-[#fb323f] focus:ring-[#fb323f]/20' : 'border-[#e3e8ef]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-[#fb323f] mt-1">{error}</p>}
      {helperText && !error && <p className="text-xs text-[#697586] mt-1">{helperText}</p>}
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
        <label htmlFor={selectId} className="block text-xs font-medium text-[#121926] mb-1.5">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={clsx(
          'w-full px-3 py-2 text-sm bg-white border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[#b8256e]/25 focus:border-[#b8256e] transition-colors',
          error ? 'border-[#fb323f]' : 'border-[#e3e8ef]',
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
      {error && <p className="text-xs text-[#fb323f] mt-1">{error}</p>}
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
        <label htmlFor={textareaId} className="block text-xs font-medium text-[#121926] mb-1.5">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={clsx(
          'w-full px-3 py-2 text-sm bg-white border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[#b8256e]/25 focus:border-[#b8256e] transition-colors placeholder:text-[#9aa4b2]',
          error ? 'border-[#fb323f]' : 'border-[#e3e8ef]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-[#fb323f] mt-1">{error}</p>}
    </div>
  );
}
