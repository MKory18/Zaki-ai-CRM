import React from 'react';
import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-[var(--sys-card)] rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-all',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  /**
   * Rendered inside the card's own <h3>, so pass text — or inline content
   * such as a <span> carrying an icon. A heading or a block element here
   * produces invalid HTML and a hydration error at runtime, which React
   * only reports once the screen is opened.
   */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between px-6 py-4 border-b border-[var(--sys-border)]',
        className
      )}
    >
      <div>
        <h3 className="text-base font-semibold text-[var(--sys-heading)]">{title}</h3>
        {subtitle && <p className="text-xs text-[var(--sys-muted-foreground)] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={clsx('p-6', className)}>{children}</div>;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: any;
  trend?: { value: string; positive: boolean };
  color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';
}) {
  const colorMap = {
    blue: 'bg-[var(--sys-primary-soft)] text-[var(--sys-primary)] border-[var(--sys-primary-soft)]',
    emerald: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success-soft)]',
    amber: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]',
    rose: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]',
    purple: 'bg-[var(--sys-primary-soft)] text-[var(--sys-info)] border-[var(--sys-primary-soft)]',
    slate: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
  };

  return (
    <div className="bg-[var(--sys-card)] rounded-[8px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--sys-muted-foreground)] uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className={clsx('p-2 rounded-lg border', colorMap[color])}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <div className="text-2xl font-semibold text-[var(--sys-heading)]">{value}</div>
        {trend && (
          <span
            className={clsx(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              trend.positive ? 'bg-[var(--sys-success-soft)] text-[var(--sys-success)]' : 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)]'
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">{subtitle}</p>}
    </div>
  );
}
