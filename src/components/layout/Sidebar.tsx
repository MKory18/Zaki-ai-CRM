'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Factory,
  Boxes,
  Tag,
  Headphones,
  TrendingUp,
  DollarSign,
  Sparkles,
  Bell,
  History,
  Settings,
  ChevronRight,
  UserCog,
  CircleUser,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';

export function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { t, isRtl, currentUser } = useApp();

  const navItems = [
    { href: '/', label: t.dashboard, icon: LayoutDashboard, permission: null },
    { href: '/orders', label: t.orders, icon: ShoppingCart, permission: 'orders.view' },
    { href: '/customers', label: t.customers, icon: Users, permission: 'customers.view' },
    { href: '/products', label: t.products, icon: Package, permission: 'products.manage' },
    { href: '/production', label: t.production, icon: Factory, permission: 'production.manage' },
    { href: '/inventory', label: t.inventory, icon: Boxes, permission: 'inventory.manage' },
    { href: '/offers', label: t.offers, icon: Tag, permission: 'offers.manage' },
    { href: '/moderators', label: t.moderators, icon: Headphones, permission: 'moderators.manage' },
    { href: '/users', label: 'المستخدمون والأدوار', icon: UserCog, permission: 'users.manage' },
    { href: '/analytics', label: t.analytics, icon: TrendingUp, permission: 'reports.view' },
    { href: '/finance', label: t.finance, icon: DollarSign, permission: 'finance.view' },
    { href: '/ai-assistant', label: t.aiAssistant, icon: Sparkles, permission: 'ai.use', badge: 'AI' },
    { href: '/notifications', label: t.notifications, icon: Bell, permission: null },
    { href: '/audit-logs', label: t.auditLogs, icon: History, permission: 'audit.view' },
    { href: '/profile', label: 'الملف الشخصي', icon: CircleUser, permission: null },
    { href: '/settings', label: t.settings, icon: Settings, permission: 'settings.manage' },
  ];

  // Filter based on user role and permissions
  const visibleNavItems = navItems.filter((item) => {
    if (!currentUser) return true;
    if (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'COMPANY_ADMIN') return true;
    if (item.permission === null) return true;
    return currentUser.permissions.includes(item.permission as any);
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          'fixed top-0 bottom-0 z-40 flex flex-col w-64 bg-zinc-950 text-zinc-300 border-red-900 transition-transform duration-200 md:translate-x-0',
          isRtl ? 'right-0 border-l' : 'left-0 border-r',
          mobileOpen ? 'translate-x-0' : isRtl ? 'translate-x-full md:translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-zinc-800/80 bg-zinc-900/40">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Zaki AI" className="w-11 h-9 object-contain" />
            <div>
              <span className="font-black text-white tracking-wide text-base leading-tight block" dir="ltr">
                Zaki <span className="text-cyan-300">AI</span> Store
              </span>
              <span className="block text-[10px] text-cyan-400/80 font-semibold uppercase tracking-[0.18em]" dir="ltr">
                Intelligent Systems
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  'flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                  isActive
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-red-950/60'
                )}
              >
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <Icon
                    className={clsx(
                      'w-5 h-5 transition-colors',
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-red-400'
                    )}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-red-500 text-white shadow-xs">
                    {item.badge}
                  </span>
                ) : (
                  isActive && <ChevronRight className="w-4 h-4 opacity-70 rtl:rotate-180" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Current User Info / Company Badge */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-slate-200 font-bold text-xs uppercase">
              {currentUser?.name ? currentUser.name.slice(0, 2) : 'SF'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {currentUser?.name || 'BioDerma User'}
              </p>
              <p className="text-[10px] text-zinc-500 truncate">
                {currentUser?.role || 'COMPANY_ADMIN'} • {currentUser?.companyName || 'BioDerma'}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
