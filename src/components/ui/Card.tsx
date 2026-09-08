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
        'bg-white rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-all',
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
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between px-6 py-4 border-b border-[#eef0f3]',
        className
      )}
    >
      <div>
        <h3 className="text-base font-semibold text-[#252f4a]">{title}</h3>
        {subtitle && <p className="text-xs text-[#6b7177] mt-0.5">{subtitle}</p>}
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
    blue: 'bg-[#eaf3ff] text-[#3e97ff] border-[#d6e8ff]',
    emerald: 'bg-[#e8f8ef] text-[#25b865] border-[#d2f0de]',
    amber: 'bg-[#fdf4e8] text-[#e49e3d] border-[#f9e6cc]',
    rose: 'bg-[#fbeeef] text-[#d13b4c] border-[#f4d7da]',
    purple: 'bg-[#eaf3ff] text-[#02a0e4] border-[#d6e8ff]',
    slate: 'bg-[#f8f9fa] text-[#6b7177] border-[#eef0f3]',
  };

  return (
    <div className="bg-white rounded-[10px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#6b7177] uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className={clsx('p-2 rounded-lg border', colorMap[color])}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <div className="text-2xl font-semibold text-[#252f4a]">{value}</div>
        {trend && (
          <span
            className={clsx(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              trend.positive ? 'bg-[#e8f8ef] text-[#25b865]' : 'bg-[#fbeeef] text-[#d13b4c]'
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-[#6b7177] mt-1">{subtitle}</p>}
    </div>
  );
}
