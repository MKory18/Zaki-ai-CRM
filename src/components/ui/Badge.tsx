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
    default: 'bg-[#f8fafc] text-[#121926] border-[#e3e8ef]',
    success: 'bg-[#e6f9ee] text-[#00c853] border-[#c8f2d8]',
    warning: 'bg-[#fff6e5] text-[#ffab00] border-[#ffe7b8]',
    danger: 'bg-[#feecee] text-[#fb323f] border-[#fecdd1]',
    info: 'bg-[#e7f6fd] text-[#13b5fe] border-[#cfeefa]',
    purple: 'bg-[#f3effe] text-[#8c72f7] border-[#e4dafb]',
    outline: 'bg-transparent text-[#364152] border-[#e3e8ef]',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-[8px] text-xs font-medium border',
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
