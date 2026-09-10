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
  const sizeStyles = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  const variantStyles = {
    primary: 'bg-[#b8256e] text-white hover:bg-[#b8256e]/85 border border-transparent',
    secondary: 'bg-[#f8fafc] text-[#121926] hover:bg-[#e3e8ef] border border-[#e3e8ef]',
    outline: 'bg-white text-[#121926] hover:bg-[#f8fafc] border border-[#e3e8ef]',
    danger: 'bg-[#fb323f] text-white hover:bg-[#fb323f]/85 border border-transparent',
    ghost: 'bg-transparent text-[#364152] hover:bg-[#f8fafc] border border-transparent',
    success: 'bg-[#00c853] text-white hover:bg-[#00c853]/85 border border-transparent',
  };

  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-[#b8256e] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
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
