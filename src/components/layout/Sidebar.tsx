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
  ShieldCheck,
  Lock,
  ListChecks,
  Calendar,
  FileText,
  Globe,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';

export function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { t, isRtl, currentUser } = useApp();

  const navItems = [
    { href: '/', label: t.dashboard, icon: LayoutDashboard, permission: null },
    { href: '/orders', label: t.orders, icon: ShoppingCart, permission: 'orders.view' },
    { href: '/customers', label: t.customers, icon: Users, permission: 'customers.view' },
    { href: '/products', label: t.products, icon: Package, permission: 'products.edit' },
    { href: '/production', label: t.production, icon: Factory, permission: 'production.manage' },
    { href: '/inventory', label: t.inventory, icon: Boxes, permission: 'inventory.view' },
    { href: '/offers', label: t.offers, icon: Tag, permission: 'offers.manage' },
    { href: '/moderators', label: t.moderators, icon: Headphones, permission: 'users.view' },
    { href: '/users', label: t.employees, icon: UserCog, permission: 'users.view' },
    { href: '/roles', label: t.roles, icon: ShieldCheck, permission: 'roles.view' },
    { href: '/permissions', label: 'الصلاحيات', icon: Lock, permission: 'roles.view' },
    { href: '/analytics', label: t.analytics, icon: TrendingUp, permission: 'reports.view' },
    { href: '/finance', label: t.finance, icon: DollarSign, permission: 'finance.view' },
    { href: '/ai-assistant', label: t.aiAssistant, icon: Sparkles, permission: 'ai.use', badge: 'AI' },
    { href: '/notifications', label: t.notifications, icon: Bell, permission: null },
    { href: '/audit-logs', label: t.auditLogs, icon: History, permission: 'audit.view' },
    { href: '/profile', label: 'الملف الشخصي', icon: CircleUser, permission: null },
    { href: '/settings', label: t.settings, icon: Settings, permission: 'settings.edit' },
  ];

  const crmNavItems = [
    { href: '/dashboards/crm/contacts', label: 'جهات الاتصال', icon: Users, permission: 'crm.view' },
    { href: '/dashboards/crm/tasks', label: 'المهام', icon: ListChecks, permission: 'crm.view' },
    { href: '/dashboards/crm/calendar', label: 'التقويم', icon: Calendar, permission: 'crm.view' },
    { href: '/dashboards/crm/invoices', label: 'الفواتير', icon: FileText, permission: 'crm.view' },
    { href: '/dashboards/crm/landing-pages', label: 'صفحات الهبوط', icon: Globe, permission: 'landing_pages.view' },
  ];

  // Filter based on user role and permissions
  const visibleNavItems = navItems.filter((item) => {
    if (!currentUser) return true;
    if (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'COMPANY_ADMIN') return true;
    if (item.permission === null) return true;
    return currentUser.permissions.includes(item.permission as any);
  });

  const visibleCrmItems = crmNavItems.filter((item) => {
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
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          'fixed top-0 bottom-0 z-40 flex flex-col w-[280px] bg-[#121926] text-[#697586] transition-transform duration-200 md:translate-x-0',
          isRtl ? 'right-0' : 'left-0',
          mobileOpen ? 'translate-x-0' : isRtl ? 'translate-x-full md:translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center h-[72px] px-5 border-b border-[#202939] shrink-0">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Zaki AI" className="w-11 h-9 object-contain" />
            <div>
              <span className="font-bold text-white tracking-wide text-base leading-tight block" dir="ltr">
                Zaki <span className="text-[#b8256e]">AI</span> Store
              </span>
              <span className="block text-[10px] text-[#697586] font-semibold uppercase tracking-[0.18em]" dir="ltr">
                Intelligent Systems
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto sidebar-scroll py-4 space-y-0.5">
          <p className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5b6474]">
            Menu
          </p>
          {[...visibleNavItems, ...visibleCrmItems.map((item) => ({ ...item, isCrm: true }))].map((item, idx) => {
            const Icon = item.icon;
            const isCrm = (item as any).isCrm === true;
            const crmDashboard = isCrm && item.href === '/dashboards/crm';
            const isActive = isCrm
              ? crmDashboard
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/')
              : pathname === item.href;
            const showGroupLabel = isCrm && idx === visibleNavItems.length;

            return (
              <React.Fragment key={item.href}>
                {showGroupLabel && (
                  <p className="px-5 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5b6474]">
                    CRM
                  </p>
                )}
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={clsx(
                    'flex items-center justify-between mx-3 px-2 py-2.5 rounded-[8px] text-sm font-medium transition-colors group',
                    isActive
                      ? 'bg-[#b8256e] text-white'
                      : 'text-[#697586] hover:text-white hover:bg-[#1a2232]'
                  )}
                >
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <span
                      className={clsx(
                        'w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-colors',
                        isActive ? 'bg-white/10 text-white' : 'bg-[#1a2232] text-[#697586] group-hover:text-white'
                      )}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {(item as any).badge ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#b8256e] text-white">
                      {(item as any).badge}
                    </span>
                  ) : (
                    isActive && <ChevronRight className="w-4 h-4 opacity-70 rtl:rotate-180" />
                  )}
                </Link>
              </React.Fragment>
            );
          })}
        </div>

        {/* Current User Info / Company Badge */}
        <div className="p-3 border-t border-[#202939]">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-8 h-8 rounded-full bg-[#1a2232] border border-[#364152] flex items-center justify-center text-[#9aa4b2] font-bold text-xs uppercase">
              {currentUser?.name ? currentUser.name.slice(0, 2) : 'SF'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {currentUser?.name || 'BioDerma User'}
              </p>
              <p className="text-[10px] text-[#697586] truncate">
                {currentUser?.role || 'COMPANY_ADMIN'}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
