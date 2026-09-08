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
    default: 'bg-[#f8f9fa] text-[#252f4a] border-[#eef0f3]',
    success: 'bg-[#e8f8ef] text-[#25b865] border-[#d2f0de]',
    warning: 'bg-[#fdf4e8] text-[#e49e3d] border-[#f9e6cc]',
    danger: 'bg-[#fbeeef] text-[#d13b4c] border-[#f4d7da]',
    info: 'bg-[#e7f6fd] text-[#02a0e4] border-[#cfeefa]',
    purple: 'bg-[#f1edfb] text-[#7c5cd6] border-[#e2d9f5]',
    outline: 'bg-transparent text-[#4b5675] border-[#eef0f3]',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-[5px] text-xs font-medium border',
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
