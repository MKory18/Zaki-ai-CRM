'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useApp } from '@/context/AppContext';
import clsx from 'clsx';
import { Clock, ShieldX, LogOut, RefreshCw, MailCheck } from 'lucide-react';

export function PendingScreen() {
  const { currentUser, refreshUser } = useApp();
  const [checking, setChecking] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-600/10 border border-red-500/30 flex items-center justify-center">
          <Clock className="w-8 h-8 text-red-500" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-white">الحساب بانتظار موافقة المدير</h1>
          <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
            تم إنشاء حسابك بنجاح <strong className="text-red-400">{currentUser?.email}</strong>
            <br />
            وهو الآن بانتظار موافقة المدير. سيتم منحك صلاحيات الوصول بعد أن يقوم المدير
            بتعيين دور حسابك وتنشيطه.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-500 space-y-1">
          <p className="flex items-center justify-center space-x-2 rtl:space-x-reverse text-zinc-300">
            <MailCheck className="w-4 h-4 text-red-500" />
            <span>حالتك الحالية: قيد المراجعة (PENDING)</span>
          </p>
          <p>لن تتمكن من الوصول للطلبات أو العملاء أو المنتجات أو التقارير حتى يتم تنشيط حسابك.</p>
        </div>

        <div className="flex items-center justify-center space-x-3 rtl:space-x-reverse">
          <button
            onClick={async () => {
              setChecking(true);
              await refreshUser();
              setChecking(false);
              window.location.reload();
            }}
            className="inline-flex items-center space-x-2 rtl:space-x-reverse px-4 py-2 text-sm font-medium rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span>تحديث الحالة</span>
          </button>
          <button
            onClick={handleLogout}
            className="inline-flex items-center space-x-2 rtl:space-x-reverse px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockedScreen({ status }: { status: string }) {
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-600/10 border border-red-500/30 flex items-center justify-center">
          <ShieldX className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">
            {status === 'SUSPENDED' ? 'تم إيقاف حسابك مؤقتاً' : 'تم تعطيل حسابك'}
          </h1>
          <p className="text-sm text-zinc-400 mt-3">
            يرجى التواصل مع مدير النظام لاستعادة الوصول إلى حسابك.
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center space-x-2 rtl:space-x-reverse px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isRtl, currentUser } = useApp();

  // Server-enforced account states rendered for every protected module page
  if (currentUser && currentUser.status === 'PENDING') {
    return <PendingScreen />;
  }
  if (currentUser && (currentUser.status === 'SUSPENDED' || currentUser.status === 'DISABLED')) {
    return <BlockedScreen status={currentUser.status} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div
        className={clsx(
          'flex-1 flex flex-col min-w-0 transition-all duration-200',
          isRtl ? 'md:mr-64' : 'md:ml-64'
        )}
      >
        <Header onMenuClick={() => setMobileOpen(true)} />

        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
