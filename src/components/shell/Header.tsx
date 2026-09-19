'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, Repeat, Search, Store } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { ROLE_LABELS } from '@/types/auth';

export interface ShellContextInfo {
  storeName: string;
  storePaused: boolean;
  countryName: string;
  currencyCode: string;
  canSwitch: boolean;
}

export function Header({
  onMenuClick,
  userName,
  userRole,
  context,
}: {
  onMenuClick: () => void;
  userName: string;
  userRole: string;
  context: ShellContextInfo;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) router.push(`/orders?q=${encodeURIComponent(query.trim())}`);
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-30 h-[72px] bg-white border-b border-[#e3e8ef] flex items-center gap-3 px-4 md:px-6">
      <button onClick={onMenuClick} className="md:hidden p-2 rounded-[8px] hover:bg-[#f8fafc]" aria-label="القائمة">
        <Menu className="w-5 h-5 text-[#364152]" />
      </button>

      {/* Country + store context, always visible: every request carries it */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef]">
        <Store className="w-4 h-4 text-[#b8256e] shrink-0" />
        <div className="leading-tight min-w-0">
          <p className="text-xs font-semibold text-[#121926] truncate max-w-[160px]">{context.storeName}</p>
          <p className="text-[10px] text-[#697586] truncate">
            {context.countryName} · {context.currencyCode}
            {context.storePaused && <span className="text-[#fb323f]"> · موقوف</span>}
          </p>
        </div>
        {context.canSwitch && (
          <Link
            href="/entry?change=1"
            className="mr-1 p-1.5 rounded-[6px] text-[#697586] hover:text-[#b8256e] hover:bg-white"
            title="تبديل البلد أو المتجر"
          >
            <Repeat className="w-4 h-4" />
          </Link>
        )}
      </div>

      <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-md items-center relative">
        <Search className="w-4 h-4 text-[#9aa4b2] absolute right-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث برقم الطلب أو اسم العميل أو الهاتف"
          className="w-full h-10 pr-9 pl-3 rounded-[8px] border border-[#e3e8ef] bg-[#f8fafc] text-sm focus:outline-none focus:border-[#b8256e]"
        />
      </form>

      <div className="flex items-center gap-3 mr-auto">
        <div className="text-left leading-tight hidden sm:block">
          <p className="text-xs font-semibold text-[#121926]">{userName}</p>
          <p className="text-[10px] text-[#697586]">
            {ROLE_LABELS[userRole as keyof typeof ROLE_LABELS]?.ar ?? userRole}
          </p>
        </div>
        <button
          onClick={logout}
          className="p-2 rounded-[8px] text-[#697586] hover:text-[#fb323f] hover:bg-[#feecee]"
          title="تسجيل الخروج"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
