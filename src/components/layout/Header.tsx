'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Menu,
  Search,
  Bell,
  Globe,
  UserCheck,
  LogOut,
  Building2,
  ChevronDown,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import clsx from 'clsx';

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { locale, setLocale, t, currentUser, switchDemoRole } = useApp();
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const demoAccounts = [
    { label: 'CEO / Company Admin', email: 'admin@bioderma.com', role: 'COMPANY_ADMIN' },
    { label: 'Sales Manager', email: 'manager@bioderma.com', role: 'MANAGER' },
    { label: 'Sara (Senior Moderator)', email: 'sara@bioderma.com', role: 'MODERATOR' },
    { label: 'Omar (Moderator)', email: 'omar@bioderma.com', role: 'MODERATOR' },
    { label: 'Chief Accountant', email: 'finance@bioderma.com', role: 'ACCOUNTANT' },
    { label: 'Delivery & Shipping Mgr', email: 'shipping@bioderma.com', role: 'DELIVERY_MANAGER' },
    { label: 'Platform Super Admin', email: 'superadmin@salesflow.io', role: 'SUPER_ADMIN' },
  ];

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Full navigation guarantees protected pages re-verify auth server-side (middleware)
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-8 bg-white border-b border-slate-200/80 shadow-xs">
      {/* Left: Mobile Toggle & Global Search */}
      <div className="flex items-center space-x-3 rtl:space-x-reverse flex-1 max-w-md">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 md:hidden cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative w-full hidden sm:block">
          <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`${t.search} (Orders, Customers, Phone)...`}
            className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors"
          />
        </div>
      </div>

      {/* Right: Actions, Language, Demo Role Switcher, Notifications, User */}
      <div className="flex items-center space-x-2 md:space-x-3 rtl:space-x-reverse">
        {/* Company Name Badge */}
        <div className="hidden lg:flex items-center space-x-1.5 rtl:space-x-reverse px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-700">
          <Building2 className="w-3.5 h-3.5 text-slate-500" />
          <span>{currentUser?.companyName || 'BioDerma International'}</span>
        </div>

        {/* Demo Role Switcher Dropdown — SUPER_ADMIN only */}
        {currentUser?.role === 'SUPER_ADMIN' && (
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            className="flex items-center space-x-1.5 rtl:space-x-reverse px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer"
            title="Switch User Role for instant evaluation"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Role: {currentUser?.role || 'Switch'}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {roleMenuOpen && (
            <div className="absolute right-0 rtl:right-auto rtl:left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Switch Active Role (RBAC Demo)
                </p>
              </div>
              {demoAccounts.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => {
                    setRoleMenuOpen(false);
                    switchDemoRole(acc.email);
                  }}
                  className={clsx(
                    'w-full text-left rtl:text-right px-3 py-2 text-xs flex flex-col hover:bg-slate-50 transition-colors cursor-pointer',
                    currentUser?.email === acc.email ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-700'
                  )}
                >
                  <span>{acc.label}</span>
                  <span className="text-[10px] text-slate-400">{acc.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Language Switcher */}
        <button
          onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
          className="flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-slate-500" />
          <span>{locale === 'en' ? 'العربية' : 'English'}</span>
        </button>

        {/* Notifications Icon */}
        <Link
          href="/notifications"
          className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-600 rounded-full" />
        </Link>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title={t.logout}
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
