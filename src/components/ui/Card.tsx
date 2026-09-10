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
        'bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-all',
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
        'flex items-center justify-between px-6 py-4 border-b border-[#e3e8ef]',
        className
      )}
    >
      <div>
        <h3 className="text-base font-semibold text-[#121926]">{title}</h3>
        {subtitle && <p className="text-xs text-[#697586] mt-0.5">{subtitle}</p>}
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
    blue: 'bg-[#fdf5fa] text-[#b8256e] border-[#f2c9dd]',
    emerald: 'bg-[#e6f9ee] text-[#00c853] border-[#c8f2d8]',
    amber: 'bg-[#fff6e5] text-[#ffab00] border-[#ffe7b8]',
    rose: 'bg-[#feecee] text-[#fb323f] border-[#fecdd1]',
    purple: 'bg-[#fdf5fa] text-[#13b5fe] border-[#f2c9dd]',
    slate: 'bg-[#f8fafc] text-[#697586] border-[#e3e8ef]',
  };

  return (
    <div className="bg-white rounded-[8px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#697586] uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className={clsx('p-2 rounded-lg border', colorMap[color])}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <div className="text-2xl font-semibold text-[#121926]">{value}</div>
        {trend && (
          <span
            className={clsx(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              trend.positive ? 'bg-[#e6f9ee] text-[#00c853]' : 'bg-[#feecee] text-[#fb323f]'
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-[#697586] mt-1">{subtitle}</p>}
    </div>
  );
}
