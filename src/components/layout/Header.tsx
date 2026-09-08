'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { apiFetch } from '@/lib/api-client';
import clsx from 'clsx';

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { locale, setLocale, t, currentUser, switchDemoRole } = useApp();
  const router = useRouter();
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real unread count for the bell dot (poll every 60s).
  // Uses ?countOnly=1 (lightweight { unreadCount } contract). If the server
  // doesn't return an unreadCount field, fall back to the old full response.
  useEffect(() => {
    const loadUnread = async () => {
      try {
        const res = await apiFetch('/api/notifications?countOnly=1');
        if (res.ok) {
          const data = await res.json();
          if (typeof data.unreadCount === 'number') {
            setUnreadCount(data.unreadCount);
          } else {
            // Fallback: old full-response shape
            setUnreadCount(data.notifications?.filter((n: any) => !n.isRead).length || 0);
          }
        }
      } catch {
        // non-fatal — keep last known count
      }
    };
    loadUnread();
    const interval = setInterval(() => {
      if (!document.hidden) loadUnread();
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Global search: Enter, or debounce 400ms once ≥ 2 chars → orders page
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        router.push(`/orders?q=${encodeURIComponent(value.trim())}`);
      }, 400);
    }
  };
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      router.push(`/orders?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

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
    <header className="sticky top-0 z-30 flex items-center justify-between h-[72px] px-3 bg-[#f8f9fa] border-b border-[#eef0f3]">
      {/* Left: Mobile Toggle & Global Search */}
      <div className="flex items-center space-x-3 rtl:space-x-reverse flex-1 max-w-md">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 rounded-[5px] text-[#252f4a] hover:text-[#3e97ff] hover:bg-white md:hidden cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative w-full hidden sm:block">
          <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9aa0aa]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={`${t.search} (Orders, Customers, Phone)...`}
            className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-1.5 text-xs bg-white border border-[#eef0f3] rounded-[5px] focus:outline-none focus:ring-2 focus:ring-[#3e97ff]/25 focus:border-[#3e97ff] transition-colors"
          />
        </div>
      </div>

      {/* Right: Actions, Language, Demo Role Switcher, Notifications, User */}
      <div className="flex items-center space-x-2 md:space-x-3 rtl:space-x-reverse">
        {/* Company Name Badge */}
        <div className="hidden lg:flex items-center space-x-1.5 rtl:space-x-reverse px-2.5 py-1 bg-[#eef0f3] rounded-[5px] text-xs font-medium text-[#252f4a]">
          <Building2 className="w-3.5 h-3.5 text-[#6b7177]" />
          <span>{currentUser?.companyName || 'BioDerma International'}</span>
        </div>

        {/* Demo Role Switcher Dropdown — SUPER_ADMIN only */}
        {currentUser?.role === 'SUPER_ADMIN' && (
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            className="flex items-center space-x-1.5 rtl:space-x-reverse px-2.5 py-1.5 text-xs font-semibold rounded-[5px] bg-[#eaf3ff] text-[#3e97ff] hover:bg-[#d6e8ff] border border-[#c6e1ff] transition-colors cursor-pointer"
            title="Switch User Role for instant evaluation"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Role: {currentUser?.role || 'Switch'}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {roleMenuOpen && (
            <div className="absolute right-0 rtl:right-auto rtl:left-0 mt-2 w-64 bg-white rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-[#eef0f3] py-1.5 z-50">
              <div className="px-3 py-1.5 border-b border-[#eef0f3]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#9aa0aa]">
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
                    'w-full text-left rtl:text-right px-3 py-2 text-xs flex flex-col hover:bg-[#f8f9fa] transition-colors cursor-pointer',
                    currentUser?.email === acc.email ? 'bg-[#eaf3ff] text-[#3e97ff] font-semibold' : 'text-[#4b5675]'
                  )}
                >
                  <span>{acc.label}</span>
                  <span className="text-[10px] text-[#9aa0aa]">{acc.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Language Switcher */}
        <button
          onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
          className="flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium text-[#252f4a] hover:text-[#3e97ff] hover:bg-white rounded-[5px] border border-[#eef0f3] transition-colors cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-[#6b7177]" />
          <span>{locale === 'en' ? 'العربية' : 'English'}</span>
        </button>

        {/* Notifications Icon — dot shows real unread count only */}
        <Link
          href="/notifications"
          className="relative p-2 text-[#252f4a] hover:text-[#3e97ff] hover:bg-white rounded-[5px] transition-colors"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 flex items-center justify-center bg-[#d13b4c] text-white text-[9px] font-bold rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title={t.logout}
          className="p-2 text-[#252f4a] hover:text-[#d13b4c] hover:bg-[#fbeeef] rounded-[5px] transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
