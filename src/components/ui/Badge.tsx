'use client';

import React from 'react';
import clsx from 'clsx';
import { useApp } from '@/context/AppContext';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variantStyles = {
    default: 'bg-[var(--sys-surface)] text-[var(--sys-heading)] border-[var(--sys-border)]',
    success: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success-soft)]',
    warning: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]',
    danger: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]',
    info: 'bg-[var(--sys-info-soft)] text-[var(--sys-info)] border-[var(--sys-info)]',
    purple: 'bg-[var(--sys-surface)] text-[var(--sys-info)] border-[var(--sys-info-soft)]',
    outline: 'bg-transparent text-[var(--sys-foreground)] border-[var(--sys-border)]',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Locale-aware order status labels — never shows raw enum values */
export function OrderStatusBadge({ status }: { status: string }) {
  const { t, locale } = useApp();

  const labels: Record<string, { ar: string; en: string; variant: Parameters<typeof Badge>[0]['variant'] }> = {
    NEW: { ar: 'جديد', en: 'New', variant: 'info' },
    CONTACTING: { ar: 'قيد التواصل', en: 'Contacting', variant: 'purple' },
    NO_ANSWER: { ar: 'لا يجيب', en: 'No Answer', variant: 'warning' },
    CONFIRMED: { ar: 'مؤكد', en: 'Confirmed', variant: 'success' },
    POSTPONED: { ar: 'مؤجل', en: 'Postponed', variant: 'warning' },
    REJECTED: { ar: 'مرفوض', en: 'Rejected', variant: 'danger' },
    READY_FOR_SHIPPING: { ar: 'جاهز للشحن', en: 'Ready for Shipping', variant: 'info' },
    SHIPPED: { ar: 'تم الشحن', en: 'Shipped', variant: 'purple' },
    OUT_FOR_DELIVERY: { ar: 'خرج للتوصيل', en: 'Out for Delivery', variant: 'warning' },
    DELIVERED: { ar: 'تم التوصيل', en: 'Delivered', variant: 'success' },
    CANCELLED: { ar: 'ملغى', en: 'Cancelled', variant: 'danger' },
    RETURNED: { ar: 'مرتجع', en: 'Returned', variant: 'danger' },
    FAILED_DELIVERY: { ar: 'فشل التوصيل', en: 'Failed Delivery', variant: 'danger' },
  };

  const cfg = labels[status];
  if (!cfg) return <Badge variant="default">{status}</Badge>;

  return <Badge variant={cfg.variant}>{locale === 'ar' ? cfg.ar : cfg.en}</Badge>;
}
