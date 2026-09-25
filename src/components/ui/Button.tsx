import React from 'react';
import clsx from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  /**
   * A HEIGHT, NOT A GUESS AT ONE.
   *
   * These used to be padding alone, so the height came out of whatever font
   * size the size carried — and a toolbar ended up with an input at 34px, a
   * button at 30, a second button at 32 and a dropdown at 36, all in one
   * row. Nobody chose four heights; four heights were arithmetic.
   *
   * So the height is stated. Three steps and no more:
   *
   *   sm  32px  a control inside a row — a row action, a chip
   *   md  40px  everything else: toolbars, forms, dialogs
   *   lg  48px  the one action a screen is for, big enough for a thumb
   */
  const sizeStyles = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-5 text-base',
  };

  const variantStyles = {
    primary: 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-primary)]/85 border border-transparent',
    secondary: 'bg-[var(--sys-surface)] text-[var(--sys-heading)] hover:bg-[var(--sys-border)] border border-[var(--sys-border)]',
    outline: 'bg-[var(--sys-card)] text-[var(--sys-heading)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)]',
    danger: 'bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-destructive)]/85 border border-transparent',
    ghost: 'bg-transparent text-[var(--sys-foreground)] hover:bg-[var(--sys-surface)] border border-transparent',
    success: 'bg-[var(--sys-success)] text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-success)]/85 border border-transparent',
  };

  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        // `rounded-lg` with no step is Tailwind's 4px, and it put the one
        // pink button in a filter bar on tighter corners than every input
        // beside it. Controls are surfaces too.
        'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      )}
      {children}
    </button>
  );
}
