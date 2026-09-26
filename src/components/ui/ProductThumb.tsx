'use client';

import React from 'react';
import clsx from 'clsx';
import { RiArchiveLine } from '@remixicon/react';

/**
 * Product thumbnail with professional default placeholder.
 * Used everywhere a product image appears (tables, cards, order details, offers).
 */
export function ProductThumb({
  src,
  alt,
  size = 'md',
  className,
}: {
  src?: string | null;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeStyles = {
    xs: 'w-8 h-8 rounded-lg',
    sm: 'w-10 h-10 rounded-lg',
    md: 'w-12 h-12 rounded-lg',
    lg: 'w-full h-full rounded-lg',
  };

  if (!src) {
    return (
      <div
        className={clsx(
          sizeStyles[size],
          'bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center shrink-0 overflow-hidden',
          className
        )}
      >
        <RiArchiveLine className={clsx('text-[var(--sys-border-strong)]', size === 'xs' ? 'w-3.5 h-3.5' : 'w-5 h-5')} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || 'صورة المنتج'}
      loading="lazy"
      className={clsx(sizeStyles[size], 'object-cover border border-[var(--sys-border)] bg-[var(--sys-card)] shrink-0', className)}
    />
  );
}
